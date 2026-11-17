const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const express = require('express')
const multer = require('multer')
const { getToken, requireLogin, requirePermission } = require('../middleware/auth')
const access = require('../services/access')
const auth = require('../services/auth')
const awarding = require('../services/awarding')
const committee = require('../services/committee')
const { listActiveEmployees, listAllEmployees, listImmediateSupervisors, listSections } = require('../services/emis')
const nominations = require('../services/nominations')
const notifications = require('../services/notifications')
const records = require('../services/records')
const screening = require('../services/screening')
const systemSettings = require('../services/systemSettings')

const router = express.Router()

const ALLOWED_UPLOAD_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
]

fs.mkdirSync(nominations.UPLOAD_DIR, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: nominations.UPLOAD_DIR,
    filename: (req, file, done) => done(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, done) => {
    if (ALLOWED_UPLOAD_TYPES.includes(file.mimetype)) return done(null, true)
    return done(new nominations.HttpError(400, 'Attach PDF, Word, Excel, JPG or PNG files only.'))
  },
})

// Logos are kept in memory and saved into the database as BLOBs (emis_agency_setup).
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, done) => {
    if (systemSettings.LOGO_TYPES.includes(file.mimetype)) return done(null, true)
    return done(new nominations.HttpError(400, 'Upload a PNG, JPG or WebP image.'))
  },
})

// The award cycle a page asks for (?cycle_id=). A missing or invalid one is a bad request, not
// a query for cycle "NaN".
function cycleIdFrom(req) {
  const cycleId = Number(req.query.cycle_id)
  if (!Number.isInteger(cycleId) || cycleId <= 0) throw new nominations.HttpError(400, 'Select an award cycle.')
  return cycleId
}

// Public: the login page shows the branding before anyone signs in, and a plain <img> cannot
// send a sign-in header.
router.get('/branding', async (req, res) => {
  res.json(await systemSettings.getBranding())
})

