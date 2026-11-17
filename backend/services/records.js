// Records (awardees, their plaque and grant releases, and every nomination of a cycle) and
// Reports (a cycle's numbers per award, and grants released against the cycle budget).
const { db } = require('../config/db')
const { addNames, HttpError, loadLookups } = require('./nominations')
const { getEmployee } = require('./emis')
const { todayString } = require('./eligibility')

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const KINDS = ['nomination', 'coh_choice']
const COH_CHOICE_NAMES = { section: 'COH Choice Award (Section)', employee: 'COH Choice Award (Employee)' }

// Statuses a nomination has after passing validation, and after reaching the shortlist.
const PASSED_VALIDATION = ['validated', 'shortlisted', 'not_selected', 'endorsed', 'awarded']
const SHORTLISTED = ['shortlisted', 'endorsed', 'awarded']

const money = (value) => (value === null || value === undefined ? null : Number(value))

async function getCycle(cycleId) {
  const [[cycle]] = await db.query('SELECT * FROM praise_award_cycles WHERE id = ?', [cycleId])
  if (!cycle) throw new HttpError(404, 'Award cycle not found.')
  return { ...cycle, budget: money(cycle.budget) }
}

const releaseFields = (row, nameOf) => ({
  conferment_date: row.conferment_date,
  plaque_released_on: row.plaque_released_on,
  grant_amount: money(row.grant_amount),
  grant_released_on: row.grant_released_on,
  release_recorded_by_name: row.release_recorded_by ? nameOf(row.release_recorded_by) : null,
})

// Award winners and COH Choice awardees of a cycle, in award order.
async function listAwardees(cycle, lookups) {
  const nameOf = (id) => lookups.names.get(id) ?? id
  const [winners] = await db.query("SELECT * FROM praise_nominations WHERE cycle_id = ? AND status = 'awarded'", [cycle.id])
  const [choices] = await db.query('SELECT * FROM praise_coh_choices WHERE cycle_id = ? ORDER BY choice_type DESC', [cycle.id])

  const awardees = []
  for (const row of winners) {
    const category = lookups.categories.get(row.category_id)
    const tier = lookups.tiers.get(row.tier_id)
    const named = addNames(row, lookups)
    const employee = row.employee_id ? await getEmployee(row.employee_id) : null
    awardees.push({
      key: `nomination-${row.id}`,
      kind: 'nomination',
      id: row.id,
      sort: category.sort_order,
      award_name: named.award_name,
      nominee_type: row.section_id ? 'section' : 'individual',
      awardee_name: named.nominee_name,
      unit_name: employee?.section_name ?? null,
      position_title: employee?.position_title ?? null,
      nominator_name: named.nominator_display_name,
      has_plaque: Boolean(category.has_plaque),
      has_grant: Boolean(category.has_grant) && Number(tier?.max_amount ?? 0) > 0,
      max_grant: category.has_grant && tier ? Number(tier.max_amount) : null,
      ...releaseFields(row, nameOf),
    })
  }
  for (const row of choices) {
    const employee = row.employee_id ? await getEmployee(row.employee_id) : null
    awardees.push({
      key: `coh_choice-${row.id}`,
      kind: 'coh_choice',
      id: row.id,
      sort: Number.MAX_SAFE_INTEGER,
      award_name: COH_CHOICE_NAMES[row.choice_type],
      nominee_type: row.choice_type === 'section' ? 'section' : 'individual',
      awardee_name: row.choice_type === 'section' ? lookups.sections.get(row.section_id) : nameOf(row.employee_id),
      unit_name: employee?.section_name ?? null,
      position_title: employee?.position_title ?? null,
      nominator_name: 'Chief of Hospital',
      // The COH Choice award is not in the award categories, so its plaque and grant are open:
      // the Secretariat records whatever was given.
      has_plaque: true,
      has_grant: true,
      max_grant: null,
      ...releaseFields(row, nameOf),
    })
  }
  return awardees.sort((a, b) => a.sort - b.sort).map(({ sort: _sort, ...awardee }) => awardee)
}

