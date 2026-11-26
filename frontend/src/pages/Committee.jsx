import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Popconfirm, Select, Tag } from 'antd'
import { CrownOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, SolutionOutlined, StopOutlined, UserOutlined } from '@ant-design/icons'
import { CardGrid, CardGroup, CardStat, CardTop } from '../components/CardList'
import PageHeader from '../components/PageHeader'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import { formatShortDate } from '../utils/format'
import {
  addCommitteeMember,
  listCommittee,
  listCycles,
  listEmployees,
  relieveCommitteeMember,
  removeCommitteeMember,
} from '../services/api'

// Fixed seats per cycle, matching the backend.
const roleOptions = [
  { value: 'chair', label: 'Chairperson', seats: 1 },
  { value: 'secretariat', label: 'Secretariat', seats: 3 },
  { value: 'member', label: 'Member', seats: 5 },
]

const seatsTaken = (members, role) => members.filter((member) => member.role === role).length

const roleLabel = (value) => roleOptions.find((role) => role.value === value)?.label

function AddMemberModal({ open, cycleId, members, role, onCancel, onAdded }) {
  const [form] = Form.useForm()
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const { data: employees } = useApi(listEmployees)

  // Opened from a vacant seat, the role is filled in already.
  useEffect(() => {
    if (open) form.setFieldsValue({ role: role ?? undefined })
  }, [open, role, form])

  const options = roleOptions.map((option) => {
    const taken = seatsTaken(members, option.value)
    return { value: option.value, label: `${option.label} (${taken}/${option.seats})`, disabled: taken >= option.seats }
  })

  async function submit(values) {
    setSaving(true)
    setError(null)
    try {
      await addCommitteeMember({ ...values, cycle_id: cycleId })
      form.resetFields()
      onAdded()
    } catch (saveError) {
      setError(saveError.message)
    }
    setSaving(false)
  }

  return (
    <Modal
      open={open}
      title="Add Committee Member"
      okText="Add"
      okButtonProps={{ loading: saving }}
      onOk={() => form.submit()}
      onCancel={onCancel}
    >
      {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="employee_id" label="Employee" rules={[{ required: true, message: 'Select an employee.' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Select an employee"
            options={(employees ?? []).map((employee) => ({ value: employee.id, label: employee.name }))}
          />
        </Form.Item>
        <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Select a role.' }]}>
          <Select placeholder="Select a role" options={options} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

function RelieveModal({ member, onCancel, onRelieved }) {
  const [form] = Form.useForm()
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function submit({ reason }) {
    setSaving(true)
    setError(null)
    try {
      await relieveCommitteeMember(member.id, reason)
      form.resetFields()
      onRelieved()
    } catch (saveError) {
      setError(saveError.message)
    }
    setSaving(false)
  }


  return (
    <Modal
      open={Boolean(member)}
      title={`Relieve ${member?.name ?? ''}?`}
      okText="Relieve"
      okButtonProps={{ danger: true, loading: saving }}
      onOk={() => form.submit()}
      onCancel={onCancel}
    >
      <p>The rest of the committee will continue the evaluation without them.</p>
      {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Enter a reason.' }, { max: 255 }]}>
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  )
}

const roleIcons = { chair: <CrownOutlined />, secretariat: <SolutionOutlined />, member: <UserOutlined /> }

function MemberCard({ member, canManage, onRelieve, onRemove }) {
  const relieved = member.status === 'relieved'
  return (
    <article className={`award-card${relieved ? ' is-inactive' : ''}`}>
      <CardTop
        icon={roleIcons[member.role]}
        code={roleLabel(member.role)}
        status={
          <Tag color={relieved ? 'red' : 'green'} className="nomination-card-status">
            {relieved ? 'Relieved' : 'Active'}
          </Tag>
        }
      />
      <h3 className="award-card-title">{member.name}</h3>

      <div className="award-card-grant">
        <CardStat label="Employee No.">{member.employee_id}</CardStat>
        {relieved && (
          <>
            <CardStat label="Relieved on">{formatShortDate(member.relieved_at)}</CardStat>
            {member.relieved_reason && <div className="nomination-card-meta" style={{ whiteSpace: 'normal' }}>{member.relieved_reason}</div>}
          </>
        )}
      </div>

      {canManage && !relieved && (
        <div className="award-card-footer">
          <Popconfirm
            title="Remove this entry?"
            description="Use this only to correct a mistake."
            okText="Remove"
            okButtonProps={{ danger: true }}
            onConfirm={() => onRemove(member.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} style={{ paddingInline: 0 }}>
              Remove
            </Button>
          </Popconfirm>
          <Button size="small" icon={<StopOutlined />} onClick={() => onRelieve(member)}>
            Relieve
          </Button>
        </div>
      )}
    </article>
  )
}

function VacantSeat({ role, canManage, onAdd }) {
  return (
    <article className="award-card is-vacant">
      <CardTop icon={<PlusOutlined />} code={role.label} />
      <h3 className="award-card-title">Vacant seat</h3>
      <p className="award-card-description">No one holds this seat yet.</p>
      {canManage && (
        <div className="award-card-footer">
          <span />
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => onAdd(role.value)}>
            Add {role.label}
          </Button>
        </div>
      )}
    </article>
  )
}

export default function Committee() {
  const { can } = useAccess()
  const canManage = can('committee.manage')
  const [chosenCycleId, setChosenCycleId] = useState()
  // false = closed; otherwise the role to preset (null for any role).
  const [adding, setAdding] = useState(false)
  const [relieving, setRelieving] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [search, setSearch] = useState('')

  const { data: cycles } = useApi(listCycles)
  const cycleId = chosenCycleId ?? (cycles?.find((cycle) => cycle.status === 'open') ?? cycles?.[0])?.id
  const load = useCallback(() => (cycleId ? listCommittee(cycleId) : Promise.resolve([])), [cycleId])
  const { data: members, error, loading, reload } = useApi(load)

  async function remove(id) {
    setActionError(null)
    try {
      await removeCommitteeMember(id)
    } catch (removeError) {
      setActionError(removeError.message)
    }
    reload()
  }

  const all = members ?? []
  const totalSeats = roleOptions.reduce((sum, role) => sum + role.seats, 0)
  const isFull = roleOptions.every((role) => seatsTaken(all, role.value) >= role.seats)
  const query = search.trim().toLowerCase()
  const matches = (member) => !query || [member.name, member.employee_id].some((value) => value?.toLowerCase().includes(query))

  return (
    <>
      <PageHeader
        title="Committee"
        subtitle="The PRAISE Committee for each cycle: 1 Chairperson, 3 Secretariat members and 5 Members."
        extra={
          canManage && (
            <Button type="primary" icon={<PlusOutlined />} disabled={!cycleId || isFull} onClick={() => setAdding(null)}>
              Add Member
            </Button>
          )
        }
      />

      {(error || actionError) && <Alert type="error" title={actionError ?? error.message} style={{ marginBottom: 16 }} />}

      <div className="award-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search name or employee no."
          aria-label="Search committee members"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="award-toolbar-search"
        />
        <Select
          aria-label="Award cycle"
          placeholder="Select a cycle"
          value={cycleId}
          onChange={setChosenCycleId}
          options={(cycles ?? []).map((cycle) => ({ value: cycle.id, label: cycle.name }))}
          className="nominations-filter"
        />
        <span className="award-toolbar-count">
          {all.length} of {totalSeats} seats filled
        </span>
      </div>

      {loading && !members ? (
        <CardGrid loading />
      ) : (
        roleOptions.map((role) => {
          const seated = all.filter((member) => member.role === role.value)
          const shown = seated.filter(matches)
          const vacant = query ? 0 : Math.max(0, role.seats - seated.length)
          if (query && shown.length === 0) return null
          return (
            <CardGroup
              key={role.value}
              title={role.value === 'member' ? 'Members' : role.label}
              tags={
                <Tag color={seated.length >= role.seats ? 'green' : 'default'}>
                  {seated.length} of {role.seats} {role.seats === 1 ? 'seat' : 'seats'}
                </Tag>
              }
            >
              <CardGrid>
                {shown.map((member) => (
                  <MemberCard key={member.id} member={member} canManage={canManage} onRelieve={setRelieving} onRemove={remove} />
                ))}
                {Array.from({ length: vacant }, (_, index) => (
                  <VacantSeat key={`vacant-${index}`} role={role} canManage={canManage && Boolean(cycleId)} onAdd={setAdding} />
                ))}
              </CardGrid>
            </CardGroup>
          )
        })
      )}
      {query && all.length > 0 && !all.some(matches) && <CardGrid emptyText="No committee members match this search." />}

      {canManage && (
        <>
          <AddMemberModal
            open={adding !== false}
            role={adding || null}
            cycleId={cycleId}
            members={all}
            onCancel={() => setAdding(false)}
            onAdded={() => {
              setAdding(false)
              reload()
            }}
          />
          <RelieveModal
            member={relieving}
            onCancel={() => setRelieving(null)}
            onRelieved={() => {
              setRelieving(null)
              reload()
            }}
          />
        </>
      )}
    </>
  )
}
