import { allPermissionKeys, cohOnlyKeys, secretariatOnlyKeys } from '../config/navigation'

const ROLES_WITH_SECRETARIAT_FEATURES = ['admin', 'secretariat']
const ROLES_WITH_COH_FEATURES = ['admin', 'coh']

// An EMIS admin defaults to Admin and everyone else to Nominator until given a role.
export function findUserRole(access, user) {
  const defaultCode = user?.is_emis_admin ? 'admin' : 'nominator'
  return (
    access.roles.find((role) => role.id === user?.role_id) ??
    access.roles.find((role) => role.code === defaultCode)
  )
}

export function isAllowedForRole(key, roleCode) {
  if (cohOnlyKeys.includes(key)) return ROLES_WITH_COH_FEATURES.includes(roleCode)
  return ROLES_WITH_SECRETARIAT_FEATURES.includes(roleCode) || !secretariatOnlyKeys.includes(key)
}

// The label shown where a permission is locked to certain roles.
export function lockedRolesLabel(key) {
  return cohOnlyKeys.includes(key) ? 'Chief of Hospital and Admin' : 'Secretariat and Admin'
}

function rolePermissions(role) {
  return role?.is_admin ? allPermissionKeys : (role?.permissions ?? [])
}

// A user's permissions are their role's, plus or minus their own overrides.
// Admins always keep everything so nobody can lock Access Management out. Apart from
// Admin, only the Secretariat can hold the Secretariat-only permissions.
export function userPermissions(role, overrides = {}) {
  const permissions = new Set(rolePermissions(role))

  if (!role?.is_admin) {
    for (const [key, isAllowed] of Object.entries(overrides)) {
      if (isAllowed) permissions.add(key)
      else permissions.delete(key)
    }
  }
  return new Set([...permissions].filter((key) => isAllowedForRole(key, role?.code)))
}

export function signedInPermissions(me) {
  const keys = me?.is_admin ? allPermissionKeys : (me?.permissions ?? [])
  return new Set(keys.filter((key) => isAllowedForRole(key, me?.role_code)))
}

// Returns null when the preview no longer matches a role or person.
export function permissionsForPreview(access, preview) {
  if (preview.startsWith('user:')) {
    const user = access.users.find((item) => item.employee_id === preview.slice(5))
    return user ? userPermissions(findUserRole(access, user), user.overrides) : null
  }

  const role = access.roles.find((item) => `role:${item.id}` === preview)
  return role ? userPermissions(role) : null
}

// A feature only counts when its menu item is also allowed.
export function hasPermission(permissions, key) {
  return permissions.has(key) && permissions.has(key.split('.')[0])
}
