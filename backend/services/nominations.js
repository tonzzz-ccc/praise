const fs = require('node:fs/promises')
const path = require('node:path')
const { db } = require('../config/db')
const { getEmployee, getEmployeeNames, listImmediateSupervisors, listSections } = require('./emis')
const {
  checkIndividualEligibility,
  checkSectionEligibility,
  isWithinNominationWindow,
  todayString,
} = require('./eligibility')

const CRITERIA_KEYS = ['achievements', 'method', 'impact', 'behavioral_indicators']
// The official PRAISE rating matrix weights, used unless the Secretariat sets an award's own.
// Percentages, summing to 100.
const DEFAULT_WEIGHTS = { achievements: 20, method: 30, impact: 30, behavioral_indicators: 20 }
const NOMINATOR_TYPES = ['supervisor', 'co_employee', 'external']
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')

// details: extra fields sent with the message, for a page that needs to react (for example a
// confirmation naming the cycle that would be closed).
class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function listCategories() {
  const [categories] = await db.query('SELECT * FROM praise_award_categories ORDER BY sort_order, id')
  const [tiers] = await db.query('SELECT * FROM praise_award_category_tiers ORDER BY id')
  return categories.map((category) => ({
    ...category,
    criteria_weights: category.criteria_weights ?? DEFAULT_WEIGHTS,
    tiers: tiers
      .filter((tier) => tier.category_id === category.id)
      .map((tier) => ({ ...tier, max_amount: Number(tier.max_amount) })),
  }))
}

async function getCategory(id) {
  const categories = await listCategories()
  return categories.find((category) => category.id === Number(id))
}

async function setCategoryActive(id, isActive) {
  const [result] = await db.query('UPDATE praise_award_categories SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id])
  if (result.affectedRows === 0) throw new HttpError(404, 'Award category not found.')
  return getCategory(id)
}

function cleanSalaryGrade(value) {
  if (value === null || value === undefined || value === '') return null
  const grade = Number(value)
  if (!Number.isInteger(grade) || grade < 1 || grade > 33) {
    throw new HttpError(400, 'Salary grades must be whole numbers from 1 to 33.')
  }
  return grade
}

function cleanTier(tier) {
  const label = String(tier?.tier_label ?? '').trim()
  const amount = Number(tier?.max_amount)
  if (!label || label.length > 50) throw new HttpError(400, 'Enter a level name of up to 50 characters.')
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 100000000) {
    throw new HttpError(400, `Enter a valid maximum grant for ${label}.`)
  }

  const min = cleanSalaryGrade(tier.salary_grade_min)
  const max = cleanSalaryGrade(tier.salary_grade_max)
  if (max !== null && min === null) throw new HttpError(400, `Enter the lowest salary grade for ${label}.`)
  if (max !== null && max < min) throw new HttpError(400, `The salary grades for ${label} are reversed.`)

  return { id: Number(tier.id) || null, tier_label: label, max_amount: amount, salary_grade_min: min, salary_grade_max: max }
}

// The nomination form picks a grant level from the nominee's salary grade, so the levels
// must not be ambiguous. Sections have no salary grade, so they get a single level.
function cleanTiers(body, nomineeType) {
  if (!body.has_grant) return []

  const tiers = (Array.isArray(body.tiers) ? body.tiers : []).map(cleanTier)
  if (tiers.length === 0) throw new HttpError(400, 'Add at least one grant level, or turn off the grant.')

  if (nomineeType === 'section') {
    if (tiers.length > 1) throw new HttpError(400, 'A section or committee award can only have one grant level.')
    return [{ ...tiers[0], salary_grade_min: null, salary_grade_max: null }]
  }

  const labels = new Set(tiers.map((tier) => tier.tier_label.toLowerCase()))
  if (labels.size !== tiers.length) throw new HttpError(400, 'Each grant level needs a different name.')

  if (tiers.length > 1) {
    if (tiers.some((tier) => tier.salary_grade_min === null)) {
      throw new HttpError(400, 'When there are several grant levels, each one needs a salary grade range.')
    }
    const sorted = [...tiers].sort((a, b) => a.salary_grade_min - b.salary_grade_min)
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      if (previous.salary_grade_max === null || previous.salary_grade_max >= sorted[index].salary_grade_min) {
        throw new HttpError(400, 'The salary grade ranges of the grant levels overlap.')
      }
    }
  }
  return tiers
}

async function uniqueCategoryCode(name) {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 44) || 'AWARD'
  const [rows] = await db.query('SELECT code FROM praise_award_categories')
  const taken = new Set(rows.map((row) => row.code))

  let code = base
  for (let suffix = 2; taken.has(code); suffix += 1) code = `${base}_${suffix}`
  return code
}

const duplicateCategoryName = () => new HttpError(409, 'An award category with this name already exists.')

