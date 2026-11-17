// LOCAL TESTING ONLY. Fills the EMIS IPCR tables and praise_employee_ratings with made-up ratings
// for every user, so the nomination eligibility check has something to read. This is the one
// script that writes to EMIS tables, and only because the local copy's IPCR tables are empty.
//
// The ratings are fake and decide whether a nominee is eligible, so they must never reach a real
// database: the script refuses to run against anything but localhost. Run again to regenerate.
// Every row is marked (see the SAMPLE constants), and --remove deletes only marked rows.
//
// Usage: npm run seed-ipcr-sample
//        npm run seed-ipcr-sample -- --remove
const crypto = require('node:crypto')
const path = require('node:path')
const mysql = require('mysql2/promise')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

const SAMPLE_ACTION = 'sample_seed'
const SAMPLE_PREFIX = 'SAMPLE'
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1']

// Oldest first. The oldest period is there to show that only the last 2 count.
const PERIODS = [
  { label: 'Jan-Jun 2025', start: '2025-01-01', end: '2025-06-30' },
  { label: 'Jul-Dec 2025', start: '2025-07-01', end: '2025-12-31' },
  { label: 'Jan-Jun 2026', start: '2026-01-01', end: '2026-06-30' },
]

// Each score sits far enough inside its band that the +/-0.2 noise below cannot change the label.
// PERFECT is an exact 5.00, so it gets no noise.
const SCORES = { PERFECT: 5, O: 4.7, VS: 4.0, S: 3.1 }
const LABELS = { PERFECT: 'Outstanding', O: 'Outstanding', VS: 'Very Satisfactory', S: 'Satisfactory' }

const TARGET_OUTPUTS = ['Core function output', 'Strategic function output', 'Support function output']

// Users who need specific ratings for testing, per period, oldest first.
const RATING_OVERRIDES = {
  349: ['PERFECT', 'PERFECT', 'PERFECT'],
}

// A stable number from 0 to 99, so a rerun gives each user the same ratings.
function stableNumber(text) {
  return crypto.createHash('sha256').update(text).digest().readUInt32BE(0) % 100
}

// Ratings per period, oldest first. Roughly 80% of users pass and 20% fail on the last 2 periods.
function ratingsFor(userId) {
  if (RATING_OVERRIDES[userId]) return RATING_OVERRIDES[userId]

  const profile = stableNumber(userId)
  const oldest = stableNumber(`${userId}:oldest`) < 25 ? 'S' : 'VS'
  if (profile < 25) return [oldest, 'O', 'O']
  if (profile < 55) return [oldest, 'VS', 'VS']
  if (profile < 80) return [oldest, 'VS', 'O']
  return [oldest, 'VS', 'S']
}

function round(value) {
  return Number(value.toFixed(2))
}

function buildItem(userId, period, itemIndex, score) {
  const [quality, efficiency, timeliness] = ['q', 'e', 't'].map((dimension) => {
    if (score === SCORES.PERFECT) return score
    const noise = (stableNumber(`${userId}:${period.end}:${itemIndex}:${dimension}`) - 50) / 250
    return round(Math.min(5, score + noise))
  })
  return { quality, efficiency, timeliness, average: round((quality + efficiency + timeliness) / 3) }
}

async function removeSample(connection) {
  const [forms] = await connection.query(
    `DELETE f FROM ipcr_forms f
     JOIN ipcr_audit_logs l ON l.ipcr_id = f.id AND l.action = ?`,
    [SAMPLE_ACTION],
  )
  const [ratings] = await connection.query('DELETE FROM praise_employee_ratings WHERE rating_period LIKE ?', [
    `${SAMPLE_PREFIX} %`,
  ])
  return { forms: forms.affectedRows, ratings: ratings.affectedRows }
}

async function seedSample(connection) {
  const [users] = await connection.query('SELECT DISTINCT user_id FROM users WHERE user_id IS NOT NULL')
  const rows = users.flatMap(({ user_id: userId }) => {
    const ratings = ratingsFor(userId)
    return PERIODS.map((period, index) => ({ userId, period, rating: ratings[index] }))
  })

  // Plain INSERTs: a real form or rating for the same period fails the run and rolls it back.
  const [result] = await connection.query(
    'INSERT INTO ipcr_forms (user_id, period_start, period_end, status, submitted_at) VALUES ?',
    [rows.map(({ userId, period }) => [userId, period.start, period.end, 'approved', `${period.end} 08:00:00`])],
  )
  // InnoDB's default lock mode gives one bulk INSERT consecutive ids, but look them up to be safe.
  const [forms] = await connection.query('SELECT id, user_id, period_end FROM ipcr_forms WHERE id >= ?', [result.insertId])
  const formIds = new Map(forms.map((form) => [`${form.user_id}:${form.period_end}`, form.id]))

  const items = []
  const approvals = []
  const logs = []
  const praiseRatings = []
  for (const { userId, period, rating } of rows) {
    const formId = formIds.get(`${userId}:${period.end}`)
    const built = TARGET_OUTPUTS.map((output, index) => {
      const item = buildItem(userId, period, index, SCORES[rating])
      items.push([
        formId,
        index,
        `[${SAMPLE_PREFIX}] ${output}`,
        `[${SAMPLE_PREFIX}] Delivered on target for ${period.label}`,
        `[${SAMPLE_PREFIX}] Test accomplishment, not a real record`,
        item.quality,
        item.efficiency,
        item.timeliness,
        item.average,
      ])
      return item
    })
    for (const step of ['verification', 'approval']) {
      approvals.push([formId, step, SAMPLE_PREFIX, 'approved', `${SAMPLE_PREFIX} data, not a real approval`])
    }
    logs.push([formId, SAMPLE_PREFIX, SAMPLE_ACTION, JSON.stringify({ rating: LABELS[rating] })])
    praiseRatings.push([
      userId,
      `${SAMPLE_PREFIX} ${period.label}`,
      period.end,
      round(built.reduce((total, item) => total + item.average, 0) / built.length),
      LABELS[rating],
    ])
  }

  await connection.query(
    `INSERT INTO ipcr_target_items
       (ipcr_id, sort_order, output, success_indicator, actual_accomplishment,
        quality_rating, efficiency_rating, timeliness_rating, average_rating)
     VALUES ?`,
    [items],
  )
  await connection.query('INSERT INTO ipcr_approvals (ipcr_id, step, approver_id, action, remarks) VALUES ?', [approvals])
  await connection.query('INSERT INTO ipcr_audit_logs (ipcr_id, user_id, action, details) VALUES ?', [logs])
  await connection.query(
    'INSERT INTO praise_employee_ratings (employee_id, rating_period, period_end, rating_score, rating_label) VALUES ?',
    [praiseRatings],
  )
  return { users: users.length, forms: rows.length, items: items.length, ratings: praiseRatings.length }
}

async function main() {
  if (process.env.NODE_ENV === 'production' || !LOCAL_HOSTS.includes(process.env.DB_HOST)) {
    throw new Error(`Refusing to write sample ratings to "${process.env.DB_HOST}": this script is for a local database only.`)
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || process.env.EMIS_DB_NAME,
    dateStrings: true,
  })

  try {
    await connection.beginTransaction()
    const removed = await removeSample(connection)
    console.log(`Removed sample data: ${removed.forms} IPCR forms, ${removed.ratings} PRAISE ratings.`)
    if (!process.argv.includes('--remove')) {
      const added = await seedSample(connection)
      console.log(`Added sample data for ${added.users} users: ${added.forms} IPCR forms, ${added.items} target items, ${added.ratings} PRAISE ratings.`)
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    await connection.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
