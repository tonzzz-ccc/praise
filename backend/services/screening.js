const { db } = require('../config/db')
const {
  CRITERIA_KEYS,
  HttpError,
  addNames,
  getNominationRow,
  isOwnNomination,
  loadLookups,
} = require('./nominations')

// Nominations the committee screens, and the ones it has already decided (including those since
// endorsed to the Chief of Hospital), so the screening record stays visible.
const SCREENED_STATUSES = ['validated', 'shortlisted', 'not_selected', 'endorsed', 'awarded']

// Rating matrix: each criterion is rated 0 (No evidence) to 4 (Exceptional evidence) and earns
// that share of its weight, e.g. 3 on a 30% criterion = 22.5%. The total is out of 100%.
const RATING_MAX = 4

function weightedTotal(scores, weights) {
  const total = CRITERIA_KEYS.reduce((sum, key) => sum + (Number(scores[key]) / RATING_MAX) * weights[key], 0)
  return Math.round(total * 100) / 100
}

const average = (values) =>
  values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100

// One award (and grant level, for awards like Dangal that rank each level separately).
const groupKey = (nomination) => `${nomination.category_id}:${nomination.tier_id ?? ''}`

async function getMyMembership(cycleId, actor) {
  const [[member]] = await db.query('SELECT * FROM praise_committee_members WHERE cycle_id = ? AND employee_id = ?', [
    cycleId,
    actor.id,
  ])
  return member ?? null
}

async function loadScores(nominationIds) {
  if (nominationIds.length === 0) return []
  const [rows] = await db.query(
    `SELECT s.*, c.employee_id, c.role FROM praise_screening_scores s
     JOIN praise_committee_members c ON c.id = s.committee_member_id
     WHERE s.nomination_id IN (?) ORDER BY FIELD(c.role, 'chair', 'secretariat', 'member'), c.id`,
    [nominationIds],
  )
  return rows
}

// Every member sees their own scores. Only someone allowed to see results (the Secretariat)
// sees everyone's scores, the averages and the ranking.
async function listScreening(cycleId, actor, canSeeResults) {
  const [[cycle]] = await db.query('SELECT id, name, status FROM praise_award_cycles WHERE id = ?', [cycleId])
  if (!cycle) throw new HttpError(404, 'Award cycle not found.')

  const membership = await getMyMembership(cycle.id, actor)
  const [rows] = await db.query('SELECT * FROM praise_nominations WHERE cycle_id = ? AND status IN (?) ORDER BY category_id, tier_id, id', [
    cycle.id,
    SCREENED_STATUSES,
  ])
  const [memberRows] = await db.query(
    "SELECT nomination_id, employee_id FROM praise_nomination_members WHERE nomination_id IN (?)",
    [rows.length ? rows.map((row) => row.id) : [0]],
  )
  const [[{ active }]] = await db.query(
    "SELECT COUNT(*) AS active FROM praise_committee_members WHERE cycle_id = ? AND status = 'active'",
    [cycle.id],
  )
  const lookups = await loadLookups()
  const scores = await loadScores(rows.map((row) => row.id))
  const nameOf = (employeeId) => lookups.names.get(employeeId) ?? employeeId

  const nominations = rows.map((row) => {
    const category = lookups.categories.get(row.category_id)
    const weights = category.criteria_weights
    const isOwn =
      row.employee_id === actor.id ||
      row.nominator_employee_id === actor.id ||
      memberRows.some((member) => member.nomination_id === row.id && member.employee_id === actor.id)
    const mine = membership && scores.find((score) => score.nomination_id === row.id && score.committee_member_id === membership.id)
    const all = scores.filter((score) => score.nomination_id === row.id)
    const { form_responses: responses, eligibility_snapshot: _snapshot, ...rest } = addNames(row, lookups)

    return {
      ...rest,
      group_key: groupKey(row),
      weights,
      justifications: Object.fromEntries(CRITERIA_KEYS.map((key) => [key, responses?.[key]?.justification ?? ''])),
      my_scores: mine?.scores ?? null,
      my_remarks: mine?.remarks ?? '',
      my_total: mine ? weightedTotal(mine.scores, weights) : null,
      can_score: Boolean(membership?.status === 'active' && row.status === 'validated' && !isOwn),
      is_own_nomination: isOwn,
      ...(canSeeResults && {
        scores: all.map((score) => ({
          committee_member_id: score.committee_member_id,
          name: nameOf(score.employee_id),
          role: score.role,
          scores: score.scores,
          remarks: score.remarks ?? '',
          total: weightedTotal(score.scores, weights),
        })),
        average: average(all.map((score) => weightedTotal(score.scores, weights))),
      }),
    }
  })

  if (canSeeResults) {
    for (const nomination of nominations) {
      const higher = nominations.filter(
        (other) => other.group_key === nomination.group_key && other.average !== null && other.average > (nomination.average ?? -1),
      )
      nomination.rank = nomination.average === null ? null : higher.length + 1
    }
  }

  return {
    cycle,
    membership: membership && { id: membership.id, role: membership.role, status: membership.status },
    active_members: Number(active),
    criteria: CRITERIA_KEYS,
    rating_max: RATING_MAX,
    nominations,
  }
}

