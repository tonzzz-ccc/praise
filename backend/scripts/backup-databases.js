// Backs up both databases with mysqldump before the migration. Writes timestamped .sql files
// into backend/backups/. Safe to run any time; it only reads.
//
// Usage: npm run backup-db
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const mysql = require('mysql2/promise')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

const MYSQLDUMP = process.env.MYSQLDUMP || 'C:\\Program Files\\MySQL\\MySQL Server 9.7\\bin\\mysqldump.exe'
const TARGET = process.env.DB_NAME || process.env.EMIS_DB_NAME || 'emis'
const SOURCE = process.env.PRAISE_DB_NAME || 'praise'
const OUT_DIR = path.join(__dirname, '..', 'backups')

async function schemaExists(name) {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD })
  const [[row]] = await c.query('SELECT COUNT(*) AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [name])
  await c.end()
  return row.n > 0
}

function dump(dbName, stamp) {
  const file = path.join(OUT_DIR, `${dbName}_${stamp}.sql`)
  const args = [
    '-h', process.env.DB_HOST || 'localhost',
    '-u', process.env.DB_USER,
    '--single-transaction', '--routines', '--events', '--databases', dbName,
    '--result-file', file,
  ]
  // MYSQL_PWD keeps the password off the command line.
  execFileSync(MYSQLDUMP, args, { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, stdio: 'inherit' })
  const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(1)
  console.log(`  backed up ${dbName} -> ${file} (${mb} MB)`)
}

async function main() {
  if (!fs.existsSync(MYSQLDUMP)) {
    throw new Error(`mysqldump not found at "${MYSQLDUMP}". Set MYSQLDUMP in backend/.env.`)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  console.log('Backing up databases before migration:')
  for (const dbName of [...new Set([TARGET, SOURCE])]) {
    if (await schemaExists(dbName)) dump(dbName, stamp)
    else console.log(`  (skipped ${dbName}: does not exist)`)
  }
  console.log('\nBackups done. Keep these files until the migration is verified.')
}

main().catch((error) => {
  console.error('Backup failed:', error.message)
  process.exit(1)
})
