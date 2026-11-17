const { db } = require('../config/db')
const { getApprovedIpcrScores, getPdsRecords, listActiveEmployees } = require('./emis')

const PASSING_RATINGS = ['Very Satisfactory', 'Outstanding']
// The CSC SPMS adjectival scale, highest band first.
const RATING_BANDS = [
  { min: 4.5, label: 'Outstanding' },
  { min: 3.5, label: 'Very Satisfactory' },
  { min: 2.5, label: 'Satisfactory' },
  { min: 1.5, label: 'Unsatisfactory' },
  { min: 0, label: 'Poor' },
]
const MIN_YEARS_OF_SERVICE = 3
const RENOMINATION_GAP_YEARS = 3
// Dangal Level I and Level II are separate award categories (codes DANGAL and DANGAL_...).
// Both have no minimum length of service, and a win in either level blocks both for 3 years.
const DANGAL_CODE = /^DANGAL/
const isDangal = (category) => DANGAL_CODE.test(category?.code ?? '')
const DEPARTMENT_EMPLOYER = /\bDOH\b|DEPARTMENT OF HEALTH|\bMTRC\b|MALINAO TREATMENT/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// passed and failed are known facts. unverified means the records cannot say, so the
// check does not block the nomination and the Secretariat confirms it from the documents.
function check(key, label, status, failedLabel) {
  return { key, label, status, failed_label: failedLabel }
}

function todayString() {
  return new Date().toLocaleDateString('en-CA')
}

function isWithinNominationWindow(cycle, onDate) {
  return onDate >= cycle.nomination_start && onDate <= cycle.nomination_end
}

function fullYearsBetween(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const years = end.getFullYear() - start.getFullYear()
  const beforeAnniversary =
    end.getMonth() < start.getMonth() ||
    (end.getMonth() === start.getMonth() && end.getDate() < start.getDate())
  return beforeAnniversary ? years - 1 : years
}

// Counts from the earliest Department entry in the PDS work experience. Many entries are
// unfinished or split into contracts with short gaps, so adding up the periods undercounts.
function summarizeService(workExperience, onDate) {
  const startDates = workExperience
    .filter((entry) => DEPARTMENT_EMPLOYER.test(entry?.department ?? '') && ISO_DATE.test(entry.dateFrom ?? ''))
    .map((entry) => entry.dateFrom)
    .filter((date) => date <= onDate)
    .sort()

  if (startDates.length === 0) return null

  return { date_hired: startDates[0], years: fullYearsBetween(startDates[0], onDate) }
}

function checkService(pds, onDate) {
  const service = summarizeService(pds?.workExperience ?? [], onDate)
  const requirement = `At least ${MIN_YEARS_OF_SERVICE} years of service in the Department`

  if (!service) {
    return { service, result: check('service', `${requirement}: no Department work experience in the PDS`, 'unverified') }
  }
  return {
    service,
    result: check(
      'service',
      `${requirement} (PDS shows ${service.years}, since ${service.date_hired})`,
      service.years >= MIN_YEARS_OF_SERVICE ? 'passed' : 'failed',
      `under ${MIN_YEARS_OF_SERVICE} years of service, since ${service.date_hired}`,
    ),
  }
}

function checkRatings(ratings) {
  const requirement = 'Very Satisfactory or higher for the last 2 rating periods'

  if (ratings.length < 2) {
    return check('ratings', `${requirement}: no ratings on file, verify from the IPCR`, 'unverified')
  }
  return check(
    'ratings',
    `${requirement} (${ratings.join(', ')})`,
    ratings.every((rating) => PASSING_RATINGS.includes(rating)) ? 'passed' : 'failed',
    'rated below Very Satisfactory',
  )
}

