import { useState } from 'react'
import { Alert, Avatar, Button, Empty, Input, Segmented, Select, Skeleton, Tag, Tooltip } from 'antd'
import { EditOutlined, EyeOutlined, PlusOutlined, SearchOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import NominationDetails from '../components/NominationDetails'
import PageHeader from '../components/PageHeader'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import { listCategories, listCycles, listMyNominations } from '../services/api'
import { getStatus, nominationCriteria } from '../utils/nominations'
import './Nominations.css'

// Status tabs, each with a count. "Other" statuses (shortlisted, awarded, …) only show under All.
const statusTabs = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'validated', label: 'Validated' },
  { value: 'disqualified', label: 'Disqualified' },
]

const formatDate = (value) =>
  new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const initials = (name) =>
  (name ?? '?')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

function NominationCard({ nomination, canContinue, onView }) {
  const status = getStatus(nomination.status) ?? { label: nomination.status, color: 'default' }
  const isDraft = nomination.status === 'draft'
  const isSection = Boolean(nomination.section_id)
  const documented = nomination.documented_criteria ?? 0
  const total = nominationCriteria.length

  return (
    <article className="nomination-card">
      <span className="nomination-card-chip" aria-hidden>
        {(nomination.award_name ?? '?').charAt(0)}
      </span>

      <div className="nomination-card-main">
        <div className="nomination-card-title">
          <span>{nomination.award_name}</span>
          <span className="nomination-card-no">No. {nomination.id}</span>
        </div>
        <div className="nomination-card-nominee">
          <Avatar size={22} icon={isSection ? <TeamOutlined /> : undefined} className="nomination-card-avatar">
            {isSection ? null : initials(nomination.nominee_name)}
          </Avatar>
          <span>{nomination.nominee_name ?? 'No nominee yet'}</span>
        </div>
        <div className="nomination-card-meta">
          {nomination.cycle_name}
          {nomination.nominator_display_name && <> · Nominated by {nomination.nominator_display_name}</>}
        </div>
        {isDraft && (
          <Tooltip title="Each criterion needs at least one supporting document before submitting.">
            <div className="nomination-card-progress">
              <div className="nomination-card-progress-track">
                <div style={{ width: `${(documented / total) * 100}%` }} />
              </div>
              <span>
                {documented} of {total} criteria documented
              </span>
            </div>
          </Tooltip>
        )}
      </div>

      <div className="nomination-card-side">
        <Tag color={status.color} className="nomination-card-status">
          {status.label}
        </Tag>
        <span className="nomination-card-date">
          {nomination.submitted_at ? `Submitted ${formatDate(nomination.submitted_at)}` : `Saved ${formatDate(nomination.updated_at)}`}
        </span>
        <div className="nomination-card-actions">
          <Button size="small" icon={<EyeOutlined />} onClick={() => onView(nomination.id)}>
            View
          </Button>
          {isDraft && canContinue && (
            <Link to={`/nominations/${nomination.id}/edit`}>
              <Button size="small" type="primary" icon={<EditOutlined />}>
                Continue
              </Button>
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}

export default function Nominations() {
  const { can } = useAccess()
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [cycleId, setCycleId] = useState()
  const [categoryId, setCategoryId] = useState()
  const [selectedId, setSelectedId] = useState(null)

  const { data: nominations, error, loading } = useApi(listMyNominations)
  const { data: cycles } = useApi(listCycles)
  const { data: categories } = useApi(listCategories)

  const query = search.trim().toLowerCase()
  // Search and the cycle/award filters apply first, so each tab's count matches what it would show.
  const filtered = (nominations ?? []).filter(
    (nomination) =>
      (!cycleId || nomination.cycle_id === cycleId) &&
      (!categoryId || nomination.category_id === categoryId) &&
      (!query ||
        [nomination.award_name, nomination.nominee_name, nomination.nominator_display_name, String(nomination.id)].some(
          (value) => value?.toLowerCase().includes(query),
        )),
  )
  const countFor = (value) => (value === 'all' ? filtered.length : filtered.filter((item) => item.status === value).length)
  const rows = tab === 'all' ? filtered : filtered.filter((nomination) => nomination.status === tab)
  const canCreate = can('nominations.create')

  return (
    <>
      <PageHeader
        title="Nominations"
        subtitle="Nominations you have entered, with their award, nominee and status."
        extra={
          canCreate && (
            <Link to="/nominations/new">
              <Button type="primary" icon={<PlusOutlined />}>
                New Nomination
              </Button>
            </Link>
          )
        }
      />

      {error && <Alert type="error" title={error.message} style={{ marginBottom: 16 }} />}

      <div className="nominations-toolbar">
        <div className="nominations-tabs">
          <Segmented
            value={tab}
            onChange={setTab}
            options={statusTabs.map(({ value, label }) => ({
              value,
              label: (
                <span className="nominations-tab">
                  {label} <span className="nominations-tab-count">{countFor(value)}</span>
                </span>
              ),
            }))}
          />
        </div>
        <div className="nominations-filters page-filters">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search award, nominee or no."
            aria-label="Search nominations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            allowClear
            aria-label="Filter by cycle"
            placeholder="All cycles"
            value={cycleId}
            onChange={setCycleId}
            options={(cycles ?? []).map((cycle) => ({ value: cycle.id, label: cycle.name }))}
          />
          <Select
            allowClear
            aria-label="Filter by award"
            placeholder="All awards"
            value={categoryId}
            onChange={setCategoryId}
            options={(categories ?? []).map((category) => ({ value: category.id, label: category.name }))}
          />
        </div>
      </div>

      {!nominations && loading ? (
        <div className="nominations-list">
          {[0, 1, 2].map((key) => (
            <div key={key} className="nomination-card">
              <Skeleton active avatar paragraph={{ rows: 1 }} />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="nominations-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={(nominations ?? []).length === 0 ? "You haven't entered any nominations yet." : 'No nominations match these filters.'}
          >
            {(nominations ?? []).length === 0 && canCreate && (
              <Link to="/nominations/new">
                <Button type="primary" icon={<UserOutlined />}>
                  Start your first nomination
                </Button>
              </Link>
            )}
          </Empty>
        </div>
      ) : (
        <div className="nominations-list">
          {rows.map((nomination) => (
            <NominationCard key={nomination.id} nomination={nomination} canContinue={canCreate} onView={setSelectedId} />
          ))}
        </div>
      )}

      <NominationDetails nominationId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  )
}
