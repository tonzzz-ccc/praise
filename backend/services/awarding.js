// After screening: the Secretariat endorses each award's shortlisted nominees to the Chief of
// Hospital (COH), the COH picks one winner per award and makes the two COH Choice picks, and the
// Secretariat records each winner's conferment date.
const { db } = require('../config/db')
const { getEmployee, getPdsRecords, listActiveEmployees, listSections } = require('./emis')
const { MIN_YEARS_OF_SERVICE, summarizeService, todayString } = require('./eligibility')
const { HttpError, addNames, isOwnNomination, loadLookups } = require('./nominations')
const { average, loadScores, weightedTotal } = require('./screening')

// Nominations past screening: shortlisted, endorsed, picked, or endorsed and not picked.
const AWARDING_SQL = `SELECT * FROM praise_nominations
  WHERE cycle_id = ? AND (status IN ('shortlisted', 'endorsed', 'awarded') OR (status = 'not_selected' AND endorsed_at IS NOT NULL))
  ORDER BY category_id, tier_id, id`

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CHOICE_TYPES = ['section', 'employee']

async function getCycle(cycleId) {
  const [[cycle]] = await db.query('SELECT id, name, status FROM praise_award_cycles WHERE id = ?', [cycleId])
  if (!cycle) throw new HttpError(404, 'Award cycle not found.')
  return cycle
}

// Where one award stands: still in screening, ready to endorse, with the COH, or decided.
function awardStage(rows, stillScreening) {
  if (rows.some((row) => row.status === 'awarded')) return 'decided'
  if (rows.some((row) => row.status === 'endorsed')) return 'with_coh'
  return stillScreening ? 'screening' : 'ready'
}

async function listCohChoices(cycleId, lookups) {
  const [rows] = await db.query('SELECT * FROM praise_coh_choices WHERE cycle_id = ?', [cycleId])
  const nameOf = (id) => (id ? (lookups.names.get(id) ?? id) : null)
  return Object.fromEntries(
    CHOICE_TYPES.map((type) => {
      const row = rows.find((item) => item.choice_type === type)
      return [
        type,
        row
          ? {
              ...row,
              awardee_name: type === 'section' ? lookups.sections.get(row.section_id) : nameOf(row.employee_id),
              chosen_by_name: nameOf(row.chosen_by),
              conferment_recorded_by_name: nameOf(row.conferment_recorded_by),
            }
          : null,
      ]
    }),
  )
}

// One entry per award in the cycle that has reached the shortlist, with its nominees.
async function listAwarding(cycleId) {
  const cycle = await getCycle(cycleId)
  const [rows] = await db.query(AWARDING_SQL, [cycle.id])
  const [screening] = await db.query(
    "SELECT category_id, COUNT(*) AS total FROM praise_nominations WHERE cycle_id = ? AND status = 'validated' GROUP BY category_id",
    [cycle.id],
  )
  const lookups = await loadLookups()
  const scores = await loadScores(rows.map((row) => row.id))
  const nameOf = (id) => (id ? (lookups.names.get(id) ?? id) : null)

  const awards = new Map()
  for (const row of rows) {
    const category = lookups.categories.get(row.category_id)
    if (!awards.has(category.id)) {
      awards.set(category.id, { category_id: category.id, award_name: category.name, nominee_type: category.nominee_type, nominations: [] })
    }
    const { form_responses: _responses, eligibility_snapshot: _snapshot, ...named } = addNames(row, lookups)
    const own = scores.filter((score) => score.nomination_id === row.id)
    awards.get(category.id).nominations.push({
      ...named,
      tier_label: lookups.tiers.get(row.tier_id)?.tier_label ?? null,
      average: average(own.map((score) => weightedTotal(score.scores, category.criteria_weights))),
      scored_by: own.length,
      endorsed_by_name: nameOf(row.endorsed_by),
      coh_decided_by_name: nameOf(row.coh_decided_by),
      conferment_recorded_by_name: nameOf(row.conferment_recorded_by),
    })
  }

  const stillScreening = new Map(screening.map((row) => [row.category_id, Number(row.total)]))
  return {
    cycle,
    awards: [...awards.values()]
      .map((award) => ({
        ...award,
        still_screening: stillScreening.get(award.category_id) ?? 0,
        stage: awardStage(award.nominations, stillScreening.has(award.category_id)),
      }))
      .sort((a, b) => lookups.categories.get(a.category_id).sort_order - lookups.categories.get(b.category_id).sort_order),
    coh_choices: await listCohChoices(cycle.id, lookups),
  }
}

