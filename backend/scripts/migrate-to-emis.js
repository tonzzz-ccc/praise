// Copies PRAISE data from its old separate schema (PRAISE_DB_NAME, e.g. "praise") into the
// shared EMIS database (DB_NAME, e.g. "emis") as praise_* tables. Safe to run more than once:
// it only ensures the tables exist and inserts rows that are not already there (INSERT IGNORE).
// It never changes or deletes anything in the source schema, so the old schema stays as a backup.
//
// Usage: npm run migrate     (reads backend/.env)
const fs = require('node:fs')
const path = require('node:path')
const mysql = require('mysql2/promise')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

const SOURCE = process.env.PRAISE_DB_NAME || 'praise'
const TARGET = process.env.DB_NAME || process.env.EMIS_DB_NAME || 'emis'

// Old table name -> new praise_ table name, in an order that respects foreign keys (parents first).
const TABLES = [
  ['award_cycles', 'praise_award_cycles'],
  ['award_categories', 'praise_award_categories'],
  ['award_category_tiers', 'praise_award_category_tiers'],
  ['access_roles', 'praise_access_roles'],
  ['role_permissions', 'praise_role_permissions'],
  ['user_access', 'praise_user_access'],
  ['user_permission_overrides', 'praise_user_permission_overrides'],
  ['employee_ratings', 'praise_employee_ratings'],
  ['nominations', 'praise_nominations'],
  ['nomination_members', 'praise_nomination_members'],
  ['nomination_documents', 'praise_nomination_documents'],
  ['setup_steps', 'praise_setup_steps'],
  ['sessions', 'praise_sessions'],
]

// Columns that point at an EMIS record, so the migration can report rows that cannot be matched.
const EMPLOYEE_REFS = {
  praise_employee_ratings: [['employee_id', 'users', 'user_id']],
  praise_user_access: [['employee_id', 'users', 'user_id']],
  praise_user_permission_overrides: [['employee_id', 'users', 'user_id']],
  praise_nomination_members: [['employee_id', 'users', 'user_id']],
  praise_nominations: [['employee_id', 'users', 'user_id'], ['section_id', 'reference_sections', 'id']],
}

async function schemaExists(c, name) {
  const [[row]] = await c.query('SELECT COUNT(*) AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [name])
  return row.n > 0
}

async function tableExists(c, schema, table) {
  const [[row]] = await c.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [schema, table])
  return row.n > 0
}

async function commonColumns(c, source, target, oldTable, newTable) {
  const [rows] = await c.query(
    `SELECT s.COLUMN_NAME FROM information_schema.COLUMNS s
     JOIN information_schema.COLUMNS t ON t.COLUMN_NAME = s.COLUMN_NAME
     WHERE s.TABLE_SCHEMA = ? AND s.TABLE_NAME = ? AND t.TABLE_SCHEMA = ? AND t.TABLE_NAME = ?`,
    [source, oldTable, target, newTable],
  )
  return rows.map((r) => r.COLUMN_NAME)
}

async function count(c, schema, table) {
  const [[row]] = await c.query(`SELECT COUNT(*) AS n FROM \`${schema}\`.\`${table}\``)
  return row.n
}

// Rows in the source whose employee/section does not exist in EMIS; these cannot be migrated.
async function reportUnmatched(c, oldTable, newTable) {
  const refs = EMPLOYEE_REFS[newTable]
  if (!refs) return 0
  let unmatched = 0
  for (const [col, refTable, refCol] of refs) {
    const collate = refTable === 'users' ? 'COLLATE utf8mb4_general_ci' : ''
    const [[row]] = await c.query(
      `SELECT COUNT(*) AS n FROM \`${SOURCE}\`.\`${oldTable}\` s
       WHERE s.\`${col}\` IS NOT NULL
         AND (s.\`${col}\` ${collate}) NOT IN (SELECT \`${refCol}\` FROM \`${TARGET}\`.\`${refTable}\`)`,
    )
    if (row.n > 0) {
      unmatched += row.n
      console.log(`  ! ${oldTable}: ${row.n} row(s) reference a ${refTable}.${refCol} not in EMIS; they will be skipped.`)
    }
  }
  return unmatched
}

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  })

  if (!(await schemaExists(c, TARGET))) {
    throw new Error(`Target database "${TARGET}" does not exist. It must be the EMIS database.`)
  }
  if (!(await tableExists(c, TARGET, 'users'))) {
    throw new Error(`"${TARGET}" has no users table, so it is not the EMIS database. Check DB_NAME in .env.`)
  }

  // 1. Make sure the praise_* tables exist in the EMIS database (idempotent).
  await c.query(`USE \`${TARGET}\``)
  await c.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'praise_schema.sql'), 'utf8'))
  console.log(`Ensured praise_* tables in "${TARGET}".`)

  const hasSource = await schemaExists(c, SOURCE)
  if (!hasSource) {
    console.log(`No old PRAISE schema "${SOURCE}" to copy from; the tables are ready and empty of migrated data.`)
  } else {
    console.log(`\nCopying data from "${SOURCE}" -> "${TARGET}" (INSERT IGNORE):`)
    for (const [oldTable, newTable] of TABLES) {
      if (!(await tableExists(c, SOURCE, oldTable))) continue
      await reportUnmatched(c, oldTable, newTable)
      const cols = await commonColumns(c, SOURCE, TARGET, oldTable, newTable)
      if (cols.length === 0) continue
      const list = cols.map((col) => `\`${col}\``).join(', ')
      const [result] = await c.query(
        `INSERT IGNORE INTO \`${TARGET}\`.\`${newTable}\` (${list}) SELECT ${list} FROM \`${SOURCE}\`.\`${oldTable}\``,
      )
      console.log(`  ${oldTable.padEnd(26)} -> ${newTable.padEnd(32)} inserted ${result.affectedRows}`)
    }
  }

  // 2. Verify: row counts and referential integrity.
  console.log('\nVerification (source -> target):')
  let problems = 0
  for (const [oldTable, newTable] of TABLES) {
    const src = hasSource && (await tableExists(c, SOURCE, oldTable)) ? await count(c, SOURCE, oldTable) : null
    const tgt = await count(c, TARGET, newTable)
    const note = src === null ? '' : src === tgt ? 'ok' : `source ${src}, target ${tgt} (difference usually = rows skipped as unmatched)`
    if (src !== null && src !== tgt) problems += 1
    console.log(`  ${newTable.padEnd(32)} target=${String(tgt).padEnd(5)} ${note}`)
  }

  const [[{ n: orphanNoms }]] = await c.query(
    `SELECT COUNT(*) AS n FROM \`${TARGET}\`.praise_nominations n
     WHERE (n.employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM \`${TARGET}\`.users u WHERE u.user_id = n.employee_id))
        OR (n.section_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM \`${TARGET}\`.reference_sections s WHERE s.id = n.section_id))`,
  )
  console.log(`\nReferential integrity: praise_nominations with a missing EMIS employee/section = ${orphanNoms} (foreign keys keep this at 0).`)
  console.log(problems === 0 ? '\nMigration complete. Row counts match (any difference is reported unmatched rows).' : `\nMigration finished with ${problems} table(s) showing a count difference - review the notes above.`)

  await c.end()
}

main().catch((error) => {
  console.error('Migration failed:', error.message)
  process.exit(1)
})
