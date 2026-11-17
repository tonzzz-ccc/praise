// Read-only access to EMIS. Do not add INSERT, UPDATE or DELETE statements here.
const { db } = require('../config/db')

const EMPLOYMENT_STATUSES = {
  PERMANENT: 'permanent',
  COS: 'cos',
  'CONTRACT OF SERVICE': 'cos',
}

function toEmployee(row) {
  return {
    id: row.user_id,
    employee_no: row.user_id,
    first_name: row.firstname,
    last_name: row.lastname,
    name: `${row.firstname} ${row.lastname}`,
    employment_status: EMPLOYMENT_STATUSES[row.employment_status] ?? 'other',
    position_title: row.position_title,
    salary_grade: row.salary_grade,
    section_id: row.section_id,
    section_name: row.section_name,
    division_code: row.division_code,
    division_name: row.division_name,
    is_active: Boolean(row.is_active),
    is_emis_admin: row.role === 'Admin',
  }
}

async function queryEmployees(where = '1 = 1', params = []) {
  const [rows] = await db.query(
    `SELECT u.user_id, u.firstname, u.lastname, u.employment_status, u.section_id, u.is_active, u.role,
            p.name AS position_title, p.salary_grade, s.name AS section_name, d.code AS division_code, d.name AS division_name
     FROM users u
     LEFT JOIN reference_positions p ON p.id = u.position_id
     LEFT JOIN reference_sections s ON s.id = u.section_id
     LEFT JOIN reference_divisions d ON d.id = u.division_id
     WHERE u.type = 'Employee' AND u.user_id IS NOT NULL AND ${where}
     ORDER BY u.lastname, u.firstname`,
    params,
  )
  return rows.map(toEmployee)
}

function listActiveEmployees() {
  return queryEmployees('u.is_active = 1')
}

function listAllEmployees() {
  return queryEmployees()
}

async function getEmployee(id) {
  const [employee] = await queryEmployees('u.user_id = ?', [id])
  return employee
}

async function getEmployeeNames() {
  const employees = await queryEmployees()
  return new Map(employees.map((employee) => [employee.id, employee.name]))
}

async function listSections() {
  const [rows] = await db.query(
    `SELECT s.id, s.name, d.name AS division_name
     FROM reference_sections s
     LEFT JOIN reference_divisions d ON d.id = s.division_id
     WHERE s.is_active = 1
     ORDER BY s.name`,
  )
  return rows
}

// The nominee's immediate supervisor(s), from the heads EMIS records for sections and divisions:
// - an employee: the head of their section; if they head it themselves (or have no section), the
//   head of their division
// - a section/committee/unit: the head of its division
// Returns active employees only, never the nominee themself. Empty when EMIS has no head on record.
async function listImmediateSupervisors({ employeeId, sectionId }) {
  let headIds = []
  if (employeeId) {
    const [[row]] = await db.query(
      `SELECT s.section_head, d.division_head FROM users u
       LEFT JOIN reference_sections s ON s.id = u.section_id
       LEFT JOIN reference_divisions d ON d.id = COALESCE(u.division_id, s.division_id)
       WHERE u.user_id = ?`,
      [employeeId],
    )
    if (row) headIds = row.section_head && row.section_head !== employeeId ? [row.section_head] : [row.division_head]
  } else if (sectionId) {
    const [[row]] = await db.query(
      `SELECT d.division_head FROM reference_sections s
       LEFT JOIN reference_divisions d ON d.id = s.division_id
       WHERE s.id = ?`,
      [sectionId],
    )
    if (row) headIds = [row.division_head]
  }
  headIds = headIds.filter((id) => id && id !== employeeId)
  if (headIds.length === 0) return []
  return queryEmployees('u.is_active = 1 AND u.user_id IN (?)', [headIds])
}

// Only the fields the eligibility check needs leave this function.
async function getPdsRecords(employeeIds) {
  if (employeeIds.length === 0) return new Map()

  const [rows] = await db.query(
    `SELECT user_id, form_data FROM emis_personal_data_sheets WHERE user_id IN (?)`,
    [employeeIds],
  )
  return new Map(
    rows.map((row) => {
      const form = typeof row.form_data === 'string' ? JSON.parse(row.form_data) : (row.form_data ?? {})
      return [
        row.user_id,
        {
          workExperience: Array.isArray(form.workExperience) ? form.workExperience : [],
          foundGuilty: form.q35a,
          criminallyCharged: form.q35b,
          convicted: form.q36,
        },
      ]
    }),
  )
}

// Only approved forms count. A form's score is the average of its target items' ratings.
async function getApprovedIpcrScores(employeeIds) {
  if (employeeIds.length === 0) return []

  const [rows] = await db.query(
    `SELECT f.user_id AS employee_id, f.period_end, AVG(i.average_rating) AS score
     FROM ipcr_forms f
     JOIN ipcr_target_items i ON i.ipcr_id = f.id
     WHERE f.status = 'approved' AND f.user_id IN (?)
     GROUP BY f.id, f.user_id, f.period_end
     HAVING score IS NOT NULL`,
    [employeeIds],
  )
  return rows.map((row) => ({ ...row, score: Number(row.score) }))
}

// Accepts a username or, when it is unique, the email on the employee's personal data sheet.
async function getLoginAccount(identifier) {
  let userId = identifier
  if (identifier.includes('@')) {
    const [matches] = await db.query(
      `SELECT user_id FROM emis_personal_data_sheets
       WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(form_data, '$.email'))) = LOWER(?) LIMIT 2`,
      [identifier],
    )
    if (matches.length !== 1) return null
    userId = matches[0].user_id
  }

  const [[account]] = await db.query(
    `SELECT user_id, password FROM users
     WHERE user_id = ? AND is_active = 1 AND type = 'Employee' LIMIT 1`,
    [userId],
  )
  return account ?? null
}

module.exports = {
  getApprovedIpcrScores,
  getEmployee,
  listImmediateSupervisors,
  getEmployeeNames,
  getLoginAccount,
  getPdsRecords,
  listActiveEmployees,
  listAllEmployees,
  listSections,
}
