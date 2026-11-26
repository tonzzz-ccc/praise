import { useEffect, useState } from 'react'
import { Alert, Avatar, Button, Empty, Grid, Input, message, Popconfirm, Segmented, Select, Skeleton, Tag, Tooltip } from 'antd'
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, SearchOutlined, TeamOutlined, TrophyOutlined, UserOutlined } from '@ant-design/icons'
import { Link, useLocation } from 'react-router-dom'
import NominationDetails from '../components/NominationDetails'
import PageHeader from '../components/PageHeader'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import { deleteDraft, listCategories, listCycles, listMyNominations } from '../services/api'
import { formatShortDate } from '../utils/format'
import { getStatus, nominationCriteria } from '../utils/nominations'
import './AwardCategories.css'
import './Nominations.css'

// Status tabs, each with a count. "Other" statuses (shortlisted, awarded, …) only show under All.
const statusTabs = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'validated', label: 'Validated' },
  { value: 'disqualified', label: 'Disqualified' },
]


const initials = (name) =>
  (name ?? '?')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

// Same card as Award Categories: chip, number badge and status on top, the award as the title,
// the nominee below it, tags, a divided bottom section and the actions in the footer.
function NominationCard({ nomination, canContinue, onView, onDelete }) {
  const status = getStatus(nomination.status) ?? { label: nomination.status, color: 'default' }
  const isDraft = nomination.status === 'draft'
  const isSection = Boolean(nomination.section_id)
  const documented = nomination.documented_criteria ?? 0
  const total = nominationCriteria.length

  return (
    <article className="award-card">
      <div className="award-card-top">
        <span className="award-card-chip" aria-hidden>
          <TrophyOutlined />
        </span>
        <span className="award-card-code">No. {nomination.id}</span>
        <span className="award-card-switch">
          <Tag color={status.color} className="nomination-card-status">
            {status.label}
          </Tag>
        </span>
      </div>

      <h3 className="award-card-title">{nomination.award_name}</h3>
      <div className="nomination-card-nominee">
        <Avatar size={22} icon={isSection ? <TeamOutlined /> : undefined} className="nomination-card-avatar">
          {isSection ? null : initials(nomination.nominee_name)}
        </Avatar>
        <span className="nomination-card-nominee-name">{nomination.nominee_name ?? 'No nominee yet'}</span>
      </div>

      <div className="award-card-tags">
        <Tag icon={isSection ? <TeamOutlined /> : <UserOutlined />}>{isSection ? 'Section/Committee' : 'Individual'}</Tag>
        {nomination.cycle_name && <Tag color="blue">{nomination.cycle_name}</Tag>}
      </div>

      <div className="award-card-grant">
        {isDraft ? (
          <>
            <div className="award-card-label">Criteria documented</div>
            <Tooltip title="Each criterion needs at least one supporting document before submitting.">
              <div className="nomination-card-progress">
                <div className="nomination-card-progress-track">
                  <div style={{ width: `${(documented / total) * 100}%` }} />
                </div>
                <span>
                  {documented} of {total}
                </span>
              </div>
            </Tooltip>
            <div className="nomination-card-meta">Saved {formatShortDate(nomination.updated_at)}</div>
          </>
        ) : (
          <>
            <div className="award-card-label">Submitted</div>
            <div className="nomination-card-date">{formatShortDate(nomination.submitted_at)}</div>
            {nomination.nominator_display_name && (
              <div className="nomination-card-meta">Nominated by {nomination.nominator_display_name}</div>
            )}
          </>
        )}
      </div>

      <div className="award-card-footer">
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onView(nomination.id)} style={{ paddingInline: 0 }}>
          View details
        </Button>
        {isDraft && canContinue && (
          <span className="nomination-card-actions">
            <Popconfirm
              title="Delete this draft?"
              description="The draft and its attached files are removed for good."
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete(nomination)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete draft No. ${nomination.id}`}>
                Delete
              </Button>
            </Popconfirm>
            <Link to={`/nominations/${nomination.id}/edit`}>
              <Button size="small" type="primary" icon={<EditOutlined />}>
                Continue
              </Button>
            </Link>
          </span>
        )}
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

  const [messageApi, messageHolder] = message.useMessage()
  const location = useLocation()
  const screens = Grid.useBreakpoint()

  // A draft deleted from its edit page comes back here to confirm it. The state is then cleared
  // without a re-render, so a page refresh does not show the message again.
  const deletedDraft = location.state?.deletedDraft
  useEffect(() => {
    if (!deletedDraft) return
    // The key keeps it to one message even when the effect runs twice (React's development mode).
    messageApi.success({ key: `deleted-draft-${deletedDraft}`, content: `Draft No. ${deletedDraft} deleted.` })
    window.history.replaceState({ ...window.history.state, usr: null }, '')
  }, [deletedDraft, messageApi])
  const { data: nominations, error, loading, reload } = useApi(listMyNominations)

  async function removeDraft(nomination) {
    try {
      await deleteDraft(nomination.id)
      messageApi.success(`Draft No. ${nomination.id} deleted.`)
    } catch (deleteError) {
      messageApi.error(deleteError.message)
    }
    reload()
  }
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
      {messageHolder}
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

      <div className="award-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search award, nominee or no."
          aria-label="Search nominations"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="award-toolbar-search"
        />
        {/* Phones get a dropdown, since five tabs do not fit across. */}
        {screens.sm === false ? (
          <Select
            aria-label="Filter by status"
            value={tab}
            onChange={setTab}
            options={statusTabs.map(({ value, label }) => ({ value, label: `${label} (${countFor(value)})` }))}
            className="nominations-filter"
          />
        ) : (
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
        )}
        <Select
          allowClear
          aria-label="Filter by cycle"
          placeholder="All cycles"
          value={cycleId}
          onChange={setCycleId}
          options={(cycles ?? []).map((cycle) => ({ value: cycle.id, label: cycle.name }))}
          className="nominations-filter"
        />
        <Select
          allowClear
          aria-label="Filter by award"
          placeholder="All awards"
          value={categoryId}
          onChange={setCategoryId}
          options={(categories ?? []).map((category) => ({ value: category.id, label: category.name }))}
          className="nominations-filter"
        />
        <span className="award-toolbar-count">
          {rows.length} of {(nominations ?? []).length} nominations
        </span>
      </div>

      {!nominations && loading ? (
        <div className="award-grid">
          {[0, 1, 2].map((key) => (
            <div key={key} className="award-card">
              <Skeleton active />
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
        <div className="award-grid">
          {rows.map((nomination) => (
            <NominationCard key={nomination.id} nomination={nomination} canContinue={canCreate} onView={setSelectedId} onDelete={removeDraft} />
          ))}
        </div>
      )}

      <NominationDetails nominationId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  )
}