// Every nomination of a cycle except drafts, which are still private to whoever is writing them.
async function listCycleNominations(cycle, lookups) {
  const nameOf = (id) => (id ? (lookups.names.get(id) ?? id) : null)
  const [rows] = await db.query("SELECT * FROM praise_nominations WHERE cycle_id = ? AND status <> 'draft' ORDER BY id", [cycle.id])
  return rows.map((row) => {
    const named = addNames(row, lookups)
    return {
      id: row.id,
      category_id: row.category_id,
      award_name: named.award_name,
      nominee_type: row.section_id ? 'section' : 'individual',
      nominee_name: named.nominee_name,
      nominator_name: named.nominator_display_name,
      status: row.status,
      disqualification_reason: row.disqualification_reason,
      remarks: row.remarks,
      submitted_at: row.submitted_at,
      validated_by_name: named.validated_by_name,
      validated_at: row.validated_at,
      endorsed_at: row.endorsed_at,
      coh_decided_at: row.coh_decided_at,
      conferment_date: row.conferment_date,
    }
  })
}

async function getRecords(cycleId) {
  const cycle = await getCycle(cycleId)
  const lookups = await loadLookups()
  return {
    cycle,
    awardees: await listAwardees(cycle, lookups),
    nominations: await listCycleNominations(cycle, lookups),
  }
}

function cleanDate(value, label) {
  if (value === null || value === undefined || value === '') return null
  const date = String(value)
  if (!ISO_DATE.test(date)) throw new HttpError(400, `Enter a valid ${label}.`)
  if (date > todayString()) throw new HttpError(400, `The ${label} cannot be in the future.`)
  return date
}

// The Secretariat records (or corrects, or clears) when an awardee's plaque and grant were released.
// Returns the updated records and what was newly released, for notifying the awardee.
async function recordRelease(body, actor) {
  if (!KINDS.includes(body?.kind)) throw new HttpError(400, 'Choose which awardee this release is for.')
  const id = Number(body.id)
  const records = await (async () => {
    const [[row]] = await db.query(`SELECT cycle_id FROM ${body.kind === 'nomination' ? 'praise_nominations' : 'praise_coh_choices'} WHERE id = ?`, [id])
    if (!row) throw new HttpError(404, 'Awardee not found.')
    return getRecords(row.cycle_id)
  })()
  const awardee = records.awardees.find((item) => item.kind === body.kind && item.id === id)
  if (!awardee) throw new HttpError(409, 'Only an award winner or COH Choice awardee can have releases recorded.')

  const plaque = cleanDate(body.plaque_released_on, 'plaque release date')
  if (plaque && !awardee.has_plaque) throw new HttpError(400, 'This award has no plaque.')

  const rawAmount = body.grant_amount
  const amount = rawAmount === null || rawAmount === undefined || rawAmount === '' ? null : Number(rawAmount)
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) throw new HttpError(400, 'Enter a grant amount greater than zero.')
  if (amount !== null && !awardee.has_grant) throw new HttpError(400, 'This award has no cash grant.')
  if (amount !== null && awardee.max_grant !== null && amount > awardee.max_grant) {
    throw new HttpError(400, `The grant for this award is at most ₱${awardee.max_grant.toLocaleString('en-PH')}.`)
  }
  if (amount !== null && amount >= 1e8) throw new HttpError(400, 'Enter a smaller grant amount.')
  const grantDate = cleanDate(body.grant_released_on, 'grant release date')
  if (grantDate && amount === null) throw new HttpError(400, 'Enter the grant amount released.')

  const values = {
    plaque_released_on: plaque,
    grant_amount: amount === null ? null : Math.round(amount * 100) / 100,
    grant_released_on: grantDate,
    release_recorded_by: plaque || amount !== null || grantDate ? actor.id : null,
  }
  await db.query(`UPDATE ${body.kind === 'nomination' ? 'praise_nominations' : 'praise_coh_choices'} SET ? WHERE id = ?`, [values, id])

  return {
    records: await getRecords(records.cycle.id),
    newly: {
      plaque: Boolean(plaque && !awardee.plaque_released_on),
      grant: Boolean(grantDate && !awardee.grant_released_on),
    },
    awardee,
    values,
  }
}