// The fields shared by adding and editing. The code is never taken from the request.
function cleanCategoryFields(body) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ')
  const description = String(body.description ?? '').trim()
  const indicators = (Array.isArray(body.behavioral_indicators) ? body.behavioral_indicators : [])
    .map((indicator) => String(indicator).trim())
    .filter(Boolean)

  if (!name || name.length > 150) throw new HttpError(400, 'Enter an award name of up to 150 characters.')
  if (!description) throw new HttpError(400, 'Enter a description.')
  if (indicators.length === 0) throw new HttpError(400, 'Enter at least one behavioral indicator.')
  if (!['permanent', 'cos', 'both'].includes(body.applies_to)) throw new HttpError(400, 'Select who can receive this award.')
  if (!['individual', 'section'].includes(body.nominee_type)) throw new HttpError(400, 'Select who gets nominated.')

  return {
    name,
    description,
    behavioral_indicators: JSON.stringify([...new Set(indicators)]),
    applies_to: body.applies_to,
    nominee_type: body.nominee_type,
    has_plaque: body.has_plaque ? 1 : 0,
    is_limit_exempt: body.is_limit_exempt ? 1 : 0,
  }
}

// Optional: when left out, the award keeps its current weights.
function cleanWeights(value) {
  if (value === undefined || value === null) return undefined
  const weights = Object.fromEntries(CRITERIA_KEYS.map((key) => [key, Number(value?.[key])]))
  if (Object.values(weights).some((weight) => !Number.isInteger(weight) || weight < 0 || weight > 100)) {
    throw new HttpError(400, 'Each criterion weight must be a whole number from 0 to 100.')
  }
  if (Object.values(weights).reduce((sum, weight) => sum + weight, 0) !== 100) {
    throw new HttpError(400, 'The criterion weights must add up to 100%.')
  }
  return weights
}

// Changing weights after scoring starts would change the results under the committee, so they lock.
async function assertWeightsUnlocked(categoryId) {
  const [[scored]] = await db.query(
    'SELECT s.id FROM praise_screening_scores s JOIN praise_nominations n ON n.id = s.nomination_id WHERE n.category_id = ? LIMIT 1',
    [categoryId],
  )
  if (scored) throw new HttpError(409, 'The committee has started scoring this award, so its criterion weights can no longer change.')
}

async function assertCategoryNameFree(name, categoryId) {
  const [[existing]] = await db.query('SELECT id FROM praise_award_categories WHERE name = ? AND id <> ?', [name, categoryId ?? 0])
  if (existing) throw duplicateCategoryName()
}

// Saves the display order set by dragging on Award Categories. ids lists every award, first to last;
// it is the order used wherever awards are listed (including the nomination form's Award list).
async function setCategoryOrder(ids) {
  const [rows] = await db.query('SELECT id FROM praise_award_categories')
  const known = new Set(rows.map((row) => row.id))
  const order = Array.isArray(ids) ? ids.map(Number) : []
  if (order.length !== known.size || new Set(order).size !== order.length || order.some((id) => !known.has(id))) {
    throw new HttpError(409, 'The award list changed. Reload the page and try again.')
  }
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    for (const [index, id] of order.entries()) {
      await connection.query('UPDATE praise_award_categories SET sort_order = ? WHERE id = ?', [index + 1, id])
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
  return listCategories()
}

async function createCategory(body) {
  const fields = cleanCategoryFields(body)
  const tiers = cleanTiers(body, fields.nominee_type)
  const weights = cleanWeights(body.criteria_weights)
  if (weights) fields.criteria_weights = JSON.stringify(weights)
  await assertCategoryNameFree(fields.name)

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [result] = await connection.query('INSERT INTO praise_award_categories SET ?', {
      ...fields,
      code: await uniqueCategoryCode(fields.name),
      has_grant: tiers.length > 0 ? 1 : 0,
      is_active: body.is_active === false ? 0 : 1,
      // New awards go to the end of the list.
      sort_order: (await connection.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM praise_award_categories'))[0][0].next,
    })
    for (const { id, ...tier } of tiers) {
      await connection.query('INSERT INTO praise_award_category_tiers SET ?', { ...tier, category_id: result.insertId })
    }
    await connection.commit()
    return getCategory(result.insertId)
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') throw duplicateCategoryName()
    throw error
  } finally {
    connection.release()
  }
}

// Past nominations point at the category and its levels, so a change must leave them valid.
async function assertEditKeepsNominations(category, fields, tiers) {
  if (fields.nominee_type !== category.nominee_type) {
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM praise_nominations WHERE category_id = ?', [category.id])
    if (total > 0) throw new HttpError(409, 'This award already has nominations, so its nominee type cannot change.')
  }

  const keptIds = tiers.map((tier) => tier.id).filter(Boolean)
  if (keptIds.some((id) => !category.tiers.some((tier) => tier.id === id))) {
    throw new HttpError(400, 'A grant level was not found. Reload the page and try again.')
  }

  const removedTiers = category.tiers.filter((tier) => !keptIds.includes(tier.id))
  if (removedTiers.length === 0) return

  const [used] = await db.query('SELECT DISTINCT tier_id FROM praise_nominations WHERE tier_id IN (?)', [removedTiers.map((tier) => tier.id)])
  const usedTier = removedTiers.find((tier) => used.some((row) => row.tier_id === tier.id))
  if (usedTier) throw new HttpError(409, `${usedTier.tier_label} has nominations, so this grant level cannot be removed.`)
}

// An inactive category does not exist for someone who cannot manage inactive ones.
async function updateCategory(id, body, canManageInactive) {
  const category = await getCategory(id)
  if (!category || (!category.is_active && !canManageInactive)) throw new HttpError(404, 'Award category not found.')

  const fields = cleanCategoryFields(body)
  const tiers = cleanTiers(body, fields.nominee_type)
  const weights = cleanWeights(body.criteria_weights)
  if (weights && CRITERIA_KEYS.some((key) => weights[key] !== category.criteria_weights[key])) {
    await assertWeightsUnlocked(category.id)
    fields.criteria_weights = JSON.stringify(weights)
  }
  await assertCategoryNameFree(fields.name, category.id)
  await assertEditKeepsNominations(category, fields, tiers)

  const keptIds = tiers.map((tier) => tier.id).filter(Boolean)
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query('UPDATE praise_award_categories SET ? WHERE id = ?', [{ ...fields, has_grant: tiers.length > 0 ? 1 : 0 }, category.id])

    for (const tier of category.tiers.filter((item) => !keptIds.includes(item.id))) {
      await connection.query('DELETE FROM praise_award_category_tiers WHERE id = ?', [tier.id])
    }
    // Clears the old level names first, so two levels can swap names.
    await connection.query("UPDATE praise_award_category_tiers SET tier_label = CONCAT('~', id) WHERE category_id = ?", [category.id])
    for (const { id: tierId, ...tier } of tiers) {
      if (tierId) await connection.query('UPDATE praise_award_category_tiers SET ? WHERE id = ?', [tier, tierId])
      else await connection.query('INSERT INTO praise_award_category_tiers SET ?', { ...tier, category_id: category.id })
    }

    await connection.commit()
    return getCategory(category.id)
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') throw duplicateCategoryName()
    if (error.code === 'ER_ROW_IS_REFERENCED_2') throw new HttpError(409, 'A grant level you removed has nominations, so it cannot be removed.')
    throw error
  } finally {
    connection.release()
  }
}