// The PDS answers are self-declared and a "Yes" does not show whether the offense involves
// moral turpitude or the case is still pending, so they prompt a review instead of a failure.
function checkDeclaration(key, requirement, answers) {
  if (answers.some((answer) => answer === 'Yes')) {
    return check(key, `${requirement}: PDS declares "Yes", Secretariat must review`, 'unverified')
  }
  if (answers.every((answer) => answer === 'No')) {
    return check(key, `${requirement} (declared in the PDS)`, 'passed')
  }
  return check(key, `${requirement}: not answered in the PDS, Secretariat must verify`, 'unverified')
}

function checkQualifications(pds, ratings, onDate, category) {
  const { service, result } = checkService(pds, onDate)
  const serviceChecks = isDangal(category) ? [] : [result]
  return {
    service,
    checks: [
      ...serviceChecks,
      checkRatings(ratings),
      checkDeclaration('offense', 'No offense involving moral turpitude', [pds?.foundGuilty, pds?.convicted]),
      checkDeclaration('pending_case', 'No pending administrative or criminal case', [pds?.criminallyCharged]),
    ],
  }
}

function ratingLabel(score) {
  return RATING_BANDS.find((band) => score >= band.min).label
}

// Reads approved IPCR forms and praise_employee_ratings. When both cover a period, the IPCR wins.
async function getLastTwoRatings(employeeIds) {
  const byPeriod = new Map(employeeIds.map((id) => [id, new Map()]))
  if (employeeIds.length > 0) {
    const [rows] = await db.query(
      'SELECT employee_id, period_end, rating_label FROM praise_employee_ratings WHERE employee_id IN (?)',
      [employeeIds],
    )
    for (const row of rows) byPeriod.get(row.employee_id).set(row.period_end, row.rating_label)

    for (const row of await getApprovedIpcrScores(employeeIds)) {
      byPeriod.get(row.employee_id).set(row.period_end, ratingLabel(row.score))
    }
  }

  return new Map(
    [...byPeriod].map(([id, periods]) => [
      id,
      [...periods.keys()]
        .sort()
        .reverse()
        .slice(0, 2)
        .map((periodEnd) => periods.get(periodEnd)),
    ]),
  )
}

// Counted from the end of the cycle the award was won in, until conferment dates are recorded.
// Returns the date the employee can be nominated again, or null when they can be now.
// A win in either Dangal level counts for both levels.
async function findRenominationDate(employeeId, category, onDate) {
  if (!isDangal(category)) return null

  const [[{ eligible_on: eligibleOn }]] = await db.query(
    `SELECT DATE_FORMAT(MAX(DATE_ADD(c.period_end, INTERVAL ? YEAR)), '%M %e, %Y') AS eligible_on FROM praise_nominations n
     JOIN praise_award_cycles c ON c.id = n.cycle_id
     JOIN praise_award_categories ac ON ac.id = n.category_id
     WHERE n.employee_id = ? AND ac.code LIKE 'DANGAL%' AND n.status = 'awarded'
       AND DATE_ADD(c.period_end, INTERVAL ? YEAR) > ?`,
    [RENOMINATION_GAP_YEARS, employeeId, RENOMINATION_GAP_YEARS, onDate],
  )
  return eligibleOn
}

const gradeRange = (tier) =>
  tier.salary_grade_max === null ? `SG ${tier.salary_grade_min} and up` : `SG ${tier.salary_grade_min} to ${tier.salary_grade_max}`