function cleanScores(body) {
  const scores = Object.fromEntries(CRITERIA_KEYS.map((key) => [key, Number(body?.scores?.[key])]))
  if (Object.values(scores).some((score) => !Number.isInteger(score) || score < 0 || score > RATING_MAX)) {
    throw new HttpError(400, `Rate each criterion from 0 to ${RATING_MAX}.`)
  }
  return scores
}

// A member can change their scores until the Secretariat finalizes the award.
async function saveScore(nominationId, body, actor) {
  const scores = cleanScores(body)
  const remarks = String(body?.remarks ?? '').trim().slice(0, 2000) || null
  const nomination = await getNominationRow(nominationId)
  if (nomination.status !== 'validated') throw new HttpError(409, 'Screening for this nomination is already finished.')

  const membership = await getMyMembership(nomination.cycle_id, actor)
  if (!membership) throw new HttpError(403, 'Only members of this cycle\'s committee can score nominees.')
  if (membership.status !== 'active') throw new HttpError(403, 'You have been relieved from this cycle\'s committee.')
  if (await isOwnNomination(nomination, actor)) throw new HttpError(403, 'You cannot score a nomination you are part of.')

  await db.query(
    'INSERT INTO praise_screening_scores SET ? ON DUPLICATE KEY UPDATE scores = VALUES(scores), remarks = VALUES(remarks)',
    [{ nomination_id: nomination.id, committee_member_id: membership.id, scores: JSON.stringify(scores), remarks }],
  )
  return { scores, remarks: remarks ?? '' }
}

// Shortlists the top average in one award (and grant level); the rest are not selected.
// On a tie for first, the Secretariat names which of the tied nominees is shortlisted.
async function finalizeGroup(body, actor) {
  const cycleId = Number(body.cycle_id)
  const { nominations } = await listScreening(cycleId, actor, true)
  const group = nominations.filter((nomination) => nomination.group_key === body.group_key && nomination.status === 'validated')
  if (group.length === 0) throw new HttpError(409, 'There is nothing left to finalize for this award. Reload the page.')

  const unscored = group.filter((nomination) => nomination.average === null)
  if (unscored.length > 0) {
    throw new HttpError(400, `Not scored yet: ${unscored.map((nomination) => nomination.nominee_name).join(', ')}.`)
  }

  const tied = group.filter((nomination) => nomination.rank === 1)
  const winner = tied.length === 1 ? tied[0] : tied.find((nomination) => nomination.id === Number(body.winner_id))
  if (!winner) {
    throw new HttpError(409, `${tied.map((nomination) => nomination.nominee_name).join(' and ')} are tied for first. Choose who is shortlisted.`)
  }

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [result] = await connection.query(
      "UPDATE praise_nominations SET status = IF(id = ?, 'shortlisted', 'not_selected') WHERE id IN (?) AND status = 'validated'",
      [winner.id, group.map((nomination) => nomination.id)],
    )
    if (result.affectedRows !== group.length) throw new HttpError(409, 'This award changed while you were finalizing. Reload the page.')
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
  return listScreening(cycleId, actor, true)
}

module.exports = { average, finalizeGroup, listScreening, loadScores, saveScore, weightedTotal }