async function listCycles() {
  const [cycles] = await db.query('SELECT * FROM praise_award_cycles ORDER BY period_start DESC')
  return cycles
}

const CYCLE_STATUSES = ['draft', 'open', 'screening', 'closed']
const CYCLE_DATE = /^\d{4}-\d{2}-\d{2}$/

// Validates a cycle from the Settings form: a name, the selection period, the nomination window
// (when nominations can be submitted), an optional awarding ceremony date, and a status.
function cleanCycle(body) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ')
  if (!name || name.length > 50) throw new HttpError(400, 'Enter a cycle name of up to 50 characters.')

  const cycle = { name, status: CYCLE_STATUSES.includes(body.status) ? body.status : 'draft' }
  for (const key of ['period_start', 'period_end', 'nomination_start', 'nomination_end']) {
    const value = String(body[key] ?? '').trim()
    if (!CYCLE_DATE.test(value)) throw new HttpError(400, 'Enter the selection period and the nomination window.')
    cycle[key] = value
  }
  if (cycle.period_end < cycle.period_start) throw new HttpError(400, 'The selection period ends before it starts.')
  if (cycle.nomination_end < cycle.nomination_start) throw new HttpError(400, 'The nomination window ends before it starts.')

  const ceremony = String(body.ceremony_date ?? '').trim()
  if (ceremony && !CYCLE_DATE.test(ceremony)) throw new HttpError(400, 'Enter a valid awarding ceremony date.')
  if (ceremony && ceremony < cycle.nomination_end) throw new HttpError(400, 'The awarding ceremony must be after the nomination window ends.')
  cycle.ceremony_date = ceremony || null

  // The PRAISE allocation for the cycle, optional, compared with grants released on Reports.
  const budget = body.budget === null || body.budget === undefined || body.budget === '' ? null : Number(body.budget)
  if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget >= 1e10)) {
    throw new HttpError(400, 'Enter a budget of zero or more, in pesos.')
  }
  cycle.budget = budget === null ? null : Math.round(budget * 100) / 100
  return cycle
}

async function getCycle(id) {
  const [[cycle]] = await db.query('SELECT * FROM praise_award_cycles WHERE id = ?', [id])
  if (!cycle) throw new HttpError(404, 'Award cycle not found.')
  return cycle
}

const duplicateCycleName = () => new HttpError(409, 'An award cycle with this name already exists.', { reason: 'duplicate_name' })

// Saves a cycle. Only one cycle can be open for nominations at a time: opening one while another
// is open is refused, naming the open one, unless the request says to close it (close_open_cycles),
// which happens in the same transaction. Closing a cycle also ends its committee seats' access.
async function saveCycle(id, body) {
  if (id) await getCycle(id)
  const cycle = cleanCycle(body)

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    if (cycle.status === 'open') {
      const [others] = await connection.query("SELECT id, name FROM praise_award_cycles WHERE status = 'open' AND id <> ? FOR UPDATE", [id ?? 0])
      if (others.length > 0 && body.close_open_cycles !== true) {
        const names = others.map((other) => other.name).join(' and ')
        throw new HttpError(409, `${names} is still open for nominations. Only one cycle can be open at a time.`, {
          reason: 'cycle_open',
          open_cycles: others,
        })
      }
      if (others.length > 0) {
        await connection.query("UPDATE praise_award_cycles SET status = 'closed' WHERE id IN (?)", [others.map((other) => other.id)])
      }
    }
    let savedId = id
    if (id) {
      await connection.query('UPDATE praise_award_cycles SET ? WHERE id = ?', [cycle, id])
    } else {
      const [result] = await connection.query('INSERT INTO praise_award_cycles SET ?', cycle)
      savedId = result.insertId
    }
    await connection.commit()
    return getCycle(savedId)
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') throw duplicateCycleName()
    throw error
  } finally {
    connection.release()
  }
}

