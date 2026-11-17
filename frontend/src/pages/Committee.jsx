import { useCallback, useState } from 'react'
import { Alert, Button, Flex, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import PageHeader from '../components/PageHeader'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
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

function AddMemberModal({ open, cycleId, members, onCancel, onAdded }) {
  const [form] = Form.useForm()
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const { data: employees } = useApi(listEmployees)

  const options = roleOptions.map((role) => {
    const taken = seatsTaken(members, role.value)
    return { value: role.value, label: `${role.label} (${taken}/${role.seats})`, disabled: taken >= role.seats }
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

export default function Committee() {
  const { can } = useAccess()
  const canManage = can('committee.manage')
  const [chosenCycleId, setChosenCycleId] = useState()
  const [isAdding, setIsAdding] = useState(false)
  const [relieving, setRelieving] = useState(null)
  const [actionError, setActionError] = useState(null)

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

  const columns = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Role', dataIndex: 'role', render: roleLabel },
    {
      title: 'Status',
      key: 'status',
      render: (_, member) =>
        member.status === 'relieved' ? <Tag color="red">Relieved</Tag> : <Tag color="green">Active</Tag>,
    },
    {
      title: 'Relieved',
      responsive: ['md'],
      key: 'relieved',
      render: (_, member) => member.relieved_at && `${member.relieved_at.slice(0, 10)}: ${member.relieved_reason}`,
    },
    ...(canManage
      ? [
          {
            title: 'Actions',
            key: 'actions',
            render: (_, member) =>
              member.status === 'active' && (
                <Space>
                  <Button type="link" size="small" onClick={() => setRelieving(member)}>
                    Relieve
                  </Button>
                  <Popconfirm
                    title="Remove this entry?"
                    description="Use this only to correct a mistake."
                    okText="Remove"
                    onConfirm={() => remove(member.id)}
                  >
                    <Button type="link" size="small" danger>
                      Remove
                    </Button>
                  </Popconfirm>
                </Space>
              ),
          },
        ]
      : []),
  ]

  return (
    <>
      <PageHeader
        title="Committee"
        subtitle="The PRAISE Committee for each cycle: 1 Chairperson, 3 Secretariat members and 5 Members."
        extra={
          canManage && (
            <Button type="primary" icon={<PlusOutlined />} disabled={!cycleId || roleOptions.every((role) => seatsTaken(members ?? [], role.value) >= role.seats)}
              onClick={() => setIsAdding(true)}>
              Add Member
            </Button>
          )
        }
      />

      {(error || actionError) && (
        <Alert type="error" title={actionError ?? error.message} style={{ marginBottom: 16 }} />
      )}

      <Flex className="page-filters" gap={8} wrap="wrap" style={{ marginBottom: 16 }}>
        <Select
          aria-label="Award cycle"
          placeholder="Select a cycle"
          style={{ width: 240, maxWidth: '100%' }}
          value={cycleId}
          onChange={setChosenCycleId}
          options={(cycles ?? []).map((cycle) => ({ value: cycle.id, label: cycle.name }))}
        />
      </Flex>

      <Table rowKey="id" columns={columns} dataSource={members ?? []} loading={loading} scroll={{ x: 'max-content' }} />

      {canManage && (
        <>
          <AddMemberModal
            open={isAdding}
            cycleId={cycleId}
            members={members ?? []}
            onCancel={() => setIsAdding(false)}
            onAdded={() => {
              setIsAdding(false)
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
