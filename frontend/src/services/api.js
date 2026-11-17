const SERVER_DOWN = 'Cannot reach the PRAISE server. Check that the backend is running.'

// Where the API lives. Empty (the default) means same origin, so requests go to /api and the
// Vite dev proxy forwards them to the backend. Set VITE_API_URL to the backend's URL
// (for example http://192.168.0.5:5050) to call it directly instead of through the proxy.
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

let onSessionExpired = null

// The sign-in token lives in sessionStorage, which belongs to one tab, so each tab can be signed
// in as a different account. With "remember me" it is also kept in localStorage, only to sign in
// tabs opened later that have no token of their own yet.
const TOKEN_KEY = 'praise.token'
const REMEMBERED_KEY = 'praise.rememberedToken'

function safeStorage(storage, action) {
  try {
    return action(storage)
  } catch {
    return null
  }
}

function getToken() {
  const own = safeStorage(sessionStorage, (s) => s.getItem(TOKEN_KEY))
  if (own) return own
  const remembered = safeStorage(localStorage, (s) => s.getItem(REMEMBERED_KEY))
  if (remembered) safeStorage(sessionStorage, (s) => s.setItem(TOKEN_KEY, remembered))
  return remembered
}

function setToken(token, remember) {
  safeStorage(sessionStorage, (s) => s.setItem(TOKEN_KEY, token))
  if (remember) safeStorage(localStorage, (s) => s.setItem(REMEMBERED_KEY, token))
}

function clearToken() {
  const token = safeStorage(sessionStorage, (s) => s.getItem(TOKEN_KEY))
  safeStorage(sessionStorage, (s) => s.removeItem(TOKEN_KEY))
  // Forget the remembered token only if it is this tab's, so other tabs' accounts are untouched.
  if (token && safeStorage(localStorage, (s) => s.getItem(REMEMBERED_KEY)) === token) {
    safeStorage(localStorage, (s) => s.removeItem(REMEMBERED_KEY))
  }
}

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler
}

// details: the rest of the server's error body (for example { reason: 'cycle_open', open_cycles }).
class ApiError extends Error {
  constructor(status, message, details = {}) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function request(path, options) {
  let response
  try {
    const token = getToken()
    const headers = { ...options?.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    response = await fetch(`${API_BASE}/api${path}`, { ...options, headers })
  } catch {
    throw new ApiError(0, SERVER_DOWN)
  }

  if (response.status === 204) return null

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      clearToken()
      if (!path.startsWith('/auth/')) onSessionExpired?.()
    }
    throw new ApiError(response.status, body?.message ?? SERVER_DOWN, body ?? {})
  }
  return body
}

function sendJson(method, path, data) {
  return request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function login(data) {
  const { token } = await sendJson('POST', '/auth/login', data)
  setToken(token, Boolean(data.remember))
}

export async function logout() {
  try {
    await request('/auth/logout', { method: 'POST' })
  } finally {
    clearToken()
  }
}
export const getMe = () => request('/auth/me')

export const listEmployees = () => request('/employees')
export const listAllEmployees = () => request('/employees?include_inactive=1')
export const listSections = () => request('/sections')
// The nominee's immediate supervisor(s) on record in EMIS.
export function listSupervisors({ employeeId, sectionId }) {
  const query = new URLSearchParams(employeeId ? { employee_id: employeeId } : { section_id: sectionId })
  return request(`/supervisors?${query}`)
}
export const getNomineesPerCategory = () => request('/dashboard/nominees-per-category')
export const listCycles = () => request('/cycles')
export const createCycle = (data) => sendJson('POST', '/cycles', data)
export const updateCycle = (id, data) => sendJson('PUT', `/cycles/${id}`, data)
export const listCategories = () => request('/categories')
export const listCategoriesWithInactive = () => request('/categories?include_inactive=1')
export const createCategory = (data) => sendJson('POST', '/categories', data)
export const updateCategory = (id, data) => sendJson('PUT', `/categories/${id}`, data)
export const saveCategoryOrder = (ids) => sendJson('PUT', '/categories/order', { ids })
export const setCategoryActive =(id, isActive) => sendJson('PATCH', `/categories/${id}`, { is_active: isActive })

export const listNominations = () => request('/nominations')
// The Nominations page lists only the signed-in user's own nominations.
export const listMyNominations = () => request('/nominations?mine=1')
export const getNomination = (id) => request(`/nominations/${id}`)
export const createNomination = (data) => sendJson('POST', '/nominations', data)
export const updateNomination = (id, data) => sendJson('PUT', `/nominations/${id}`, data)

export function checkEligibility(params) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null),
  )
  return request(`/eligibility?${query}`)
}

