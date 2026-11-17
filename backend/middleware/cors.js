// Cross-origin access for the API. With the Vite dev proxy the browser is same-origin, so this
// does nothing; it only matters when the frontend calls the backend directly from another origin
// (a different host or port). Allowed origins come from CORS_ORIGINS in .env (comma-separated).
// The exact origin is reflected back, never a wildcard, because the session cookie is sent with
// credentials and browsers reject "*" together with credentials.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function cors(req, res, next) {
  const { origin } = req.headers

  // Every response varies by Origin, so caches do not mix allowed and disallowed answers.
  res.setHeader('Vary', 'Origin')

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '600')
  }

  // Answer the preflight here so it never reaches the auth check. Without the headers above
  // (a disallowed origin) the browser blocks the real request, which is what we want.
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  return next()
}

module.exports = { cors }