// For awards whose levels follow salary grade (Dangal), the nominee's current salary grade must
// fall within one of the award's levels. A promoted employee moves to the higher level and can
// no longer be nominated under the lower one.
async function checkSalaryGrade(employee, category) {
  const graded = (category.tiers ?? []).filter((tier) => tier.salary_grade_min !== null)
  if (graded.length === 0) return null

  const label = 'Salary grade matches the award level'
  const grade = employee.salary_grade
  if (grade === null || grade === undefined) {
    return check('salary_grade', `${label}: no salary grade on record in EMIS, so the level cannot be set`, 'failed')
  }
  const fits = (tier) => grade >= tier.salary_grade_min && (tier.salary_grade_max === null || grade <= tier.salary_grade_max)
  const match = graded.find(fits)
  if (match) return check('salary_grade', `SG ${grade} matches ${match.tier_label} (${gradeRange(match)})`, 'passed')

  // Points the nominator to the Dangal level that does match the current salary grade.
  let suggestion = ''
  if (isDangal(category)) {
    const [rows] = await db.query(
      `SELECT c.name, t.salary_grade_min, t.salary_grade_max FROM praise_award_categories c
       JOIN praise_award_category_tiers t ON t.category_id = c.id
       WHERE c.code LIKE 'DANGAL%' AND c.id <> ? AND c.is_active = 1 AND t.salary_grade_min IS NOT NULL`,
      [category.id],
    )
    const other = rows.find(fits)
    if (other) suggestion = `. Nominate under ${other.name} instead`
  }
  const ranges = graded.map((tier) => `${tier.tier_label} (${gradeRange(tier)})`).join(', ')
  return check('salary_grade', `SG ${grade} is outside ${ranges}${suggestion}.`, 'failed')
}

function summarize(checks) {
  return {
    is_eligible: checks.every((item) => item.status !== 'failed'),
    needs_review: checks.some((item) => item.status === 'unverified'),
  }
}

async function checkIndividualEligibility(employee, category, cycleId, onDate, nominationId) {
  const pdsRecords = await getPdsRecords([employee.id])
  const ratings = await getLastTwoRatings([employee.id])
  const { service, checks } = checkQualifications(pdsRecords.get(employee.id), ratings.get(employee.id), onDate, category)
  const renominationDate = await findRenominationDate(employee.id, category, onDate)
  const salaryGrade = await checkSalaryGrade(employee, category)
  const awardName = isDangal(category) ? 'the Dangal ng MTRC Award (Level I or II)' : category.name

  const allChecks = [
    ...(salaryGrade ? [salaryGrade] : []),
    ...checks,
    renominationDate
      ? check(
          'renomination',
          `This employee received ${awardName} within the last ${RENOMINATION_GAP_YEARS} years and can be nominated for it again on ${renominationDate}.`,
          'failed',
        )
      : check('renomination', `No win in ${isDangal(category) ? 'either Dangal level' : 'this category'} in the last ${RENOMINATION_GAP_YEARS} years`, 'passed'),
  ]

  return {
    checks: allChecks,
    ...summarize(allChecks),
    snapshot: {
      checked_at: onDate,
      date_hired: service?.date_hired ?? null,
      years_of_service: service?.years ?? null,
      checks: allChecks,
      ...summarize(allChecks),
    },
  }
}

// A group award goes to the section, committee or unit as a whole. Every current member belongs
// to it regardless of hire date, so the individual service, rating and declaration checks do not
// apply. Members are listed only for reference, and none is excluded.
async function checkSectionEligibility(sectionId, onDate) {
  const employees = await listActiveEmployees()
  const members = employees
    .filter((employee) => employee.section_id === sectionId && ['permanent', 'cos'].includes(employee.employment_status))
    .map((employee) => ({ employee_id: employee.id, name: employee.name, is_eligible: true }))

  const isEligible = members.length > 0
  const checks = [
    check(
      'members',
      isEligible
        ? `Group of ${members.length} current ${members.length === 1 ? 'member' : 'members'}; all are included regardless of hire date.`
        : 'This section, committee or unit has no current members to receive the award.',
      isEligible ? 'passed' : 'failed',
    ),
  ]
  const result = { is_eligible: isEligible, needs_review: false }

  return {
    members,
    checks,
    ...result,
    snapshot: { checked_at: onDate, member_count: members.length, members, checks, ...result },
  }
}

module.exports = {
  MIN_YEARS_OF_SERVICE,
  summarizeService,
  checkIndividualEligibility,
  checkSectionEligibility,
  isWithinNominationWindow,
  todayString,
}