const createCycle = (body) => saveCycle(null, body)
const updateCycle = (id, body) => saveCycle(Number(id), body)

function findTier(category, employee) {
  if (category.tiers.length === 0) return null
  if (!employee) return category.tiers.length === 1 ? category.tiers[0] : null

  return (
    category.tiers.find(
      (tier) =>
        tier.salary_grade_min === null ||
        (employee.salary_grade >= tier.salary_grade_min &&
          (tier.salary_grade_max === null || employee.salary_grade <= tier.salary_grade_max)),
    ) ?? null
  )
}

async function checkNominee({ category, employeeId, sectionId, cycleId, nominationId, onDate }) {
  if (category.nominee_type === 'section') {
    const sections = await listSections()
    const section = sections.find((item) => item.id === Number(sectionId))
    if (!section) throw new HttpError(400, 'Select a section, committee or unit.')

    const eligibility = await checkSectionEligibility(section.id, onDate)
    return { employee: null, section, tier: findTier(category), eligibility }
  }

  const employee = employeeId ? await getEmployee(employeeId) : null
  if (!employee?.is_active) throw new HttpError(400, 'Select an active employee as the nominee.')

  const allowed = category.applies_to === 'both' ? ['permanent', 'cos'] : [category.applies_to]
  if (!allowed.includes(employee.employment_status)) {
    throw new HttpError(400, `This employee's employment status cannot receive ${category.name}.`)
  }

  const eligibility = await checkIndividualEligibility(employee, category, cycleId, onDate, nominationId)
  return { employee, section: null, tier: findTier(category, employee), eligibility }
}

// A draft already on an award can still be finished after that award is deactivated.
function assertCategoryOpen(category, existing) {
  if (!category.is_active && category.id !== existing?.category_id) throw new HttpError(400, 'This award is not active.')
}

function assertPastRenominationWait(eligibility) {
  const waiting = eligibility.checks?.find((item) => item.key === 'renomination' && item.status === 'failed')
  if (waiting) throw new HttpError(400, waiting.label)
}

async function getOpenCycle() {
  const [[cycle]] = await db.query("SELECT * FROM praise_award_cycles WHERE status = 'open' ORDER BY period_start DESC LIMIT 1")
  if (!cycle) throw new HttpError(400, 'No award cycle is open for nominations.')
  return cycle
}

async function getEligibility({ categoryId, employeeId, sectionId, nominationId }) {
  const category = await getCategory(categoryId)
  if (!category) throw new HttpError(400, 'Select an award.')

  const existing = nominationId ? await getNominationRow(nominationId) : null
  assertCategoryOpen(category, existing)
  const cycleId = existing?.cycle_id ?? (await getOpenCycle()).id
  const { tier, eligibility } = await checkNominee({
    category,
    employeeId,
    sectionId,
    cycleId,
    nominationId,
    onDate: todayString(),
  })
  return { tier, ...eligibility }
}

async function getNominationRow(id) {
  const [[nomination]] = await db.query('SELECT * FROM praise_nominations WHERE id = ?', [id])
  if (!nomination) throw new HttpError(404, 'Nomination not found.')
  return nomination
}

function addNames(nomination, { categories, cycles, tiers, names, sections }) {
  const category = categories.get(nomination.category_id)
  const tier = tiers.get(nomination.tier_id)
  return {
    ...nomination,
    cycle_name: cycles.get(nomination.cycle_id),
    // The level is added only when the award has several; Dangal Level I and II are now separate
    // awards whose names already include the level.
    award_name: tier?.salary_grade_min && category.tiers.length > 1 ? `${category.name} - ${tier.tier_label}` : category.name,
    nominee_name: nomination.section_id ? sections.get(nomination.section_id) : names.get(nomination.employee_id),
    nominator_display_name: nomination.nominator_name ?? names.get(nomination.nominator_employee_id) ?? null,
    // The built-in Admin has no EMIS record, so its id stands in for a name.
    validated_by_name: nomination.validated_by ? (names.get(nomination.validated_by) ?? nomination.validated_by) : null,
  }
}

async function loadLookups() {
  const [categoryList, cycleList, names, sectionList] = await Promise.all([
    listCategories(),
    listCycles(),
    getEmployeeNames(),
    listSections(),
  ])
  return {
    categories: new Map(categoryList.map((category) => [category.id, category])),
    tiers: new Map(categoryList.flatMap((category) => category.tiers).map((tier) => [tier.id, tier])),
    cycles: new Map(cycleList.map((cycle) => [cycle.id, cycle.name])),
    sections: new Map(sectionList.map((section) => [section.id, section.name])),
    names,
  }
}

