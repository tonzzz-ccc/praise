const { db } = require('../config/db')
const { getEmployee, getEmployeeNames } = require('./emis')
const { HttpError } = require('./nominations')

// Fixed seats per cycle. A relieved member keeps their seat; the rest of the committee proceeds.
const SEATS = { chair: 1, secretariat: 3, member: 5 }
const ROLES = Object.keys(SEATS)
const ROLE_NAMES = { chair: 'Chairperson', secretariat: 'Secretariat member', member: 'Member' }

async function getMember(id) {
  const [[member]] = await db.query('SELECT * FROM praise_committee_members WHERE id = ?', [id])
  if (!member) throw new HttpError(404, 'Committee member not found.')
  return member
}

async function listMembers(cycleId) {
  const [rows] = await db.query(
    "SELECT * FROM praise_committee_members WHERE cycle_id = ? ORDER BY FIELD(role, 'chair', 'secretariat', 'member'), id",
    [cycleId],
  )
  const names = await getEmployeeNames()
  const nameOf = (employeeId) => names.get(employeeId) ?? employeeId

  return rows.map((row) => ({ ...row, name: nameOf(row.employee_id) }))
}

async function assertNotNominated(cycleId, employeeId) {
  const [[nomination]] = await db.query(
    `SELECT n.id FROM praise_nominations n
     LEFT JOIN praise_nomination_members m ON m.nomination_id = n.id AND m.employee_id = ?
     WHERE n.cycle_id = ? AND n.status NOT IN ('draft', 'disqualified', 'closed') AND (n.employee_id = ? OR m.employee_id IS NOT NULL)
     LIMIT 1`,
    [employeeId, cycleId, employeeId],
  )
  if (nomination) {
    throw new HttpError(409, 'This employee, or their section, is nominated in this cycle, so they cannot join its committee.')
  }
}

async function assertSeatOpen(cycleId, role) {
  const [[{ total }]] = await db.query(
    'SELECT COUNT(*) AS total FROM praise_committee_members WHERE cycle_id = ? AND role = ?',
    [cycleId, role],
  )
  if (Number(total) >= SEATS[role]) {
    const seats = SEATS[role]
    throw new HttpError(409, `The committee has ${seats} ${ROLE_NAMES[role]}${seats > 1 ? 's' : ''} only, and that is already filled.`)
  }
}

async function addMember(body) {
  const cycleId = Number(body.cycle_id)
  const [[cycle]] = await db.query('SELECT id FROM praise_award_cycles WHERE id = ?', [cycleId])
  if (!cycle) throw new HttpError(400, 'Select an award cycle.')
  if (!ROLES.includes(body.role)) throw new HttpError(400, 'Select a committee role.')

  const employee = body.employee_id ? await getEmployee(body.employee_id) : null
  if (!employee?.is_active) throw new HttpError(400, 'Select an active employee.')
  await assertNotNominated(cycleId, employee.id)
  await assertSeatOpen(cycleId, body.role)

  try {
    const [result] = await db.query('INSERT INTO praise_committee_members SET ?', {
      cycle_id: cycleId,
      employee_id: employee.id,
      role: body.role,
    })
    return getMember(result.insertId)
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'This employee is already on the committee.')
    }
    throw error
  }
}

async function relieveMember(id, body) {
  const reason = String(body.reason ?? '').trim()
  if (!reason || reason.length > 255) throw new HttpError(400, 'Enter a reason of up to 255 characters.')

  const [result] = await db.query(
    "UPDATE praise_committee_members SET status = 'relieved', relieved_reason = ?, relieved_at = NOW() WHERE id = ? AND status = 'active'",
    [reason, id],
  )
  if (result.affectedRows === 0) {
    await getMember(id)
    throw new HttpError(409, 'This member has already been relieved.')
  }
  return getMember(id)
}

// For correcting a mistaken entry. A relieved member stays, as the record of the relief.
async function removeMember(id) {
  const member = await getMember(id)
  if (member.status === 'relieved') throw new HttpError(409, 'A relieved member stays on record and cannot be removed.')

  try {
    await db.query('DELETE FROM praise_committee_members WHERE id = ?', [id])
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      throw new HttpError(409, 'This member has already scored nominees, so they stay on record. Relieve them instead.')
    }
    throw error
  }
}

module.exports = { SEATS, addMember, listMembers, relieveMember, removeMember }
