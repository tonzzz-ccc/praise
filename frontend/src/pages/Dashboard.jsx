import { Alert, Button, Empty, Skeleton, Tag, Tooltip } from 'antd'
import {
  CalendarOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  PlusCircleOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import { getNomineesPerCategory, listCycles, listMyNominations } from '../services/api'
import './Dashboard.css'

const DAY = 24 * 60 * 60 * 1000

const toDate = (value) => new Date(`${value.slice(0, 10)}T00:00:00`)
const todayString = () => new Date().toLocaleDateString('en-CA')
const formatDate = (value) => toDate(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const formatShortDate = (value) => toDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

// Where today falls in the nomination window, counted in whole days and including both end dates.
function windowState(cycle) {
  const today = toDate(todayString())
  const start = toDate(cycle.nomination_start)
  const end = toDate(cycle.nomination_end)
  const totalDays = Math.round((end - start) / DAY) + 1

  if (today < start) {
    const days = Math.round((start - today) / DAY)
    return { isOpen: false, label: 'Not yet open', count: days, unit: days === 1 ? 'day until it opens' : 'days until it opens', percent: 0 }
  }
  if (today > end) return { isOpen: false, label: 'Closed', count: 0, unit: 'days left', percent: 100 }

  const daysLeft = Math.round((end - today) / DAY) + 1
  return {
    isOpen: true,
    label: 'Open now',
    count: daysLeft,
    unit: daysLeft === 1 ? 'day left' : 'days left',
    percent: Math.round(((totalDays - daysLeft) / totalDays) * 100),
  }
}

function LoadingCard({ className = 'dashboard-card' }) {
  return (
    <div className={className}>
      <Skeleton active />
    </div>
  )
}

// The open cycle's nomination window, set in Settings > General.
function NominationHero({ cycles, error }) {
  const { can } = useAccess()
  const cycle = cycles?.find((item) => item.status === 'open')

  if (error) return <Alert type="error" title={error.message} className="dashboard-section" />
  if (!cycles) return <LoadingCard className="dashboard-card dashboard-section" />
  if (!cycle) {
    return (
      <div className="dashboard-card dashboard-section">
        <Empty description="No award cycle is open. Set one up in Settings." />
      </div>
    )
  }

  const state = windowState(cycle)
  return (
    <section className="dashboard-hero dashboard-section">
      <TrophyOutlined className="dashboard-hero-watermark" aria-hidden />
      <div className="dashboard-hero-body">
        <div className="dashboard-hero-main">
          <div className="dashboard-hero-tags">
            <span className="dashboard-hero-tag">
              <CalendarOutlined /> Nomination Period · {cycle.name}
            </span>
            <span className={`dashboard-hero-tag${state.isOpen ? ' is-open' : ''}`}>{state.label}</span>
          </div>
          <h2 className="dashboard-hero-title">All of the employees are enjoined to submit their nominations.</h2>
          <p className="dashboard-hero-dates">
            <strong>{formatDate(cycle.nomination_start)}</strong> to <strong>{formatDate(cycle.nomination_end)}</strong>
          </p>
          {state.isOpen && can('nominations.create') && (
            <Link to="/nominations/new">
              <Button size="large" icon={<PlusCircleOutlined />} className="dashboard-hero-button">
                Submit a Nomination
              </Button>
            </Link>
          )}
        </div>

        <div className="dashboard-hero-counter">
          <div className="dashboard-hero-count">
            <span>{state.count}</span> {state.unit}
          </div>
          <div className="dashboard-hero-caption">Nomination window</div>
          <div
            className="dashboard-hero-progress"
            role="progressbar"
            aria-label="Share of the nomination period that has passed"
            aria-valuenow={state.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div style={{ width: `${state.percent}%` }} />
          </div>
          <div className="dashboard-hero-range">
            <span>Starts {formatShortDate(cycle.nomination_start)}</span>
            <span>Ends {formatShortDate(cycle.nomination_end)}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function InsightCard({ icon, tone, label, badge, children }) {
  return (
    <div className="dashboard-card dashboard-insight">
      <div className="dashboard-insight-top">
        <span className={`dashboard-chip is-${tone}`} aria-hidden>
          {icon}
        </span>
        {badge}
      </div>
      <div className="dashboard-label">{label}</div>
      {children}
    </div>
  )
}

// The next scheduled awarding ceremony (set per cycle in Settings > General). Falls back to the
// most recent past ceremony so the date stays visible right after the event.
function CeremonyCard({ cycles }) {
  const today = todayString()
  const scheduled = (cycles ?? []).filter((cycle) => cycle.ceremony_date).sort((a, b) => a.ceremony_date.localeCompare(b.ceremony_date))
  const cycle = scheduled.find((item) => item.ceremony_date.slice(0, 10) >= today) ?? scheduled.at(-1)

  if (!cycle) {
    return (
      <InsightCard icon={<TrophyOutlined />} tone="gold" label="Awarding Ceremony">
        <div className="dashboard-value is-muted">Not scheduled</div>
        <div className="dashboard-note">The date is set per award cycle in Settings.</div>
      </InsightCard>
    )
  }

  const days = Math.round((toDate(cycle.ceremony_date) - toDate(today)) / DAY)
  const when = days > 1 ? `In ${days} days` : days === 1 ? 'Tomorrow' : days === 0 ? 'Today' : 'Held'
  return (
    <InsightCard
      icon={<TrophyOutlined />}
      tone="gold"
      label="Awarding Ceremony"
      badge={<Tag color={days >= 0 ? 'gold' : 'default'}>{cycle.name}</Tag>}
    >
      <div className="dashboard-value">{formatDate(cycle.ceremony_date)}</div>
      <div className="dashboard-note">
        <ClockCircleOutlined /> <span className={days >= 0 ? 'dashboard-accent' : undefined}>{when}</span>
      </div>
    </InsightCard>
  )
}

// The signed-in user's own nominations in the open cycle.
function MyNominationsCard({ cycleId }) {
  const { data, error } = useApi(listMyNominations)
  if (error) return <Alert type="error" title={error.message} />
  if (!data) return <LoadingCard />

  const mine = cycleId ? data.filter((nomination) => nomination.cycle_id === cycleId) : data
  const drafts = mine.filter((nomination) => nomination.status === 'draft').length
  const sent = mine.length - drafts
  const sentPercent = mine.length ? Math.round((sent / mine.length) * 100) : 0

  return (
    <InsightCard
      icon={<FileTextOutlined />}
      tone="blue"
      label="My Nominations"
      badge={
        mine.length > 0 && (
          <span className="dashboard-badges">
            <Tag color="blue">{plural(drafts, 'draft')}</Tag>
            <Tag color="green">{sent} submitted</Tag>
          </span>
        )
      }
    >
      <div className="dashboard-value">
        {mine.length} <small>{cycleId ? 'this cycle' : 'total'}</small>
      </div>
      {mine.length > 0 ? (
        <Tooltip title={`${sentPercent}% submitted`}>
          <div className="dashboard-mini-bar" aria-label={`${sentPercent}% of your nominations are submitted`}>
            <div style={{ width: `${sentPercent}%` }} />
          </div>
        </Tooltip>
      ) : (
        <div className="dashboard-note">
          <Link to="/nominations">Go to Nominations</Link>
        </div>
      )}
    </InsightCard>
  )
}

function TotalNomineesCard({ data }) {
  if (!data) return <LoadingCard />
  const total = data.categories.reduce((sum, category) => sum + category.total, 0)
  return (
    <InsightCard icon={<TeamOutlined />} tone="purple" label="Total Nominees">
      <div className="dashboard-value">{total}</div>
      <div className="dashboard-note">
        Submitted across {plural(data.categories.length, 'active award')}
        {data.cycle ? ` in ${data.cycle.name}` : ''}.
      </div>
    </InsightCard>
  )
}

// Submitted nominations per award in the open cycle, largest first. Drafts and disqualified ones
// are left out. Each row names its award, count and share, so no legend is needed.
function NomineesPerAward({ data, error }) {
  if (error) return <Alert type="error" title={error.message} />
  if (!data) return <LoadingCard />
  if (!data.cycle) return null

  const total = data.categories.reduce((sum, category) => sum + category.total, 0)
  const ranked = [...data.categories].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const max = Math.max(1, ...ranked.map((category) => category.total))

  return (
    <section className="dashboard-card dashboard-awards">
      <div className="dashboard-awards-header">
        <div>
          <h3>Nominees per Award</h3>
          <p>Submitted nominations in {data.cycle.name}</p>
        </div>
      </div>
      <div className="dashboard-awards-body">
        {ranked.length === 0 ? (
          <Empty description="No active awards." />
        ) : (
          ranked.map((category) => {
            const share = total ? Math.round((category.total / total) * 1000) / 10 : 0
            const label = `${category.name}: ${plural(category.total, 'nominee')} (${share}%)`
            return (
              <div key={category.id} className="dashboard-award" aria-label={label}>
                <div className="dashboard-award-row">
                  <span className="dashboard-award-name">{category.name}</span>
                  <span className="dashboard-award-count">
                    {category.total} <small>({share}%)</small>
                  </span>
                </div>
                <div className="dashboard-award-track">
                  {category.total > 0 && <div style={{ width: `${(category.total / max) * 100}%` }} />}
                </div>
              </div>
            )
          })
        )}
        {ranked.length > 0 && total === 0 && (
          <p className="dashboard-awards-empty">No nominations have been submitted yet this cycle.</p>
        )}
      </div>
    </section>
  )
}

export default function Dashboard() {
  const { can } = useAccess()
  const { data: cycles, error: cyclesError } = useApi(listCycles)
  const { data: nominees, error: nomineesError } = useApi(getNomineesPerCategory)
  const openCycle = cycles?.find((cycle) => cycle.status === 'open')

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Overview of awards and nomination activity." />
      <NominationHero cycles={cycles} error={cyclesError} />
      <div className="dashboard-insights dashboard-section">
        <CeremonyCard cycles={cycles} />
        {can('nominations') && <MyNominationsCard cycleId={openCycle?.id} />}
        <TotalNomineesCard data={nominees} />
      </div>
      <NomineesPerAward data={nominees} error={nomineesError} />
    </>
  )
}
