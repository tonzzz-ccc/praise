import { useMemo, useState } from 'react'
import { Button, Checkbox, Col, Input, Modal, Row, Select, Table } from 'antd'
import {
  AppstoreOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  EditOutlined,
  FilterOutlined,
  KeyOutlined,
  LeftOutlined,
  RightOutlined,
  SafetyOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { navigation } from '../config/navigation'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import { listAllEmployees, saveRolePermissions, saveUserAccess } from '../services/api'
import { findUserRole, isAllowedForRole, lockedRolesLabel, userPermissions } from '../utils/access'
import { useTableScroll } from '../hooks/useTableScroll'
import './AccessManagement.css'

const PAGE_SIZES = [10, 25, 50]

const modules = navigation.flatMap((category) =>
  category.items.flatMap((item) => [
    { key: item.key, group: category.label, label: item.label },
    ...(item.features ?? []).map((feature) => ({
      key: feature.key,
      group: category.label,
      label: feature.label,
      isFeature: true,
      lockedTo: feature.secretariatOnly || feature.cohOnly ? lockedRolesLabel(feature.key) : null,
    })),
  ]),
)

const moduleGroups = navigation.map((category) => ({
  key: category.key,
  label: category.label,
  items: category.items,
  keys: category.items.flatMap((item) => [item.key, ...(item.features ?? []).map((feature) => feature.key)]),
}))

// Where a permission comes from, shown next to each module so it is clear why it is on or off.
function accessSource({ permissionKey, role, enabled, overrides }) {
  if (role.is_admin) return { label: 'Admin', className: 'am-source-admin' }
  if (!isAllowedForRole(permissionKey, role.code)) return { label: `${lockedRolesLabel(permissionKey)} only`, className: 'am-source-locked' }
  if (overrides[permissionKey] === true) return { label: 'Added for this person', className: 'am-source-added' }
  if (overrides[permissionKey] === false) return { label: 'Removed for this person', className: 'am-source-removed' }
  return enabled.has(permissionKey)
    ? { label: `From ${role.name}`, className: 'am-source-role' }
    : { label: 'Off', className: 'am-source-off' }
}

function AccessRow({ entry, isFeature, parentOn, role, enabled, overrides, onChange }) {
  const isOn = enabled.has(entry.key)
  const locked = role.is_admin || !isAllowedForRole(entry.key, role.code)
  const source = accessSource({ permissionKey: entry.key, role, enabled, overrides })
  const Icon = entry.icon
  const inactive = isFeature && isOn && !parentOn

  return (
    <div className={`am-access-row${isFeature ? ' am-access-feature' : ''}${isOn ? ' am-access-on' : ''}`}>
      <Checkbox
        aria-label={entry.label}
        checked={isOn}
        disabled={locked}
        onChange={(event) => onChange([entry.key], event.target.checked)}
      />
      <div className="am-access-text">
        <div className="am-access-name">
          {Icon && <Icon className="am-access-icon" />}
          <span>{entry.label}</span>
        </div>
        {entry.description && <p className="am-access-description">{entry.description}</p>}
        {inactive && <p className="am-access-warning">Not in effect until the module above is turned on.</p>}
      </div>
      <span className={`am-source ${source.className}`}>{source.label}</span>
    </div>
  )
}

function ModuleAccessList({ role, enabled, overrides, onChange }) {
  return (
    <div className="am-access-list">
      {moduleGroups.map((group) => {
        const onCount = group.keys.filter((key) => enabled.has(key)).length
        return (
          <section key={group.key} className="am-access-group">
            <header className="am-access-group-header">
              <span>{group.label}</span>
              <span className="am-access-count">
                {onCount} of {group.keys.length} on
              </span>
            </header>
            {group.items.map((item) => (
              <div key={item.key} className="am-access-module">
                <AccessRow entry={item} role={role} enabled={enabled} overrides={overrides} onChange={onChange} />
                {item.features?.map((feature) => (
                  <AccessRow
                    key={feature.key}
                    entry={feature}
                    isFeature
                    parentOn={enabled.has(item.key)}
                    role={role}
                    enabled={enabled}
                    overrides={overrides}
                    onChange={onChange}
                  />
                ))}
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}

function toUserRow(employee) {
  return {
    ...employee,
    display_name: `${employee.last_name}, ${employee.first_name}`.toUpperCase(),
    office:
      employee.division_code && employee.section_name
        ? `${employee.division_code} · ${employee.section_name}`
        : (employee.division_name ?? '—'),
  }
}

function initialsOf(user) {
  return `${user.last_name?.[0] ?? ''}${user.first_name?.[0] ?? ''}`.toUpperCase() || 'U'
}

function ModalTitle({ title, subtitle, icon }) {
  return (
    <>
      <div className="am-modal-accent" />
      <div className="am-modal-title">
        <div className="am-title-icon">{icon}</div>
        <div>
          <p className="am-title">{title}</p>
          <p className="am-subtitle">{subtitle}</p>
        </div>
      </div>
    </>
  )
}

function Section({ title, icon, right, children }) {
  return (
    <div className="am-section">
      <div className="am-section-header">
        <div className="am-section-title">
          {icon}
          {title}
        </div>
        {right}
      </div>
      <div className="am-section-body">{children}</div>
    </div>
  )
}

function ReadOnlyField({ id, label, value }) {
  return (
    <div>
      <label className="am-field-label" htmlFor={id}>
        {label}
      </label>
      <Input id={id} className="am-readonly" value={value} readOnly />
    </div>
  )
}

function AccountSettings({ user, access, onClose, onSaved }) {
  const saved = access.users.find((item) => item.employee_id === user.id)
  const [roleId, setRoleId] = useState(saved?.role_id ?? null)
  const [overrides, setOverrides] = useState(saved?.overrides ?? {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const role = findUserRole(access, { role_id: roleId, is_emis_admin: user.is_emis_admin })
  const fromRole = userPermissions(role)
  const enabled = userPermissions(role, overrides)
  const defaultRole = findUserRole(access, { role_id: null, is_emis_admin: user.is_emis_admin })
  const enabledCount = modules.filter((module) => enabled.has(module.key)).length
  const roleModules = modules.filter((module) => isAllowedForRole(module.key, role.code))
  const allEnabled = roleModules.every((module) => enabled.has(module.key))

  const setEnabled = (keys, isOn) => {
    const next = { ...overrides }
    for (const key of keys) {
      if (fromRole.has(key) === isOn) delete next[key]
      else next[key] = isOn
    }
    setOverrides(next)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const roleOverrides = Object.fromEntries(
        Object.entries(overrides).filter(([key]) => isAllowedForRole(key, role.code)),
      )
      await saveUserAccess(user.id, { role_id: roleId, overrides: role.is_admin ? {} : roleOverrides })
      onSaved(`Access saved for ${user.display_name}.`)
    } catch (failure) {
      setError(failure.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      className="am-modal"
      width={1000}
      footer={null}
      onCancel={onClose}
      title={<ModalTitle title="Account Settings" subtitle={user.display_name} icon={<SafetyOutlined />} />}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={9}>
          <Section title="Account Information" icon={<KeyOutlined />}>
            <ReadOnlyField id="am-name" label="Name" value={user.display_name} />
            <ReadOnlyField id="am-position" label="Position" value={user.position_title ?? '—'} />
            <ReadOnlyField id="am-username" label="Username" value={user.employee_no} />
            <div>
              <span className="am-field-label" id="am-role-label">
                Role
              </span>
              <Select
                aria-labelledby="am-role-label"
                className="am-role-select"
                value={roleId ?? 'default'}
                onChange={(value) => {
                  setRoleId(value === 'default' ? null : value)
                  setError(null)
                }}
                options={[
                  { value: 'default', label: `Default (${defaultRole?.name})` },
                  ...access.roles.map((item) => ({ value: item.id, label: item.name })),
                ]}
              />
            </div>
            {access.committee_seats?.[user.id] && (
              <p className="am-hint am-seat-hint">
                {access.committee_seats[user.id].label} on the {access.committee_seats[user.id].cycle_name} committee: they also
                get the {access.committee_seats[user.id].role_code === 'secretariat' ? 'Secretariat' : 'Committee member'} role's
                modules automatically while they hold the seat.
              </p>
            )}
            <p className="am-hint">Passwords are managed in EMIS.</p>
            <Button
              className="am-outline-button am-push-down"
              disabled={role.is_admin || Object.keys(overrides).length === 0}
              onClick={() => setOverrides({})}
            >
              Reset modules to role
            </Button>
          </Section>
        </Col>

        <Col xs={24} md={15}>
          <Section
            title="Module Access"
            icon={<AppstoreOutlined />}
            right={
              <Button
                className="am-select-all"
                size="small"
                disabled={role.is_admin}
                onClick={() => setEnabled(roleModules.map((module) => module.key), !allEnabled)}
              >
                {allEnabled ? 'Deselect All' : 'Select All'}
              </Button>
            }
          >
            <p className="am-hint">
              Each module adds a menu item. Its features only work while the module itself is on.
            </p>
            <ModuleAccessList role={role} enabled={enabled} overrides={overrides} onChange={setEnabled} />

            <div className="am-progress-row">
              <span>
                <strong>{enabledCount}</strong> of {modules.length} modules enabled
              </span>
              <div className="am-progress-track">
                <div className="am-progress-fill" style={{ width: `${(enabledCount / modules.length) * 100}%` }} />
              </div>
            </div>

            {role.is_admin && <p className="am-hint">Admin always has full access.</p>}
            {error && <p className="am-error">{error}</p>}

            <Button className="am-primary-button am-push-down" loading={saving} onClick={save}>
              Save Changes
            </Button>
          </Section>
        </Col>
      </Row>
    </Modal>
  )
}

function RolePermissions({ access, onClose, onSaved }) {
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const hasChanges = Object.keys(edits).length > 0

  const permissionsOf = (role) => edits[role.id] ?? role.permissions

  const toggle = (role, key, checked) => {
    const current = permissionsOf(role)
    setError(null)
    setEdits({
      ...edits,
      [role.id]: checked ? [...current, key] : current.filter((item) => item !== key),
    })
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      for (const [roleId, permissions] of Object.entries(edits)) {
        await saveRolePermissions(roleId, permissions)
      }
      onSaved('Role access saved.')
    } catch (failure) {
      setError(failure.message)
      setSaving(false)
    }
  }

  const columns = [
    {
      title: 'Module',
      key: 'module',
      fixed: 'left',
      render: (_, module) => (
        <>
          <span className={module.isFeature ? 'am-module-feature' : undefined}>{module.label}</span>
          {module.lockedTo && <span className="am-custom-tag">{module.lockedTo}</span>}
        </>
      ),
    },
    {
      title: 'Menu Group',
      dataIndex: 'group',
      render: (group) => <span className="am-group-tag">{group}</span>,
    },
    ...access.roles.map((role) => ({
      title: role.name,
      key: role.code,
      align: 'center',
      render: (_, module) => (
        <Checkbox
          aria-label={`${role.name}: ${module.label}`}
          checked={
            isAllowedForRole(module.key, role.code) && (role.is_admin || permissionsOf(role).includes(module.key))
          }
          disabled={role.is_admin || !isAllowedForRole(module.key, role.code)}
          onChange={(event) => toggle(role, module.key, event.target.checked)}
        />
      ),
    })),
  ]

  return (
    <Modal
      open
      className="am-modal"
      width={1000}
      footer={null}
      onCancel={onClose}
      title={
        <ModalTitle
          title="Role Permissions"
          subtitle="A feature only works when its menu item is also on. Admin always has full access."
          icon={<TeamOutlined />}
        />
      }
    >
      <Table
        className="am-table"
        rowKey="key"
        columns={columns}
        dataSource={modules}
        pagination={false}
        scroll={{ x: 'max-content', y: 420 }}
      />
      {error && <p className="am-error" style={{ marginTop: 12 }}>{error}</p>}
      <div className="am-role-actions" style={{ marginTop: 16 }}>
        <Button className="am-primary-button" loading={saving} disabled={!hasChanges} onClick={save}>
          Save Changes
        </Button>
        <Button className="am-outline-button" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  )
}

function Pagination({ page, totalPages, onChange }) {
  const numbers = []
  for (let number = Math.max(1, page - 2); number <= Math.min(totalPages, page + 2); number += 1) {
    numbers.push(number)
  }

  return (
    <nav className="am-pages" aria-label="Pagination">
      <button type="button" className="am-page-button" aria-label="First page" disabled={page === 1} onClick={() => onChange(1)}>
        <DoubleLeftOutlined />
      </button>
      <button type="button" className="am-page-button" aria-label="Previous page" disabled={page === 1} onClick={() => onChange(page - 1)}>
        <LeftOutlined />
      </button>
      {numbers[0] > 1 && <span className="am-page-gap">…</span>}
      {numbers.map((number) => (
        <button
          key={number}
          type="button"
          className={`am-page-button${number === page ? ' am-page-button-active' : ''}`}
          aria-current={number === page ? 'page' : undefined}
          onClick={() => onChange(number)}
        >
          {number}
        </button>
      ))}
      {numbers[numbers.length - 1] < totalPages && <span className="am-page-gap">…</span>}
      <button type="button" className="am-page-button" aria-label="Next page" disabled={page === totalPages} onClick={() => onChange(page + 1)}>
        <RightOutlined />
      </button>
      <button type="button" className="am-page-button" aria-label="Last page" disabled={page === totalPages} onClick={() => onChange(totalPages)}>
        <DoubleRightOutlined />
      </button>
    </nav>
  )
}

export default function AccessManagement() {
  const tableScroll = useTableScroll()
  const { access, reload } = useAccess()
  const { data: employees, error, loading } = useApi(listAllEmployees)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [editing, setEditing] = useState(null)
  const [showRoles, setShowRoles] = useState(false)
  const [notice, setNotice] = useState(null)

  const users = useMemo(
    () =>
      (employees ?? [])
        .map(toUserRow)
        .sort((a, b) => a.employee_no.localeCompare(b.employee_no, undefined, { numeric: true })),
    [employees],
  )
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return users.filter((user) => {
      const matchesStatus = status === 'all' || user.is_active === (status === 'active')
      const matchesSearch =
        !query ||
        [user.display_name, user.employee_no, user.position_title, user.office].some((value) =>
          String(value ?? '').toLowerCase().includes(query),
        )
      return matchesStatus && matchesSearch
    })
  }, [users, search, status])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const firstIndex = (currentPage - 1) * pageSize
  const rows = filtered.slice(firstIndex, firstIndex + pageSize)
  const hasFilters = status !== 'all' || search.trim() !== ''

  const handleSaved = (message) => {
    setEditing(null)
    setShowRoles(false)
    setNotice(message)
    reload()
  }

  const columns = [
    {
      title: '#',
      responsive: ['sm'],
      key: 'number',
      width: 44,
      render: (_, __, index) => <span className="am-row-number">{firstIndex + index + 1}</span>,
    },
    {
      title: 'Name',
      key: 'name',
      render: (_, user) => (
        <div className="am-user">
          <div className="am-avatar">{initialsOf(user)}</div>
          <span>
            {user.display_name}
            {access?.committee_seats?.[user.id] && (
              <span className="am-seat-tag">Committee · {access.committee_seats[user.id].label}</span>
            )}
          </span>
        </div>
      ),
    },
    { title: 'Position', dataIndex: 'position_title', render: (value) => value ?? '—', responsive: ['md'] },
    { title: 'Office / Section', dataIndex: 'office', responsive: ['lg'] },
    {
      title: 'Username',
      responsive: ['md'],
      dataIndex: 'employee_no',
      render: (value) => <span className="am-username">{value}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      render: (isActive) => (
        <div className={`am-status${isActive ? ' am-status-active' : ''}`}>
          <span className="am-status-dot" />
          {isActive ? 'Active' : 'Inactive'}
        </div>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, user) => (
        <Button
          className="am-edit-button"
          icon={<EditOutlined />}
          aria-label={`Edit ${user.display_name}`}
          onClick={() => {
            setEditing(user)
            setNotice(null)
          }}
        >
          Edit
        </Button>
      ),
    },
  ]

  return (
    <div className="am-card">
      <div className="am-card-header">
        <div className="am-title-group">
          <div className="am-title-icon">
            <SafetyOutlined />
          </div>
          <div>
            <h1 className="am-title">Access Management</h1>
            <p className="am-subtitle">Manage user accounts and system module permissions</p>
          </div>
        </div>
        <div className="am-header-actions">
          <Button className="am-outline-button" icon={<TeamOutlined />} onClick={() => setShowRoles(true)}>
            Role Permissions
          </Button>
          <Button
            className={`am-outline-button${showFilters ? ' am-outline-button-active' : ''}`}
            icon={<FilterOutlined />}
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters
          </Button>
        </div>
      </div>

      {notice && (
        <div className="am-success" role="status">
          {notice}
        </div>
      )}

      {showFilters && (
        <div className="am-filter-bar">
          <span className="am-filter-label" id="am-status-label">
            Status
          </span>
          <Select
            aria-labelledby="am-status-label"
            size="small"
            style={{ width: 120 }}
            value={status}
            onChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
          {hasFilters && (
            <Button
              type="link"
              size="small"
              danger
              onClick={() => {
                setStatus('all')
                setSearch('')
                setPage(1)
              }}
            >
              Clear all
            </Button>
          )}
        </div>
      )}

      <div className="am-count-bar">
        <p className="am-count">
          <strong>{filtered.length}</strong> users
        </p>
        <Input
          allowClear
          className="am-search"
          aria-label="Quick search"
          placeholder="Quick search…"
          prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
      </div>

      {error ? (
        <p className="am-error am-empty">{error.message}</p>
      ) : (
        <Table
          className="am-table"
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
          scroll={tableScroll}
          locale={{ emptyText: <div className="am-empty">No users found</div> }}
        />
      )}

      <div className="am-footer">
        <div className="am-page-size">
          <p className="am-count">
            <strong>
              {filtered.length === 0 ? 0 : firstIndex + 1}–{Math.min(firstIndex + pageSize, filtered.length)}
            </strong>{' '}
            of <strong>{filtered.length}</strong>
          </p>
          <div>
            <span className="am-show-label" id="am-page-size-label">
              Show
            </span>
            <Select
              aria-labelledby="am-page-size-label"
              size="small"
              value={pageSize}
              onChange={(value) => {
                setPageSize(value)
                setPage(1)
              }}
              options={PAGE_SIZES.map((size) => ({ value: size, label: size }))}
            />
          </div>
        </div>
        <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
      </div>

      {editing && access && (
        <AccountSettings
          key={editing.id}
          user={editing}
          access={access}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
      {showRoles && access && (
        <RolePermissions access={access} onClose={() => setShowRoles(false)} onSaved={handleSaved} />
      )}
    </div>
  )
}
