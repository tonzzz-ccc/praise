const { hasPermission } = require('../services/access')
const { getSessionUser } = require('../services/auth')

// Each browser tab keeps its own token (sessionStorage) and sends it as a Bearer header, so two
// tabs can be signed in as different accounts. Plain download links cannot set headers, so GET
// requests may pass it as ?token= instead.
function getToken(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')
  if (match) return match[1]
  if (req.method === 'GET' && typeof req.query.token === 'string') return req.query.token
  return null
}

async function requireLogin(req, res, next) {
  req.user = await getSessionUser(getToken(req))
  if (!req.user) return res.status(401).json({ message: 'Please sign in.' })
  return next()
}

// Allows the request when the user has any one of the listed permissions.
function requirePermission(...keys) {
  return (req, res, next) => {
    if (keys.some((key) => hasPermission(req.user, key))) return next()
    return res.status(403).json({ message: "You don't have access to this." })
  }
}

module.exports = { getToken, requireLogin, requirePermission }