// The Secretariat (validation access) works with every nomination. Everyone else, and the
// Nominations page for everyone (mine), sees only the nominations they entered.
// Required here, not at the top: access.js itself requires this module.
const canSeeAll = (actor) => require('./access').hasPermission(actor, 'validation')

// The Chief of Hospital reviews every nomination endorsed to them, in full.
const COH_VISIBLE = (nomination) => Boolean(nomination.endorsed_at)
const canReviewAsCoh = (nomination, actor) => require('./access').hasPermission(actor, 'coh_approval') && COH_VISIBLE(nomination)

function assertCanView(nomination, actor) {
  if (!canSeeAll(actor) && nomination.created_by !== actor.id && !canReviewAsCoh(nomination, actor)) {
    throw new HttpError(404, 'Nomination not found.')
  }
}

function assertCreator(nomination, actor) {
  if (nomination.created_by !== actor.id) throw new HttpError(404, 'Nomination not found.')
}

async function listNominations(actor, { mine = false } = {}) {
  // documented_criteria: how many criteria have at least one supporting document (drafts show it
  // as progress toward submitting).
  const select = `SELECT n.*, (SELECT COUNT(DISTINCT d.criterion) FROM praise_nomination_documents d
    WHERE d.nomination_id = n.id AND d.criterion IS NOT NULL) AS documented_criteria FROM praise_nominations n`
  const [rows] = mine || !canSeeAll(actor)
    ? await db.query(`${select} WHERE n.created_by = ? ORDER BY n.id DESC`, [actor.id])
    : await db.query(`${select} ORDER BY n.id DESC`)
  const lookups = await loadLookups()
  return rows.map((row) => ({ ...addNames(row, lookups), documented_criteria: Number(row.documented_criteria) }))
}

// Required before validating: the nomination form, plus an IPCR for an individual nominee.
// The Secretariat sets each document's type in the checklist.
function findMissingDocuments(nomination, documents) {
  const has = (type) => documents.some((document) => document.doc_type === type)
  return [
    ...(has('nomination_form') ? [] : ['Nomination form']),
    ...(nomination.employee_id && !has('ipcr') ? ['IPCR'] : []),
  ]
}

// Nobody reviews a nomination they are the nominee, nominator or a group member of.
async function isOwnNomination(nomination, actor) {
  if ([nomination.employee_id, nomination.nominator_employee_id].includes(actor.id)) return true
  const [[member]] = await db.query('SELECT id FROM praise_nomination_members WHERE nomination_id = ? AND employee_id = ?', [nomination.id, actor.id])
  return Boolean(member)
}

async function getNomination(id, actor) {
  const nomination = await getNominationRow(id)
  if (actor) assertCanView(nomination, actor)
  const lookups = await loadLookups()
  const [members] = await db.query('SELECT * FROM praise_nomination_members WHERE nomination_id = ? ORDER BY id', [id])
  const [documents] = await db.query(
    'SELECT id, nomination_id, doc_type, criterion, file_name, mime_type, file_size, is_verified FROM praise_nomination_documents WHERE nomination_id = ? ORDER BY id',
    [id],
  )
  return {
    ...addNames(nomination, lookups),
    category: lookups.categories.get(nomination.category_id),
    members: members.map((member) => ({ ...member, name: lookups.names.get(member.employee_id) ?? member.employee_id })),
    documents,
    missing_documents: findMissingDocuments(nomination, documents),
    is_own_nomination: actor ? await isOwnNomination(nomination, actor) : false,
    // Only the Secretariat (who see every nomination) learn about the nominee's other nominations.
    other_nominations: actor && canSeeAll(actor) ? await listOtherNominations(nomination, lookups) : [],
  }
}

// The same nominee's other live nominations in the cycle, so the Secretariat can spot an employee
// nominated for more than one award (each can receive only one; the Secretariat disqualifies the rest).
async function listOtherNominations(nomination, lookups) {
  const [nominee, value] = nomination.employee_id ? ['employee_id', nomination.employee_id] : ['section_id', nomination.section_id]
  if (!value) return []
  const [rows] = await db.query(
    `SELECT * FROM praise_nominations
     WHERE cycle_id = ? AND id <> ? AND ?? = ? AND status NOT IN ('disqualified', 'closed')
     ORDER BY id`,
    [nomination.cycle_id, nomination.id, nominee, value],
  )
  return rows.map((row) => {
    const named = addNames(row, lookups)
    return {
      id: row.id,
      award_name: named.award_name,
      status: row.status,
      is_same_award: row.category_id === nomination.category_id,
    }
  })
}

// Evidence is no longer collected in the form (supporting documents replace it). It is kept in
// storage so existing nominations do not lose their evidence text: on edit it carries over from
// the saved nomination when the request does not include it.
function cleanResponses(responses, existing) {
  return Object.fromEntries(
    CRITERIA_KEYS.map((key) => [
      key,
      {
        justification: String(responses?.[key]?.justification ?? '').trim(),
        evidence: String(responses?.[key]?.evidence ?? existing?.[key]?.evidence ?? '').trim(),
      },
    ]),
  )
}

