const crypto = require('node:crypto')
const bcrypt = require('bcrypt')
const { db } = require('../config/db')
const { getUserAccess } = require('./access')
const { getEmployee, getLoginAccount } = require('./emis')
const { HttpError } = require('./nominations')

const HOUR_MS = 60 * 60 * 1000
const SESSION_MS = 12 * HOUR_MS
const REMEMBER_MS = 30 * 24 * HOUR_MS
const MAX_FAILED_ATTEMPTS = 5
const LOCK_MS = 15 * 60 * 1000
const INVALID_CREDENTIALS = 'Invalid username or password.'
const EMIS_UNREACHABLE = 'Cannot reach EMIS to check your sign-in right now. Please try again in a moment.'
const BUILT_IN_ADMIN_ID = 'builtin-admin'
const PLACEHOLDER_PASSWORD = 'change-me'

// Compared when an account does not exist, so a wrong username takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10)
const failedAttempts = new Map()

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// EMIS shares PRAISE's MySQL server, so a dropped connection or a missing EMIS database means
// the user directory cannot be read. These are not wrong passwords, so they do not lock the account.
function isEmisUnreachable(error) {
  return (
    error.fatal === true ||
    ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'ER_BAD_DB_ERROR'].includes(
      error.code,
    )
  )
}

function sameSecret(a, b) {
  return crypto.timingSafeEqual(Buffer.from(hashToken(a)), Buffer.from(hashToken(b)))
}

// The owner's account, set in backend/.env so it never reaches the browser. It stays off until
// real values are set, and a matching username with another password still falls through to EMIS.
function isBuiltInAdmin(username, password) {
  const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env
  if (!ADMIN_USERNAME?.trim() || !ADMIN_PASSWORD || ADMIN_PASSWORD === PLACEHOLDER_PASSWORD) return false
  return sameSecret(username.toLowerCase(), ADMIN_USERNAME.trim().toLowerCase()) && sameSecret(password, ADMIN_PASSWORD)
}

function assertNotLocked(key) {
  const attempt = failedAttempts.get(key)
  if (!attempt) return
  if (Date.now() > attempt.resetAt) {
    failedAttempts.delete(key)
  } else if (attempt.count >= MAX_FAILED_ATTEMPTS) {
    throw new HttpError(429, 'Too many failed attempts. Please try again in 15 minutes.')
  }
}

function recordFailure(key) {
  const attempt = failedAttempts.get(key) ?? { count: 0, resetAt: Date.now() + LOCK_MS }
  failedAttempts.set(key, { ...attempt, count: attempt.count + 1 })
}

async function checkEmisPassword(identifier, password) {
  const account = await getLoginAccount(identifier)
  const isMatch = await bcrypt.compare(password, account?.password ?? DUMMY_HASH)
  return account && isMatch ? account.user_id : null
}

async function login({ username, password, remember }) {
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
    throw new HttpError(400, 'Enter your username and password.')
  }

  const identifier = username.trim()
  const key = identifier.toLowerCase()
  assertNotLocked(key)

  let employeeId
  try {
    // The built-in Admin is checked first and never touches EMIS, so the owner can still sign in
    // when EMIS is down.
    employeeId = isBuiltInAdmin(identifier, password)
      ? BUILT_IN_ADMIN_ID
      : await checkEmisPassword(identifier, password)
  } catch (error) {
    if (isEmisUnreachable(error)) throw new HttpError(503, EMIS_UNREACHABLE)
    throw error
  }
  if (!employeeId) {
    recordFailure(key)
    throw new HttpError(401, INVALID_CREDENTIALS)
  }
  failedAttempts.delete(key)

  const token = crypto.randomBytes(32).toString('hex')
  const durationMs = remember ? REMEMBER_MS : SESSION_MS
  await db.query('DELETE FROM praise_sessions WHERE expires_at < NOW()')
  await db.query('INSERT INTO praise_sessions (token_hash, employee_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))', [
    hashToken(token),
    employeeId,
    durationMs / 1000,
  ])

  return { token, maxAge: remember ? durationMs : undefined }
}

// Permissions are read on every request, so Access Management changes apply straight away.
async function getSessionUser(token) {
  if (!token) return null

  const [[session]] = await db.query(
    'SELECT employee_id FROM praise_sessions WHERE token_hash = ? AND expires_at > NOW()',
    [hashToken(token)],
  )
  if (!session) return null

  // Has no EMIS record or Access Management entry, so its access cannot be edited or removed.
  if (session.employee_id === BUILT_IN_ADMIN_ID) {
    if (!process.env.ADMIN_USERNAME?.trim() || !process.env.ADMIN_PASSWORD) return null
    return {
      id: BUILT_IN_ADMIN_ID,
      name: 'System Administrator',
      position_title: null,
      role_name: 'Admin',
      role_code: 'admin',
      is_admin: true,
      permissions: [],
    }
  }

  const employee = await getEmployee(session.employee_id)
  if (!employee?.is_active) return null

  return {
    id: employee.id,
    name: employee.name,
    position_title: employee.position_title,
    ...(await getUserAccess(employee)),
  }
}

async function logout(token) {
  if (token) await db.query('DELETE FROM praise_sessions WHERE token_hash = ?', [hashToken(token)])
}

module.exports = { getSessionUser, login, logout }