// A cycle's numbers per award and its grants against the budget.
async function getReport(cycleId) {
  const cycle = await getCycle(cycleId)
  const lookups = await loadLookups()
  const nominations = await listCycleNominations(cycle, lookups)
  const awardees = await listAwardees(cycle, lookups)

  const used = new Set(nominations.map((nomination) => nomination.category_id))
  const categories = [...lookups.categories.values()]
    .filter((category) => category.is_active || used.has(category.id))
    .sort((a, b) => a.sort_order - b.sort_order)

  const grantOf = (awardee) => (awardee.grant_released_on ? awardee.grant_amount : 0)
  // Not yet released: what was entered, else the award's maximum.
  const pendingOf = (awardee) => (!awardee.has_grant || awardee.grant_released_on ? 0 : (awardee.grant_amount ?? awardee.max_grant ?? 0))

  const awards = categories.map((category) => {
    const rows = nominations.filter((nomination) => nomination.category_id === category.id)
    const winners = awardees.filter(
      (awardee) => awardee.kind === 'nomination' && rows.some((row) => row.id === awardee.id),
    )
    return {
      key: `category-${category.id}`,
      award_name: category.name,
      nominee_type: category.nominee_type,
      submitted: rows.length,
      disqualified: rows.filter((row) => row.status === 'disqualified').length,
      closed: rows.filter((row) => row.status === 'closed').length,
      validated: rows.filter((row) => PASSED_VALIDATION.includes(row.status)).length,
      shortlisted: rows.filter((row) => SHORTLISTED.includes(row.status) || (row.status === 'not_selected' && row.endorsed_at)).length,
      awarded: winners.length,
      awardees: winners.map((awardee) => awardee.awardee_name),
      grants_released: winners.reduce((sum, awardee) => sum + grantOf(awardee), 0),
      grants_pending: winners.reduce((sum, awardee) => sum + pendingOf(awardee), 0),
    }
  })

  const choices = awardees.filter((awardee) => awardee.kind === 'coh_choice')
  if (choices.length > 0) {
    awards.push({
      key: 'coh-choice',
      award_name: 'COH Choice Award',
      nominee_type: 'both',
      submitted: null,
      disqualified: null,
      closed: null,
      validated: null,
      shortlisted: null,
      awarded: choices.length,
      awardees: choices.map((awardee) => awardee.awardee_name),
      grants_released: choices.reduce((sum, awardee) => sum + grantOf(awardee), 0),
      grants_pending: choices.reduce((sum, awardee) => sum + pendingOf(awardee), 0),
    })
  }

  const sum = (key) => awards.reduce((total, award) => total + (award[key] ?? 0), 0)
  const released = sum('grants_released')
  const pending = sum('grants_pending')
  return {
    cycle,
    totals: {
      submitted: sum('submitted'),
      disqualified: sum('disqualified'),
      closed: sum('closed'),
      validated: sum('validated'),
      shortlisted: sum('shortlisted'),
      awarded: awardees.length,
      plaques_released: awardees.filter((awardee) => awardee.plaque_released_on).length,
      plaques_due: awardees.filter((awardee) => awardee.has_plaque).length,
      grants_released: released,
      grants_pending: pending,
    },
    budget: {
      allocation: cycle.budget,
      released,
      pending,
      remaining: cycle.budget === null ? null : cycle.budget - released,
      remaining_after_pending: cycle.budget === null ? null : cycle.budget - released - pending,
    },
    awards,
    awardees,
  }
}

module.exports = { getRecords, getReport, recordRelease }
