const { db } = require('../config/db')
const { getEmployee, listAllEmployees } = require('./emis')
const { HttpError } = require('./nominations')

const ADMIN_ROLE = 'admin'
const DEFAULT_ROLE = 'nominator'
const SECRETARIAT_ROLE = 'secretariat'
const COH_ROLE = 'coh'
const ACCESS_MANAGEMENT = 'access_management'
const PERMISSION_KEY = /^[a-z_]+(\.[a-z_]+)?$/

// Apart from Admin, which has everything, only the Secretariat role can hold these.
const SECRETARIAT_ONLY = [
  'award_categories.create',
  'award_categories.manage_inactive',
  'validation.review',
  'screening.results',
  'endorsement.manage',
  'records.manage',
]
// Apart from Admin, only the Chief of Hospital role can pick award winners.
const COH_ONLY = ['coh_approval.decide']

function assertPermissionKeys(keys) {
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string' || !PERMISSION_KEY.test(key))) {
    throw new HttpError(400, 'Invalid permission list.')
  }
}

function assertAllowedForRole(keys, role) {
  if (![ADMIN_ROLE, SECRETARIAT_ROLE].includes(role.code) && keys.some((key) => SECRETARIAT_ONLY.includes(key))) {
    throw new HttpError(400, 'Adding award categories, managing inactive ones, reviewing nominations, seeing screening results, endorsing to the Chief of Hospital and recording plaque and grant releases are for the Secretariat and Admin only.')
  }
  if (![ADMIN_ROLE, COH_ROLE].includes(role.code) && keys.some((key) => COH_ONLY.includes(key))) {
    throw new HttpError(400, 'Picking award winners is for the Chief of Hospital and Admin only.')
  }
}

async function getAccess() {
  const [roles] = await db.query('SELECT * FROM praise_access_roles ORDER BY id')
  const [permissions] = await db.query('SELECT * FROM praise_role_permissions')
  const [assignments] = await db.query('SELECT * FROM praise_user_access')
  const [overrides] = await db.query('SELECT * FROM praise_user_permission_overrides')
  const employees = new Map((await listAllEmployees()).map((employee) => [employee.id, employee]))
  // Seats that currently give access, so Access Management can show where a role comes from.
  const seats = await listCommitteeSeats()
  const committeeSeats = {}
  for (const seat of seats) {
    const current = committeeSeats[seat.employee_id]
    if (!current || (seat.role_code === SECRETARIAT_ROLE && current.role_code !== SECRETARIAT_ROLE)) {
      committeeSeats[seat.employee_id] = { role: seat.role, label: seat.seat_label, role_code: seat.role_code, cycle_name: seat.cycle_name }
    }
  }

  const employeeIds = new Set([
    ...assignments.map((row) => row.employee_id),
    ...overrides.map((row) => row.employee_id),
  ])

  return {
    committee_seats: committeeSeats,
    roles: roles.map((role) => ({
      ...role,
      is_admin: role.code === ADMIN_ROLE,
      permissions: permissions.filter((row) => row.role_id === role.id).map((row) => row.permission_key),
    })),
    users: [...employeeIds].map((employeeId) => ({
      employee_id: employeeId,
      name: employees.get(employeeId)?.name ?? employeeId,
      is_emis_admin: employees.get(employeeId)?.is_emis_admin ?? false,
      role_id: assignments.find((row) => row.employee_id === employeeId)?.role_id ?? null,
      overrides: Object.fromEntries(
        overrides
          .filter((row) => row.employee_id === employeeId)
          .map((row) => [row.permission_key, Boolean(row.is_allowed)]),
      ),
    })),
  }
}

async function findRole(id) {
  const [[role]] = await db.query('SELECT * FROM praise_access_roles WHERE id = ?', [id])
  if (!role) throw new HttpError(404, 'Role not found.')
  return role
}

