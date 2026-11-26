import { useState } from 'react'
import { Alert, Button, Flex, notification, Table, Tabs, Tag } from 'antd'
import { EditOutlined, FastForwardOutlined, PlusOutlined } from '@ant-design/icons'
import CycleModal from '../components/CycleModal'
import PageHeader from '../components/PageHeader'
import SystemSettings from '../components/SystemSettings'
import { useApi } from '../hooks/useApi'
import { listCycles } from '../services/api'
import { nextCycleFrom } from '../utils/cycles'
import { formatMoney, formatShortDate } from '../utils/format'
import { useTableScroll } from '../hooks/useTableScroll'

const statusTags = {
  draft: { color: 'default', label: 'Draft' },
  open: { color: 'green', label: 'Open for nominations' },
  screening: { color: 'blue', label: 'Screening' },
  closed: { color: 'red', label: 'Closed' },
}

export default function Settings() {
  const tableScroll = useTableScroll()
  const { data: cycles, error, loading, reload } = useApi(listCycles)
  // null, 'new' (blank), 'next' (filled in from the latest cycle), or the cycle being edited.
  const [editing, setEditing] = useState(null)
  // Cycles are listed newest first, so the first one is the latest.
  const latest = cycles?.[0]
  const [tab, setTab] = useState('general')
  const [notifications, notificationHolder] = notification.useNotification()

  const handleSaved = (cycle, created, closed) => {
    setEditing(null)
    reload()
    window.dispatchEvent(new Event('praise:cycles-changed'))
    notifications.success({
      title: created ? 'Award cycle added' : 'Award cycle updated',
      description: closed.length
        ? `${cycle.name} was saved and is now open. ${closed.join(' and ')} was closed.`
        : `${cycle.name} was saved.`,
    })
  }

  const columns = [
    { title: 'Cycle', dataIndex: 'name' },
    {
      title: 'Selection period',
      key: 'period',
      responsive: ['lg'],
      render: (_, cycle) => `${cycle.period_start} to ${cycle.period_end}`,
    },
    {
      title: 'Nomination window',
      key: 'window',
      responsive: ['md'],
      render: (_, cycle) => `${formatShortDate(cycle.nomination_start)} to ${formatShortDate(cycle.nomination_end)}`,
    },
    {
      title: 'Awarding ceremony',
      dataIndex: 'ceremony_date',
      responsive: ['lg'],
      render: (date) => (date ? formatShortDate(date) : 'Not set'),
    },
    {
      title: 'Budget',
      dataIndex: 'budget',
      responsive: ['xl'],
      align: 'right',
      render: (budget) => (budget === null || budget === undefined ? 'Not set' : formatMoney(budget)),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status) => <Tag color={statusTags[status]?.color}>{statusTags[status]?.label ?? status}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, cycle) => (
        <Button size="small" icon={<EditOutlined />} aria-label={`Edit ${cycle.name}`} onClick={() => setEditing(cycle)}>
          Edit
        </Button>
      ),
    },
  ]

  return (
    <>
      {notificationHolder}
      <PageHeader
        title="Settings"
        subtitle={
          tab === 'general'
            ? 'Award cycles, their nomination windows and awarding ceremony dates. The nomination window sets when nominations can be submitted.'
            : 'How the system looks for everyone, such as the sidebar logo.'
        }
        extra={
          tab === 'general' && (
            <Flex gap={8} wrap="wrap">
              <Button icon={<PlusOutlined />} type={latest ? 'default' : 'primary'} onClick={() => setEditing('new')}>
                Add Award Cycle
              </Button>
              {latest && (
                <Button type="primary" icon={<FastForwardOutlined />} onClick={() => setEditing('next')}>
                  Start Next Cycle
                </Button>
              )}
            </Flex>
          )
        }
      />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'general',
            label: 'General',
            children: (
              <>
                {error && <Alert type="error" title={error.message} style={{ marginBottom: 16 }} />}
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={cycles ?? []}
                  loading={loading && !cycles}
                  pagination={false}
                  scroll={tableScroll}
                />
              </>
            ),
          },
          { key: 'system', label: 'System Settings', children: <SystemSettings /> },
        ]}
      />
      {editing && (
        <CycleModal
          cycle={typeof editing === 'object' ? editing : null}
          prefill={editing === 'next' ? nextCycleFrom(latest) : null}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
