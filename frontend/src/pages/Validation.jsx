import { useState } from 'react'
import { Alert, Button, Segmented, Table, Tag } from 'antd'
import PageHeader from '../components/PageHeader'
import ValidationDrawer from '../components/ValidationDrawer'
import { useApi } from '../hooks/useApi'
import { listNominations } from '../services/api'
import { getStatus } from '../utils/nominations'

const views = [
  { value: 'submitted', label: 'To review' },
  { value: 'validated', label: 'Validated' },
  { value: 'disqualified', label: 'Disqualified' },
]

const keepOnOneLine = () => ({ style: { whiteSpace: 'nowrap' } })

export default function Validation() {
  const [view, setView] = useState('submitted')
  const [selectedId, setSelectedId] = useState(null)
  const { data: nominations, error, loading, reload } = useApi(listNominations)

  const rows = (nominations ?? []).filter((nomination) => nomination.status === view)

  const columns = [
    { title: 'No.', dataIndex: 'id' },
    { title: 'Cycle', dataIndex: 'cycle_name', onCell: keepOnOneLine, responsive: ['md'] },
    { title: 'Award', dataIndex: 'award_name' },
    { title: 'Nominee', dataIndex: 'nominee_name' },
    { title: 'Nominator', dataIndex: 'nominator_display_name', responsive: ['md'] },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (value) => {
        const { color, label } = getStatus(value)
        return <Tag color={color}>{label}</Tag>
      },
    },
    {
      title: 'Submitted',
      responsive: ['md'],
      dataIndex: 'submitted_at',
      onCell: keepOnOneLine,
      render: (submittedAt) => submittedAt?.slice(0, 10),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, nomination) => (
        <Button type="link" size="small" onClick={() => setSelectedId(nomination.id)}>
          {nomination.status === 'submitted' ? 'Review' : 'View'}
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Secretariat Validation"
        subtitle="Check that submitted nominations are complete and accurate, then validate or disqualify them."
      />

      {error && <Alert type="error" title={error.message} style={{ marginBottom: 16 }} />}

      <Segmented
        aria-label="Filter by review status"
        options={views}
        value={view}
        onChange={setView}
        style={{ marginBottom: 16 }}
      />

      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 'max-content' }} />

      <ValidationDrawer
        nominationId={selectedId}
        onClose={() => setSelectedId(null)}
        onDecided={() => {
          setSelectedId(null)
          reload()
        }}
      />
    </>
  )
}