async function loadRole(employee, roleId) {
  const [[role]] = roleId
    ? await db.query('SELECT * FROM praise_access_roles WHERE id = ?', [roleId])
    : await db.query('SELECT * FROM praise_access_roles WHERE code = ?', [employee.is_emis_admin ? ADMIN_ROLE : DEFAULT_ROLE])
  const [rows] = await db.query('SELECT permission_key FROM praise_role_permissions WHERE role_id = ?', [role.id])
  return { ...role, permissions: rows.map((row) => row.permission_key) }
}

function combinePermissions(role, overrides) {
  const permissions = new Set(role.permissions)
  for (const [key, isAllowed] of Object.entries(overrides)) {
    if (isAllowed) permissions.add(key)
    else permissions.delete(key)
  }
  return permissions
}

// A committee seat gives the matching access role automatically: the Secretariat seat gets the
// Secretariat role, the Chairperson and Members get the Committee role.
const SEAT_ROLES = { secretariat: SECRETARIAT_ROLE, chair: 'committee', member: 'committee' }
const SEAT_LABELS = { secretariat: 'Secretariat', chair: 'Chairperson', member: 'Member' }

// Active seats in cycles that are not closed. Being removed, relieved, or the cycle closing ends
// the seat's access on its own.
async function listCommitteeSeats(employeeId) {
  const [rows] = await db.query(
    `SELECT m.employee_id, m.role, c.name AS cycle_name FROM praise_committee_members m
     JOIN praise_award_cycles c ON c.id = m.cycle_id
     WHERE m.status = 'active' AND c.status <> 'closed' ${employeeId ? 'AND m.employee_id = ?' : ''}
     ORDER BY c.period_start DESC`,
    employeeId ? [employeeId] : [],
  )
  return rows.map((row) => ({ ...row, seat_label: SEAT_LABELS[row.role], role_code: SEAT_ROLES[row.role] }))
}

// What an employee can do: an assigned role, or by default Admin for EMIS admins and
// Nominator for everyone else, plus or minus their own overrides. Admin always has everything.
// A committee seat adds its role's permissions on top, and a Secretariat seat makes them Secretariat.
async function getUserAccess(employee) {
  const [[assignment]] = await db.query('SELECT role_id FROM praise_user_access WHERE employee_id = ?', [employee.id])
  const [rows] = await db.query(
    'SELECT permission_key, is_allowed FROM praise_user_permission_overrides WHERE employee_id = ?',
    [employee.id],
  )
  let role = await loadRole(employee, assignment?.role_id)
  const overrides = Object.fromEntries(rows.map((row) => [row.permission_key, Boolean(row.is_allowed)]))

  const seats = await listCommitteeSeats(employee.id)
  const seat = seats.find((item) => item.role_code === SECRETARIAT_ROLE) ?? seats[0]
  if (seat && role.code !== ADMIN_ROLE && !(role.code === SECRETARIAT_ROLE && seat.role_code !== SECRETARIAT_ROLE)) {
    const [[seatRole]] = await db.query('SELECT id FROM praise_access_roles WHERE code = ?', [seat.role_code])
    if (seatRole) {
      const fromSeat = await loadRole(employee, seatRole.id)
      role = { ...fromSeat, permissions: [...new Set([...role.permissions, ...fromSeat.permissions])] }
    }
  }

  return {
    role_name: role.name,
    role_code: role.code,
    is_admin: role.code === ADMIN_ROLE,
    committee_seat: seat ? { role: seat.role, label: seat.seat_label, cycle_name: seat.cycle_name } : null,
    permissions: [...combinePermissions(role, overrides)],
  }
}

function hasPermission(user, key) {
  if (user.is_admin) return true
  if (SECRETARIAT_ONLY.includes(key) && user.role_code !== SECRETARIAT_ROLE) return false
  if (COH_ONLY.includes(key) && user.role_code !== COH_ROLE) return false
  return user.permissions.includes(key) && user.permissions.includes(key.split('.')[0])
}

