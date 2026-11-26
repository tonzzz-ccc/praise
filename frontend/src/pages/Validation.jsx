import { useState } from 'react'
import { Alert, Button, Grid, Input, Segmented, Select, Table, Tag } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import PageHeader from '../components/PageHeader'
import ValidationDrawer from '../components/ValidationDrawer'
import { useApi } from '../hooks/useApi'
import { listNominations } from '../services/api'
import { formatShortDate } from '../utils/format'
import { getStatus } from '../utils/nominations'
import { useTableScroll } from '../hooks/useTableScroll'
import './AwardCategories.css'
import './Nominations.css'

const views = [
  { value: 'submitted', label: 'To review' },
  { value: 'validated', label: 'Validated' },
  { value: 'disqualified', label: 'Disqualified' },
]

const keepOnOneLine = () => ({ style: { whiteSpace: 'nowrap' } })

export default function Validation() {
  const tableScroll = useTableScroll()
  const screens = Grid.useBreakpoint()
  const [view, setView] = useState('submitted')
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [award, setAward] = useState()
  const { data: nominations, error, loading, reload } = useApi(listNominations)

  // Search and the award filter apply first, so each tab's count matches what it would show.
  const query = search.trim().toLowerCase()
  const filtered = (nominations ?? []).filter(
    (nomination) =>
      (!award || nomination.award_name === award) &&
      (!query ||
        [nomination.nominee_name, nomination.nominator_display_name, nomination.award_name, String(nomination.id)].some(
          (value) => value?.toLowerCase().includes(query),
        )),
  )
  const countFor = (status) => filtered.filter((nomination) => nomination.status === status).length
  const rows = filtered.filter((nomination) => nomination.status === view)
  const awardOptions = [...new Set((nominations ?? []).map((nomination) => nomination.award_name).filter(Boolean))]
    .sort()
    .map((name) => ({ value: name, label: name }))

  const columns = [
    { title: 'No.', dataIndex: 'id' },
    { title: 'Cycle', dataIndex: 'cycle_name', onCell: keepOnOneLine, responsive: ['lg'] },
    { title: 'Award', dataIndex: 'award_name' },
    { title: 'Nominee', dataIndex: 'nominee_name' },
    { title: 'Nominator', dataIndex: 'nominator_display_name', responsive: ['lg'] },
    {
      title: 'Status',
      dataIndex: 'status',
      responsive: ['sm'],
      render: (value) => {
        const { color, label } = getStatus(value)
        return <Tag color={color}>{label}</Tag>
      },
    },
    {
      title: 'Submitted',
      responsive: ['lg'],
      dataIndex: 'submitted_at',
      onCell: keepOnOneLine,
      render: (submittedAt) => formatShortDate(submittedAt),
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

      <div className="award-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search nominee, nominator, award or no."
          aria-label="Search nominations"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="award-toolbar-search"
        />
        {/* Phones get a dropdown, since the tabs do not fit across. */}
        {screens.sm === false ? (
          <Select
            aria-label="Filter by review status"
            value={view}
            onChange={setView}
            options={views.map(({ value, label }) => ({ value, label: `${label} (${countFor(value)})` }))}
            className="nominations-filter"
          />
        ) : (
          <div className="nominations-tabs">
            <Segmented
              aria-label="Filter by review status"
              value={view}
              onChange={setView}
              options={views.map(({ value, label }) => ({
                value,
                label: (
                  <span className="nominations-tab">
                    {label} <span className="nominations-tab-count">{countFor(value)}</span>
                  </span>
                ),
              }))}
            />
          </div>
        )}
        <Select
          allowClear
          aria-label="Filter by award"
          placeholder="All awards"
          value={award}
          onChange={setAward}
          options={awardOptions}
          className="nominations-filter"
        />
        <span className="award-toolbar-count">
          {rows.length} of {(nominations ?? []).filter((nomination) => nomination.status === view).length} nominations
        </span>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={tableScroll}
        locale={{ emptyText: view === 'submitted' && !query && !award ? 'Nothing waiting for review.' : 'No nominations match.' }}
      />

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
