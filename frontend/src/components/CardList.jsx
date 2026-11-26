import { Avatar, Empty, Skeleton } from 'antd'
import { TeamOutlined } from '@ant-design/icons'
import '../pages/AwardCategories.css'
import '../pages/Nominations.css'
import './CardList.css'

// Shared pieces of the Nominations card layout, so list pages look the same: a toolbar
// (award-toolbar classes), then a grid of cards with a chip, a number badge and a status on top.

const initials = (name) =>
  (name ?? '?')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

// Chip icon, a small code badge (e.g. "No. 14") and a status tag on the right.
export function CardTop({ icon, code, status }) {
  return (
    <div className="award-card-top">
      <span className="award-card-chip" aria-hidden>
        {icon}
      </span>
      {code && <span className="award-card-code">{code}</span>}
      {status && <span className="award-card-switch">{status}</span>}
    </div>
  )
}

// Avatar with initials (or a team icon for a section) and the name, with an optional second line.
export function NomineeLine({ name, isSection, detail }) {
  return (
    <div className="nomination-card-nominee">
      <Avatar size={22} icon={isSection ? <TeamOutlined /> : undefined} className="nomination-card-avatar">
        {isSection ? null : initials(name)}
      </Avatar>
      <span className="card-list-nominee-text">
        <span className="nomination-card-nominee-name">{name ?? 'No nominee yet'}</span>
        {detail && <span className="card-list-nominee-detail">{detail}</span>}
      </span>
    </div>
  )
}

// A label and value inside a card's divided bottom section.
export function CardStat({ label, children }) {
  return (
    <div className="card-list-stat">
      <span className="card-list-stat-label">{label}</span>
      <span className="card-list-stat-value">{children}</span>
    </div>
  )
}

// The card grid, with loading skeletons and an empty message.
export function CardGrid({ loading, emptyText, children }) {
  const items = [children].flat(Infinity).filter(Boolean)
  if (loading) {
    return (
      <div className="award-grid">
        {[0, 1, 2].map((key) => (
          <div key={key} className="award-card">
            <Skeleton active />
          </div>
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="nominations-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      </div>
    )
  }
  return <div className="award-grid">{items}</div>
}

// One award's heading (with tags and buttons on the right) above its own card grid.
export function CardGroup({ title, tags, extra, children }) {
  return (
    <section className="card-list-group">
      <div className="card-list-group-header">
        <div className="card-list-group-title">
          <h2>{title}</h2>
          {tags}
        </div>
        {extra && <div className="card-list-group-extra">{extra}</div>}
      </div>
      {children}
    </section>
  )
}