// The COH sees only awards the Secretariat has endorsed to them.
async function listForCoh(cycleId) {
  const data = await listAwarding(cycleId)
  return {
    ...data,
    awards: data.awards
      .filter((award) => ['with_coh', 'decided'].includes(award.stage))
      .map((award) => ({ ...award, nominations: award.nominations.filter((nomination) => nomination.endorsed_at) })),
    // Awards on their way but not endorsed yet: names and stage only, so the COH knows what is
    // coming and who it is waiting on, without seeing nominees before the Secretariat endorses them.
    upcoming: data.awards
      .filter((award) => ['screening', 'ready'].includes(award.stage))
      .map((award) => ({ category_id: award.category_id, award_name: award.award_name, stage: award.stage })),
  }
}

async function inTransaction(work) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

function cleanIds(body) {
  const cycleId = Number(body?.cycle_id)
  const categoryId = Number(body?.category_id)
  if (!Number.isInteger(cycleId) || !Number.isInteger(categoryId)) throw new HttpError(400, 'Choose an award cycle and award.')
  return { cycleId, categoryId }
}

// Endorses every shortlisted nominee of one award (one per grant level) to the COH. Screening for
// the award must be finished, so the COH chooses from the complete shortlist.
async function endorseAward(body, actor) {
  const { cycleId, categoryId } = cleanIds(body)
  const [[{ open }]] = await db.query(
    "SELECT COUNT(*) AS open FROM praise_nominations WHERE cycle_id = ? AND category_id = ? AND status = 'validated'",
    [cycleId, categoryId],
  )
  if (Number(open) > 0) throw new HttpError(409, 'Screening for this award is not finished. Finalize every level first.')

  const [result] = await db.query(
    "UPDATE praise_nominations SET status = 'endorsed', endorsed_by = ?, endorsed_at = NOW() WHERE cycle_id = ? AND category_id = ? AND status = 'shortlisted'",
    [actor.id, cycleId, categoryId],
  )
  if (result.affectedRows === 0) throw new HttpError(409, 'There is no shortlisted nominee to endorse for this award. Reload the page.')
  return listAwarding(cycleId)
}

// Takes an award back from the COH, only while they have not picked its winner.
async function withdrawEndorsement(body) {
  const { cycleId, categoryId } = cleanIds(body)
  await inTransaction(async (connection) => {
    const [[{ decided }]] = await connection.query(
      "SELECT COUNT(*) AS decided FROM praise_nominations WHERE cycle_id = ? AND category_id = ? AND status = 'awarded' FOR UPDATE",
      [cycleId, categoryId],
    )
    if (Number(decided) > 0) throw new HttpError(409, 'The Chief of Hospital has already picked the winner of this award.')
    const [result] = await connection.query(
      "UPDATE praise_nominations SET status = 'shortlisted', endorsed_by = NULL, endorsed_at = NULL WHERE cycle_id = ? AND category_id = ? AND status = 'endorsed'",
      [cycleId, categoryId],
    )
    if (result.affectedRows === 0) throw new HttpError(409, 'This award is not with the Chief of Hospital. Reload the page.')
  })
  return listAwarding(cycleId)
}

// The COH picks one winner per award. The award's other endorsed nominees are not selected.
async function selectWinner(nominationId, actor) {
  const [[nomination]] = await db.query('SELECT * FROM praise_nominations WHERE id = ?', [nominationId])
  if (!nomination) throw new HttpError(404, 'Nomination not found.')
  if (nomination.status !== 'endorsed') {
    const decided = nomination.status === 'awarded' || (nomination.status === 'not_selected' && nomination.coh_decided_at)
    throw new HttpError(
      409,
      decided
        ? 'This award has already been decided. Reload the page.'
        : 'This nomination has not been endorsed to the Chief of Hospital. Reload the page.',
    )
  }
  if (await isOwnNomination(nomination, actor)) throw new HttpError(403, 'You cannot pick a nomination you are part of.')

  await inTransaction(async (connection) => {
    const [result] = await connection.query(
      `UPDATE praise_nominations SET status = IF(id = ?, 'awarded', 'not_selected'), coh_decided_by = ?, coh_decided_at = NOW()
       WHERE cycle_id = ? AND category_id = ? AND status = 'endorsed'`,
      [nomination.id, actor.id, nomination.cycle_id, nomination.category_id],
    )
    if (result.affectedRows === 0) throw new HttpError(409, 'This award has already been decided. Reload the page.')
  })
  return listForCoh(nomination.cycle_id)
}