export function uploadDocument(nominationId, file, criterion) {
  const body = new FormData()
  body.append('file', file)
  const query = criterion ? `?criterion=${encodeURIComponent(criterion)}` : ''
  return request(`/nominations/${nominationId}/documents${query}`, { method: 'POST', body })
}

export const deleteDocument = (nominationId, documentId) =>
  request(`/nominations/${nominationId}/documents/${documentId}`, { method: 'DELETE' })

export const reviewDocument = (nominationId, documentId, data) =>
  sendJson('PATCH', `/nominations/${nominationId}/documents/${documentId}`, data)
export const validateNomination = (id) => sendJson('POST', `/nominations/${id}/validate`, {})
export const disqualifyNomination = (id, data) => sendJson('POST', `/nominations/${id}/disqualify`, data)

export const listCommittee = (cycleId) => request(`/committee?cycle_id=${cycleId}`)
export const addCommitteeMember = (data) => sendJson('POST', '/committee', data)
export const relieveCommitteeMember = (id, reason) => sendJson('POST', `/committee/${id}/relieve`, { reason })
export const removeCommitteeMember = (id) => request(`/committee/${id}`, { method: 'DELETE' })

export const getScreening = (cycleId) => request(`/screening?cycle_id=${cycleId}`)
export const saveScreeningScore = (nominationId, scores, remarks) =>
  sendJson('PUT', `/screening/${nominationId}/score`, { scores, remarks })
export const finalizeScreening = (data) => sendJson('POST', '/screening/finalize', data)

export const getEndorsement = (cycleId) => request(`/endorsement?cycle_id=${cycleId}`)
export const endorseAward = (data) => sendJson('POST', '/endorsement/endorse', data)
export const withdrawEndorsement = (data) => sendJson('POST', '/endorsement/withdraw', data)
export const recordConferment = (data) => sendJson('PUT', '/endorsement/conferment', data)

export const getCohApproval = (cycleId) => request(`/coh?cycle_id=${cycleId}`)
export const selectAwardWinner = (nominationId) => sendJson('POST', `/coh/nominations/${nominationId}/select`, {})
export const listCohChoiceCandidates = () => request('/coh/choice-candidates')
export const saveCohChoice = (data) => sendJson('POST', '/coh/choices', data)

// Plain links cannot send headers, so the tab's token goes in the query string.
export const documentUrl = (documentId) =>
  `${API_BASE}/api/documents/${documentId}/file?token=${encodeURIComponent(getToken() ?? '')}`

// Branding (Settings > System Settings), shared with EMIS. Reading it is public so the login
// page can use it.
export const getBranding = () => request('/branding')
export const saveBrandingTexts = (data) => sendJson('PUT', '/system-settings/texts', data)
export function uploadLogo(slot, file) {
  const body = new FormData()
  body.append('file', file)
  return request(`/system-settings/logos/${slot}`, { method: 'POST', body })
}
export const removeLogo = (slot) => request(`/system-settings/logos/${slot}`, { method: 'DELETE' })
// Public image; the version busts the browser cache after the logo changes.
export const logoUrl = (slot, version) => `${API_BASE}/api/branding/logos/${slot}?v=${version}`

export const getAccess = () => request('/access')
export const saveRolePermissions = (roleId, permissions) =>
  sendJson('PUT', `/access/roles/${roleId}`, { permissions })
export const saveUserAccess = (employeeId, data) =>
  sendJson('PUT', `/access/users/${encodeURIComponent(employeeId)}`, data)

// Notifications (the bell in the header). Each user sees only their own.
export const listNotifications = (before) => request(`/notifications${before ? `?before=${before}` : ''}`)
export const getUnreadNotificationCount = () => request('/notifications/unread-count')
export const markNotificationRead = (id) => sendJson('POST', `/notifications/${id}/read`, {})
export const markAllNotificationsRead = () => sendJson('POST', '/notifications/read-all', {})
export const deleteNotification = (id) => request(`/notifications/${id}`, { method: 'DELETE' })

// Records and Reports.
export const getRecords = (cycleId) => request(`/records?cycle_id=${cycleId}`)
export const recordRelease = (data) => sendJson('PUT', '/records/release', data)
export const getReport = (cycleId) => request(`/reports?cycle_id=${cycleId}`)