function assertReadyToSubmit({ cycle, eligibility, tier, category, employee, responses, nominator, documentedCriteria, onDate }) {
  if (!isWithinNominationWindow(cycle, onDate)) {
    throw new HttpError(400, `${cycle.name} nominations are open ${cycle.nomination_start} to ${cycle.nomination_end} only.`)
  }
  if (!eligibility.is_eligible) throw new HttpError(400, 'This nominee does not meet the eligibility requirements.')
  if (category.tiers.length > 0 && !tier) throw new HttpError(400, "The nominee's salary grade does not match a grant level of this award.")

  const incomplete = CRITERIA_KEYS.some((key) => !responses[key].justification)
  if (incomplete) throw new HttpError(400, 'Enter the justification for every criterion.')
  if (CRITERIA_KEYS.some((key) => !documentedCriteria.has(key))) {
    throw new HttpError(400, 'Attach at least one supporting document to every criterion before submitting.')
  }

  if (!nominator.nominator_type) throw new HttpError(400, 'Select who is nominating.')
  if (nominator.nominator_type === 'external' ? !nominator.nominator_name : !nominator.nominator_employee_id) {
    throw new HttpError(400, 'Enter the name of the nominator.')
  }
  if (employee && nominator.nominator_employee_id === employee.id) {
    throw new HttpError(400, 'Nominees cannot nominate themselves.')
  }
}

// nominee: { employee, section } from checkNominee.
async function cleanNominator(body, nominee) {
  const type = NOMINATOR_TYPES.includes(body.nominator_type) ? body.nominator_type : null
  const isExternal = type === 'external'
  const employeeId = type && !isExternal ? (body.nominator_employee_id ?? null) : null

  if (employeeId && !(await getEmployee(employeeId))) throw new HttpError(400, 'The nominator was not found.')

  // A supervisor nominator must be the nominee's immediate supervisor on record in EMIS. When EMIS
  // has no head recorded yet (local data is incomplete), any employee is accepted.
  if (type === 'supervisor' && employeeId) {
    const supervisors = await listImmediateSupervisors({ employeeId: nominee.employee?.id, sectionId: nominee.section?.id })
    if (supervisors.length > 0 && !supervisors.some((supervisor) => supervisor.id === employeeId)) {
      throw new HttpError(400, "The supervisor must be the nominee's immediate supervisor.")
    }
  }

  return {
    nominator_type: type,
    nominator_employee_id: employeeId,
    nominator_name: isExternal ? String(body.nominator_name ?? '').trim() || null : null,
  }
}