router.get('/branding/logos/:slot', async (req, res) => {
  const { data, mime } = await systemSettings.getLogo(req.params.slot)
  // The URL carries the logo's version, so a cached copy is never stale.
  res.set({ 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' })
  res.send(data)
})

router.post('/auth/login', async (req, res) => {
  const { token, maxAge } = await auth.login(req.body ?? {})
  res.json({ token, remember: Boolean(maxAge) })
})

router.post('/auth/logout', async (req, res) => {
  await auth.logout(getToken(req))
  res.status(204).end()
})

router.use(requireLogin)

router.get('/auth/me', (req, res) => {
  res.json(req.user)
})

router.get('/employees', requirePermission('nominations.create', 'access_management', 'committee.manage'), async (req, res) => {
  if (req.query.include_inactive !== '1') return res.json(await listActiveEmployees())
  return requirePermission('access_management')(req, res, async () => res.json(await listAllEmployees()))
})

router.get('/sections', requirePermission('nominations.create'), async (req, res) => {
  res.json(await listSections())
})

// The nominee's immediate supervisor(s), offered as nominators when "Supervisor" is chosen.
router.get('/supervisors', requirePermission('nominations.create'), async (req, res) => {
  res.json(await listImmediateSupervisors({ employeeId: req.query.employee_id, sectionId: req.query.section_id }))
})

const canManageInactive = (user) => access.hasPermission(user, 'award_categories.manage_inactive')

// Inactive categories stay out of every list unless the Award Categories page asks for them
// and the person may see them.
router.get('/categories', requirePermission('award_categories', 'nominations'), async (req, res) => {
  const categories = await nominations.listCategories()
  const includeInactive = req.query.include_inactive === '1' && canManageInactive(req.user)
  res.json(includeInactive ? categories : categories.filter((category) => category.is_active))
})

router.post('/categories', requirePermission('award_categories.create'), async (req, res) => {
  res.status(201).json(await nominations.createCategory(req.body))
})

router.put('/categories/order', requirePermission('award_categories.edit'), async (req, res) => {
  res.json(await nominations.setCategoryOrder(req.body?.ids))
})

router.put('/categories/:id', requirePermission('award_categories.edit'), async (req, res) => {
  res.json(await nominations.updateCategory(req.params.id, req.body, canManageInactive(req.user)))
})

// Turning a category off needs the edit permission, and turning one back on needs the inactive one.
router.patch('/categories/:id', requirePermission('award_categories.edit', 'award_categories.manage_inactive'), async (req, res) => {
  const isActive = Boolean(req.body.is_active)
  const allowed = isActive ? canManageInactive(req.user) : access.hasPermission(req.user, 'award_categories.edit')
  if (!allowed) return res.status(403).json({ message: "You don't have access to this." })
  return res.json(await nominations.setCategoryActive(req.params.id, isActive))
})

router.get('/committee', requirePermission('committee'), async (req, res) => {
  res.json(await committee.listMembers(cycleIdFrom(req)))
})

router.post('/committee', requirePermission('committee.manage'), async (req, res) => {
  const member = await committee.addMember(req.body)
  void notifications.committeeMemberAdded(member, req.user)
  res.status(201).json(member)
})

router.post('/committee/:id/relieve', requirePermission('committee.manage'), async (req, res) => {
  const member = await committee.relieveMember(req.params.id, req.body)
  void notifications.committeeMemberRelieved(member, req.user)
  res.json(member)
})

router.delete('/committee/:id', requirePermission('committee.manage'), async (req, res) => {
  await committee.removeMember(req.params.id)
  res.status(204).end()
})

router.get('/screening', requirePermission('screening'), async (req, res) => {
  res.json(await screening.listScreening(cycleIdFrom(req), req.user, access.hasPermission(req.user, 'screening.results')))
})

router.put('/screening/:nominationId/score', requirePermission('screening'), async (req, res) => {
  res.json(await screening.saveScore(req.params.nominationId, req.body, req.user))
})

router.post('/screening/finalize', requirePermission('screening.results'), async (req, res) => {
  const result = await screening.finalizeGroup(req.body, req.user)
  void notifications.screeningFinalized(result.nominations.filter((nomination) => nomination.group_key === req.body.group_key), req.user)
  res.json(result)
})

// Secretariat: endorse each award's shortlist to the Chief of Hospital, and record conferment dates.
router.get('/endorsement', requirePermission('endorsement'), async (req, res) => {
  res.json(await awarding.listAwarding(cycleIdFrom(req)))
})

router.post('/endorsement/endorse', requirePermission('endorsement.manage'), async (req, res) => {
  const result = await awarding.endorseAward(req.body, req.user)
  void notifications.awardEndorsed(req.body, req.user)
  res.json(result)
})

router.post('/endorsement/withdraw', requirePermission('endorsement.manage'), async (req, res) => {
  const result = await awarding.withdrawEndorsement(req.body)
  void notifications.endorsementWithdrawn(req.body, req.user)
  res.json(result)
})

router.put('/endorsement/conferment', requirePermission('endorsement.manage'), async (req, res) => {
  const result = await awarding.recordConferment(req.body, req.user)
  void notifications.confermentRecorded(req.body, req.user)
  res.json(result)
})

// Chief of Hospital: pick one winner per endorsed award, and the two COH Choice awardees.
router.get('/coh', requirePermission('coh_approval'), async (req, res) => {
  res.json(await awarding.listForCoh(cycleIdFrom(req)))
})

router.post('/coh/nominations/:id/select', requirePermission('coh_approval.decide'), async (req, res) => {
  const result = await awarding.selectWinner(Number(req.params.id), req.user)
  void notifications.winnerSelected(Number(req.params.id), req.user)
  res.json(result)
})

router.get('/coh/choice-candidates', requirePermission('coh_approval.decide'), async (req, res) => {
  res.json(await awarding.listChoiceCandidates())
})

router.post('/coh/choices', requirePermission('coh_approval.decide'), async (req, res) => {
  const result = await awarding.setCohChoice(req.body, req.user)
  void notifications.cohChoiceMade(req.body, req.user)
  res.status(201).json(result)
})

router.get('/dashboard/nominees-per-category', requirePermission('dashboard'), async (req, res) => {
  res.json(await nominations.countNomineesPerCategory())
})

// Records: every awardee of a cycle with their plaque and grant releases, and every nomination.
router.get('/records', requirePermission('records'), async (req, res) => {
  res.json(await records.getRecords(cycleIdFrom(req)))
})

router.put('/records/release', requirePermission('records.manage'), async (req, res) => {
  const result = await records.recordRelease(req.body, req.user)
  void notifications.releaseRecorded(result, req.user)
  res.json(result.records)
})

// Reports: a cycle's numbers per award and grants released against the cycle budget.
router.get('/reports', requirePermission('reports'), async (req, res) => {
  res.json(await records.getReport(cycleIdFrom(req)))
})

router.get('/cycles', requirePermission('nominations', 'settings', 'committee', 'dashboard', 'endorsement', 'coh_approval', 'records', 'reports'), async (req, res) => {
  res.json(await nominations.listCycles())
})

router.post('/cycles', requirePermission('settings'), async (req, res) => {
  res.status(201).json(await nominations.createCycle(req.body))
})

router.put('/cycles/:id', requirePermission('settings'), async (req, res) => {
  res.json(await nominations.updateCycle(req.params.id, req.body))
})

router.get('/eligibility', requirePermission('nominations.create'), async (req, res) => {
  const { category_id, employee_id, section_id, nomination_id } = req.query
  const { snapshot, ...result } = await nominations.getEligibility({
    categoryId: category_id,
    employeeId: employee_id,
    sectionId: section_id,
    nominationId: nomination_id ? Number(nomination_id) : undefined,
  })
  res.json(result)
})

router.get('/nominations', requirePermission('nominations', 'validation'), async (req, res) => {
  res.json(await nominations.listNominations(req.user, { mine: req.query.mine === '1' }))
})

router.get('/nominations/:id', requirePermission('nominations', 'validation', 'coh_approval'), async (req, res) => {
  res.json(await nominations.getNomination(req.params.id, req.user))
})

router.post('/nominations', requirePermission('nominations.create'), async (req, res) => {
  const nomination = await nominations.saveNomination(req.body, undefined, req.user)
  if (nomination.status === 'submitted') void notifications.nominationSubmitted(nomination.id, req.user)
  res.status(201).json(nomination)
})

router.put('/nominations/:id', requirePermission('nominations.create'), async (req, res) => {
  const nomination = await nominations.saveNomination(req.body, Number(req.params.id), req.user)
  if (nomination.status === 'submitted') void notifications.nominationSubmitted(nomination.id, req.user)
  res.json(nomination)
})

router.delete('/nominations/:id', requirePermission('nominations.create'), async (req, res) => {
  await nominations.deleteDraft(req.params.id, req.user)
  res.status(204).end()
})

router.post('/nominations/:id/documents', requirePermission('nominations.create'), upload.single('file'), async (req, res) => {
  if (!req.file) throw new nominations.HttpError(400, 'Choose a file to attach.')
  res.status(201).json(await nominations.addDocument(req.params.id, req.file, req.query.criterion, req.user))
})

router.delete('/nominations/:id/documents/:documentId', requirePermission('nominations.create'), async (req, res) => {
  await nominations.deleteDocument(req.params.id, req.params.documentId, req.user)
  res.status(204).end()
})

router.patch('/nominations/:id/documents/:documentId', requirePermission('validation.review'), async (req, res) => {
  res.json(await nominations.reviewDocument(req.params.id, req.params.documentId, req.body, req.user))
})

router.post('/nominations/:id/validate', requirePermission('validation.review'), async (req, res) => {
  const nomination = await nominations.validateNomination(req.params.id, req.user)
  void notifications.nominationValidated(nomination.id, req.user)
  res.json(nomination)
})

router.post('/nominations/:id/disqualify', requirePermission('validation.review'), async (req, res) => {
  const nomination = await nominations.disqualifyNomination(req.params.id, req.body, req.user)
  void notifications.nominationDisqualified(nomination.id, req.user)
  res.json(nomination)
})

router.get('/documents/:id/file', requirePermission('nominations', 'validation', 'coh_approval'), async (req, res) => {
  const document = await nominations.getDocumentFor(req.params.id, req.user)
  res.download(document.full_path, document.file_name)
})

router.put('/system-settings/texts', requirePermission('settings'), async (req, res) => {
  res.json(await systemSettings.setTexts(req.body))
})

router.post('/system-settings/logos/:slot', requirePermission('settings'), logoUpload.single('file'), async (req, res) => {
  if (!req.file) throw new nominations.HttpError(400, 'Choose an image to upload.')
  res.json(await systemSettings.setLogo(req.params.slot, req.file))
})

router.delete('/system-settings/logos/:slot', requirePermission('settings'), async (req, res) => {
  res.json(await systemSettings.clearLogo(req.params.slot))
})

router.get('/access', requirePermission('access_management'), async (req, res) => {
  res.json(await access.getAccess())
})

router.put('/access/roles/:id', requirePermission('access_management'), async (req, res) => {
  res.json(await access.setRolePermissions(req.params.id, req.body.permissions, req.user))
})

router.put('/access/users/:employeeId', requirePermission('access_management'), async (req, res) => {
  const result = await access.setUserAccess(req.params.employeeId, req.body, req.user)
  void notifications.accessChanged(req.params.employeeId, req.user)
  res.json(result)
})

// Every signed-in user has their own notifications; no permission is needed to read them.
router.get('/notifications', async (req, res) => {
  res.json(await notifications.listForUser(req.user, { before: req.query.before }))
})

router.get('/notifications/unread-count', async (req, res) => {
  res.json({ unread: await notifications.countUnread(req.user) })
})

router.post('/notifications/read-all', async (req, res) => {
  res.json(await notifications.markAllRead(req.user))
})

router.post('/notifications/:id/read', async (req, res) => {
  res.json(await notifications.markRead(Number(req.params.id), req.user))
})

router.delete('/notifications/:id', async (req, res) => {
  res.json(await notifications.remove(Number(req.params.id), req.user))
})

module.exports = router