// Active employees who have any of the given permissions, for sending notifications. Only people
// whose access differs from the default (an assigned role, overrides, a committee seat, or EMIS
// admin) are checked, unless the default Nominator role itself grants one of the keys.
async function listUsersWithPermission(keys) {
  const employees = (await listAllEmployees()).filter((employee) => employee.is_active)
  const [[defaultRole]] = await db.query('SELECT id FROM praise_access_roles WHERE code = ?', [DEFAULT_ROLE])
  const [defaultGrants] = defaultRole
    ? await db.query('SELECT permission_key FROM praise_role_permissions WHERE role_id = ? AND permission_key IN (?)', [defaultRole.id, keys])
    : [[]]

  let candidates = employees
  if (defaultGrants.length === 0) {
    const [assigned] = await db.query('SELECT employee_id FROM praise_user_access UNION SELECT employee_id FROM praise_user_permission_overrides')
    const ids = new Set([...assigned.map((row) => row.employee_id), ...(await listCommitteeSeats()).map((seat) => seat.employee_id)])
    candidates = employees.filter((employee) => employee.is_emis_admin || ids.has(employee.id))
  }

  const matches = []
  for (const employee of candidates) {
    const user = await getUserAccess(employee)
    if (keys.some((key) => hasPermission(user, key))) matches.push(employee.id)
  }
  return matches
}

async function setRolePermissions(roleId, keys, actor) {
  assertPermissionKeys(keys)
  const role = await findRole(roleId)
  if (role.code === ADMIN_ROLE) throw new HttpError(400, 'The Admin role always has full access.')
  assertAllowedForRole(keys, role)

  // Stops people removing their own way back into Access Management.
  if (actor.role_name === role.name && !actor.is_admin && !keys.includes(ACCESS_MANAGEMENT)) {
    const [[override]] = await db.query(
      'SELECT is_allowed FROM praise_user_permission_overrides WHERE employee_id = ? AND permission_key = ?',
      [actor.id, ACCESS_MANAGEMENT],
    )
    if (!override?.is_allowed) throw new HttpError(400, 'You cannot remove your own access to Access Management.')
  }

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query('DELETE FROM praise_role_permissions WHERE role_id = ?', [role.id])
    for (const key of new Set(keys)) {
      await connection.query('INSERT INTO praise_role_permissions SET ?', { role_id: role.id, permission_key: key })
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
  return getAccess()
}

// A user with no role and no overrides is removed, which puts them back on their default role.
async function setUserAccess(employeeId, { role_id: roleId = null, overrides = {} }, actor) {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new HttpError(400, 'Invalid permission list.')
  }
  assertPermissionKeys(Object.keys(overrides))
  const employee = await getEmployee(employeeId)
  if (!employee) throw new HttpError(404, 'Employee not found.')
  const role = await loadRole(employee, roleId === null ? null : (await findRole(roleId)).id)
  assertAllowedForRole(Object.keys(overrides).filter((key) => overrides[key]), role)

  if (employeeId === actor.id) {
    const keepsAccess = role.code === ADMIN_ROLE || combinePermissions(role, overrides).has(ACCESS_MANAGEMENT)
    if (!keepsAccess) throw new HttpError(400, 'You cannot remove your own access to Access Management.')
  }

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query('DELETE FROM praise_user_access WHERE employee_id = ?', [employeeId])
    await connection.query('DELETE FROM praise_user_permission_overrides WHERE employee_id = ?', [employeeId])

    if (roleId !== null) {
      await connection.query('INSERT INTO praise_user_access SET ?', { employee_id: employeeId, role_id: roleId })
    }
    for (const [key, isAllowed] of Object.entries(overrides)) {
      await connection.query('INSERT INTO praise_user_permission_overrides SET ?', {
        employee_id: employeeId,
        permission_key: key,
        is_allowed: isAllowed ? 1 : 0,
      })
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
  return getAccess()
}

module.exports = { getAccess, getUserAccess, hasPermission, listUsersWithPermission, setRolePermissions, setUserAccess }