// Saves a new nomination, or an existing draft when id is given. Only drafts can change.
async function saveNomination(body, id, actor) {
  const status = body.status === 'submitted' ? 'submitted' : 'draft'
  const existing = id ? await getNominationRow(id) : null
  if (existing) assertCreator(existing, actor)
  if (existing && existing.status !== 'draft') throw new HttpError(409, 'Only drafts can be edited.')

  const category = await getCategory(body.category_id)
  if (!category) throw new HttpError(400, 'Select an award.')
  assertCategoryOpen(category, existing)

  const [[cycle]] = existing
    ? await db.query('SELECT * FROM praise_award_cycles WHERE id = ?', [existing.cycle_id])
    : [[await getOpenCycle()]]
  const onDate = todayString()
  const { employee, section, tier, eligibility } = await checkNominee({
    category,
    employeeId: body.employee_id,
    sectionId: body.section_id,
    cycleId: cycle.id,
    nominationId: id,
    onDate,
  })
  assertPastRenominationWait(eligibility)
  const responses = cleanResponses(body.form_responses, existing?.form_responses)
  const nominator = await cleanNominator(body, { employee, section })

  if (status === 'submitted') {
    // Documents are attached to the draft before it is submitted. Each criterion needs at least one.
    const [rows] = await db.query(
      'SELECT DISTINCT criterion FROM praise_nomination_documents WHERE nomination_id = ? AND criterion IS NOT NULL',
      [id ?? 0],
    )
    const documentedCriteria = new Set(rows.map((row) => row.criterion))
    assertReadyToSubmit({ cycle, eligibility, tier, category, employee, responses, nominator, documentedCriteria, onDate })
  }

  const values = {
    cycle_id: cycle.id,
    category_id: category.id,
    tier_id: tier?.id ?? null,
    employee_id: employee?.id ?? null,
    section_id: section?.id ?? null,
    ...nominator,
    form_responses: JSON.stringify(responses),
    eligibility_snapshot: JSON.stringify(eligibility.snapshot),
    status,
  }

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()

    let nominationId = id
    if (existing) {
      await connection.query('UPDATE praise_nominations SET ?, submitted_at = IF(? = "submitted", NOW(), NULL) WHERE id = ?', [values, status, id])
    } else {
      const [result] = await connection.query('INSERT INTO praise_nominations SET ?, submitted_at = IF(? = "submitted", NOW(), NULL)', [{ ...values, created_by: actor.id }, status])
      nominationId = result.insertId
    }

    await connection.query('DELETE FROM praise_nomination_members WHERE nomination_id = ?', [nominationId])
    for (const member of eligibility.members ?? []) {
      await connection.query('INSERT INTO praise_nomination_members SET ?', {
        nomination_id: nominationId,
        employee_id: member.employee_id,
        is_qualified: member.is_eligible ? 1 : 0,
        is_excluded: member.is_eligible ? 0 : 1,
      })
    }

    if (status === 'submitted') {
      const nominees = employee ? [employee.id] : (eligibility.members ?? []).map((member) => member.employee_id)
      await relieveNominatedMembers(connection, cycle.id, nominees)
    }

    await connection.commit()
    return getNomination(nominationId, actor)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

// A committee member who is nominated, or whose section is nominated, is relieved
// from the evaluation. The rest of the committee proceeds without them.
const NOMINATED_REASON = 'Nominated, or their section is nominated, in this cycle'
// Includes the wording used before section nominations also relieved members.
const NOMINATED_REASONS = [NOMINATED_REASON, 'Nominated for an award in this cycle']

async function relieveNominatedMembers(connection, cycleId, employeeIds) {
  if (employeeIds.length === 0) return
  await connection.query(
    "UPDATE praise_committee_members SET status = 'relieved', relieved_reason = ?, relieved_at = NOW() WHERE cycle_id = ? AND employee_id IN (?) AND status = 'active'",
    [NOMINATED_REASON, cycleId, employeeIds],
  )
}

// Once a nomination is disqualified, members relieved because of it return, unless they or
// their section are still in another live nomination. Members relieved by hand stay relieved.
// Screening already done is kept; the member only takes part from here on.
async function reinstateNominatedMembers(nomination) {
  const [members] = await db.query('SELECT employee_id FROM praise_nomination_members WHERE nomination_id = ?', [nomination.id])
  const employeeIds = nomination.employee_id ? [nomination.employee_id] : members.map((member) => member.employee_id)
  if (employeeIds.length === 0) return

  await db.query(
    `UPDATE praise_committee_members c SET c.status = 'active', c.relieved_reason = NULL, c.relieved_at = NULL
     WHERE c.cycle_id = ? AND c.employee_id IN (?) AND c.status = 'relieved' AND c.relieved_reason IN (?)
       AND NOT EXISTS (
         SELECT 1 FROM praise_nominations n
         LEFT JOIN praise_nomination_members m ON m.nomination_id = n.id AND m.employee_id = c.employee_id
         WHERE n.cycle_id = c.cycle_id AND n.status NOT IN ('draft', 'disqualified', 'closed')
           AND (n.employee_id = c.employee_id OR m.employee_id IS NOT NULL)
       )`,
    [nomination.cycle_id, employeeIds, NOMINATED_REASONS],
  )
}

async function assertDraft(nominationId, actor) {
  const nomination = await getNominationRow(nominationId)
  assertCreator(nomination, actor)
  if (nomination.status !== 'draft') throw new HttpError(409, 'Documents can only change while the nomination is a draft.')
}

async function addDocument(nominationId, file, criterion, actor) {
  // Only a known criterion is stored; anything else is kept as untied (NULL).
  const tag = CRITERIA_KEYS.includes(criterion) ? criterion : null
  try {
    await assertDraft(nominationId, actor)
    const [result] = await db.query('INSERT INTO praise_nomination_documents SET ?', {
      nomination_id: nominationId,
      criterion: tag,
      file_name: file.originalname,
      file_path: file.filename,
      mime_type: file.mimetype,
      file_size: file.size,
    })
    return { id: result.insertId, file_name: file.originalname, criterion: tag }
  } catch (error) {
    await fs.rm(path.join(UPLOAD_DIR, file.filename), { force: true })
    throw error
  }
}

async function getDocument(documentId) {
  const [[document]] = await db.query('SELECT * FROM praise_nomination_documents WHERE id = ?', [documentId])
  if (!document) throw new HttpError(404, 'Document not found.')
  return { ...document, full_path: path.join(UPLOAD_DIR, path.basename(document.file_path)) }
}

// A document file can be downloaded by whoever can view its nomination.
async function getDocumentFor(documentId, actor) {
  const document = await getDocument(documentId)
  assertCanView(await getNominationRow(document.nomination_id), actor)
  return document
}

async function deleteDocument(nominationId, documentId, actor) {
  await assertDraft(nominationId, actor)
  const document = await getDocument(documentId)
  if (document.nomination_id !== Number(nominationId)) throw new HttpError(404, 'Document not found.')

  await db.query('DELETE FROM praise_nomination_documents WHERE id = ?', [documentId])
  await fs.rm(document.full_path, { force: true })
}

const DOCUMENT_TYPES = ['nomination_form', 'ipcr', 'dpcr', 'opcr', 'award_commendation', 'publication', 'photo', 'testimonial', 'other']
const DISQUALIFICATION_REASONS = ['incomplete_documents', 'misrepresentation', 'special_favor']
const alreadyReviewed = () => new HttpError(409, 'This nomination has already been reviewed. Reload the page.')

async function assertCanReview(nominationId, actor) {
  const nomination = await getNominationRow(nominationId)
  if (nomination.status !== 'submitted') throw alreadyReviewed()
  if (await isOwnNomination(nomination, actor)) {
    throw new HttpError(403, 'You cannot review a nomination you are part of. Another Secretariat member must review it.')
  }
  return nomination
}

// The Secretariat's checklist: sets a document's type and whether it has been checked.
async function reviewDocument(nominationId, documentId, body, actor) {
  await assertCanReview(nominationId, actor)
  const document = await getDocument(documentId)
  if (document.nomination_id !== Number(nominationId)) throw new HttpError(404, 'Document not found.')

  const docType = body.doc_type ?? document.doc_type
  if (!DOCUMENT_TYPES.includes(docType)) throw new HttpError(400, 'Select a valid document type.')
  const isVerified = body.is_verified === undefined ? Boolean(document.is_verified) : Boolean(body.is_verified)

  await db.query('UPDATE praise_nomination_documents SET ? WHERE id = ?', [
    { doc_type: docType, is_verified: isVerified ? 1 : 0, verified_by: isVerified ? actor.id : null },
    documentId,
  ])
  return getNomination(nominationId, actor)
}

// Only moves a nomination that is still waiting, so two people cannot both decide it.
async function recordReview(nominationId, values, actor) {
  const [result] = await db.query(
    "UPDATE praise_nominations SET ?, validated_by = ?, validated_at = NOW() WHERE id = ? AND status = 'submitted'",
    [values, actor.id, nominationId],
  )
  if (result.affectedRows === 0) throw alreadyReviewed()
  return getNomination(nominationId, actor)
}

async function validateNomination(nominationId, actor) {
  const nomination = await assertCanReview(nominationId, actor)
  const [documents] = await db.query('SELECT doc_type, is_verified FROM praise_nomination_documents WHERE nomination_id = ?', [nominationId])
  const missing = findMissingDocuments(nomination, documents)
  if (missing.length > 0) throw new HttpError(400, `Required documents are missing: ${missing.join(', ')}.`)
  if (documents.some((document) => !document.is_verified)) {
    throw new HttpError(400, 'Verify every document before validating this nomination.')
  }
  const validated = await recordReview(nominationId, { status: 'validated' }, actor)
  await closeDuplicateNominations(nomination)
  return validated
}

// Duplicate nominations are allowed. Once one is validated, the same nominee's other drafts and
// submitted nominations for the SAME award in that cycle are closed, with a note naming the
// validated one. Nominations for a different award are left alone: each employee can receive only
// one award, and the Secretariat disqualifies the other award's nomination by hand.
async function closeDuplicateNominations(nomination) {
  const [nominee, value] = nomination.employee_id ? ['employee_id', nomination.employee_id] : ['section_id', nomination.section_id]
  if (!value) return
  const where = "cycle_id = ? AND category_id = ? AND id <> ? AND ?? = ? AND status IN ('draft', 'submitted')"
  const params = [nomination.cycle_id, nomination.category_id, nomination.id, nominee, value]
  const [closing] = await db.query(`SELECT id, created_by FROM praise_nominations WHERE ${where}`, params)
  if (closing.length === 0) return
  await db.query(`UPDATE praise_nominations SET status = 'closed', remarks = ? WHERE id IN (?) AND status IN ('draft', 'submitted')`, [
    `Closed automatically: nomination No. ${nomination.id} for the same nominee and award was validated.`,
    closing.map((row) => row.id),
  ])
  // Required here, not at the top: notifications.js requires this module.
  await require('./notifications').duplicatesClosed(closing, nomination)
}

async function disqualifyNomination(nominationId, body, actor) {
  if (!DISQUALIFICATION_REASONS.includes(body.reason)) throw new HttpError(400, 'Select a reason for disqualifying.')
  const nomination = await assertCanReview(nominationId, actor)
  const result = await recordReview(
    nominationId,
    { status: 'disqualified', disqualification_reason: body.reason, remarks: String(body.remarks ?? '').trim() || null },
    actor,
  )
  await reinstateNominatedMembers(nomination)
  return result
}

// Nominees per award in the open cycle, for the dashboard. Drafts are not counted yet,
// and disqualified nominations no longer count. Dangal levels count under one award.
async function countNomineesPerCategory() {
  const [[cycle]] = await db.query("SELECT * FROM praise_award_cycles WHERE status = 'open' ORDER BY period_start DESC LIMIT 1")
  if (!cycle) return { cycle: null, categories: [] }

  const [rows] = await db.query(
    `SELECT c.id, c.name, COUNT(n.id) AS total FROM praise_award_categories c
     LEFT JOIN praise_nominations n ON n.category_id = c.id AND n.cycle_id = ? AND n.status NOT IN ('draft', 'disqualified', 'closed')
     WHERE c.is_active = 1 GROUP BY c.id, c.name ORDER BY c.id`,
    [cycle.id],
  )
  return { cycle: { id: cycle.id, name: cycle.name }, categories: rows.map((row) => ({ ...row, total: Number(row.total) })) }
}

module.exports = {
  CRITERIA_KEYS,
  addNames,
  getNominationRow,
  isOwnNomination,
  loadLookups,
  countNomineesPerCategory,
  HttpError,
  UPLOAD_DIR,
  addDocument,
  createCategory,
  setCategoryOrder,
  createCycle,
  deleteDocument,
  disqualifyNomination,
  getDocument,
  getDocumentFor,
  reviewDocument,
  validateNomination,
  getEligibility,
  getNomination,
  listCategories,
  listCycles,
  listNominations,
  relieveNominatedMembers,
  saveNomination,
  setCategoryActive,
  updateCategory,
  updateCycle,
}
