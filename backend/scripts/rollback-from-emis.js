// Removes the praise_* tables from the shared EMIS database (DB_NAME). It never touches any EMIS
// table. After this, revert the code (git) and point PRAISE back at its old schema (PRAISE_DB_NAME),
// which the migration left untouched as the data source. Safe to run more than once.
//
// Usage: npm run rollback
const path = require('node:path')
const mysql = require('mysql2/promise')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

const TARGET = process.env.DB_NAME || process.env.EMIS_DB_NAME || 'emis'

// Reverse foreign-key order (children before parents).
const PRAISE_TABLES = [
  'praise_coh_choices',
  'praise_sessions',
  'praise_setup_steps',
  'praise_nomination_documents',
  'praise_nomination_members',
  'praise_nominations',
  'praise_employee_ratings',
  'praise_user_permission_overrides',
  'praise_user_access',
  'praise_role_permissions',
  'praise_access_roles',
  'praise_award_category_tiers',
  'praise_award_categories',
  'praise_award_cycles',
]

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })
  await c.query(`USE \`${TARGET}\``)

  // Guard: refuse to run anywhere that is not clearly the EMIS database.
  const [[{ n }]] = await c.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'", [TARGET])
  if (n === 0) throw new Error(`"${TARGET}" has no users table, so it is not the EMIS database. Aborting.`)

  await c.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const table of PRAISE_TABLES) {
    await c.query(`DROP TABLE IF EXISTS \`${table}\``)
    console.log(`dropped ${table}`)
  }
  await c.query('SET FOREIGN_KEY_CHECKS = 1')

  console.log(`\nRemoved all praise_* tables from "${TARGET}". EMIS tables were not touched.`)
  console.log('Next: revert the PRAISE code (git) and set the app back to its old schema if you kept one.')
  await c.end()
}

main().catch((error) => {
  console.error('Rollback failed:', error.message)
  process.exit(1)
})