// COH Choice employee: an active permanent employee with at least 3 years in the center. Local
// EMIS data is incomplete, so an employee with no Department work experience in their PDS is
// still offered, marked for checking; only a known shorter service rules them out.
async function listChoiceCandidates() {
  const permanent = (await listActiveEmployees()).filter((employee) => employee.employment_status === 'permanent')
  const pds = await getPdsRecords(permanent.map((employee) => employee.id))
  const today = todayString()
  const employees = permanent
    .map((employee) => {
      const service = summarizeService(pds.get(employee.id)?.workExperience ?? [], today)
      return {
        id: employee.id,
        name: employee.name,
        position_title: employee.position_title,
        section_name: employee.section_name,
        years_of_service: service?.years ?? null,
        date_hired: service?.date_hired ?? null,
        service_status: service ? 'passed' : 'unverified',
        meets_service: !service || service.years >= MIN_YEARS_OF_SERVICE,
      }
    })
    .filter((employee) => employee.meets_service)
    .map(({ meets_service: _meets, ...employee }) => employee)
  const sections = (await listSections()).map((section) => ({ id: section.id, name: section.name, division_name: section.division_name }))
  return { min_years: MIN_YEARS_OF_SERVICE, employees, sections }
}

async function setCohChoice(body, actor) {
  const cycle = await getCycle(Number(body?.cycle_id))
  const type = body?.choice_type
  if (!CHOICE_TYPES.includes(type)) throw new HttpError(400, 'Choose a section or an employee.')
  const remarks = String(body?.remarks ?? '').trim().slice(0, 2000) || null
  const row = { cycle_id: cycle.id, choice_type: type, remarks, chosen_by: actor.id, chosen_at: new Date() }

  if (type === 'section') {
    const section = (await listSections()).find((item) => item.id === Number(body.section_id))
    if (!section) throw new HttpError(400, 'Choose an active section.')
    row.section_id = section.id
  } else {
    const employee = await getEmployee(String(body.employee_id ?? ''))
    if (!employee?.is_active || employee.employment_status !== 'permanent') throw new HttpError(400, 'Choose an active permanent employee.')
    if (employee.id === actor.id) throw new HttpError(403, 'You cannot choose yourself.')
    const candidates = await listChoiceCandidates()
    if (!candidates.employees.some((candidate) => candidate.id === employee.id)) {
      throw new HttpError(400, `${employee.name} has under ${MIN_YEARS_OF_SERVICE} years in the center.`)
    }
    row.employee_id = employee.id
  }

  try {
    await db.query('INSERT INTO praise_coh_choices SET ?', [row])
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, `The COH Choice ${type} for this cycle has already been chosen. Reload the page.`)
    throw error
  }
  return listForCoh(cycle.id)
}

// The Secretariat records (or corrects, or clears) when an award was conferred.
async function recordConferment(body, actor) {
  const date = body?.conferment_date ? String(body.conferment_date) : null
  if (date !== null && !ISO_DATE.test(date)) throw new HttpError(400, 'Enter a valid conferment date.')
  const values = [date, date ? actor.id : null, Number(body?.id)]

  if (body?.kind === 'nomination') {
    const [[row]] = await db.query('SELECT cycle_id, status FROM praise_nominations WHERE id = ?', [values[2]])
    if (!row) throw new HttpError(404, 'Nomination not found.')
    if (row.status !== 'awarded') throw new HttpError(409, 'Only an award winner can have a conferment date.')
    await db.query('UPDATE praise_nominations SET conferment_date = ?, conferment_recorded_by = ? WHERE id = ?', values)
    return listAwarding(row.cycle_id)
  }
  if (body?.kind === 'coh_choice') {
    const [[row]] = await db.query('SELECT cycle_id FROM praise_coh_choices WHERE id = ?', [values[2]])
    if (!row) throw new HttpError(404, 'COH Choice not found.')
    await db.query('UPDATE praise_coh_choices SET conferment_date = ?, conferment_recorded_by = ? WHERE id = ?', values)
    return listAwarding(row.cycle_id)
  }
  throw new HttpError(400, 'Choose what the conferment date is for.')
}

module.exports = {
  endorseAward,
  listAwarding,
  listChoiceCandidates,
  listForCoh,
  recordConferment,
  selectWinner,
  setCohChoice,
  withdrawEndorsement,
}
