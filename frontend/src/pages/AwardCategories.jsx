import { useState } from 'react'
import { Alert, Button, Empty, Input, Modal, notification, Segmented, Skeleton, Switch, Tag, Tooltip, Typography } from 'antd'
import {
  CheckCircleOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
  ReadOutlined,
  SearchOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons'
import CategoryModal from '../components/CategoryModal'
import PageHeader from '../components/PageHeader'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import { listCategoriesWithInactive, saveCategoryOrder, setCategoryActive } from '../services/api'
import { formatPeso } from '../utils/format'
import './AwardCategories.css'

const appliesToTags = {
  permanent: { color: 'blue', label: 'Permanent' },
  cos: { color: 'purple', label: 'Contract of Service' },
  both: { color: 'green', label: 'Permanent and COS' },
}

const nomineeTypes = {
  individual: { label: 'Individual', icon: <UserOutlined /> },
  section: { label: 'Section/Committee', icon: <TeamOutlined /> },
}

function tierRange(tier) {
  if (tier.salary_grade_min === null) return null
  return tier.salary_grade_max === null ? `SG ${tier.salary_grade_min}+` : `SG ${tier.salary_grade_min}-${tier.salary_grade_max}`
}

function GrantLevels({ category }) {
  if (!category.has_grant) return <span className="award-card-muted">No grant</span>
  if (category.tiers.length === 0) return <span className="award-card-muted">No levels set</span>
  return (
    <div className="award-card-tiers">
      {category.tiers.map((tier) => {
        const range = tierRange(tier)
        return (
          <Tooltip key={tier.id} title={tier.tier_label}>
            <span className="award-card-tier">
              {range ? `${range} · ` : ''}
              <strong>{formatPeso(tier.max_amount)}</strong>
            </span>
          </Tooltip>
        )
      })}
    </div>
  )
}

// The award's description and behavioral indicators (the "criteria"), shown from a card.
function CriteriaModal({ category, onClose }) {
  return (
    <Modal open title={category.name} onCancel={onClose} footer={<Button onClick={onClose}>Close</Button>} width={600}>
      <Typography.Paragraph type="secondary">{category.description}</Typography.Paragraph>
      <Typography.Text strong>Behavioral indicators</Typography.Text>
      <ul className="award-criteria-list">
        {category.behavioral_indicators.map((indicator) => (
          <li key={indicator}>
            <CheckCircleOutlined aria-hidden /> <span>{indicator}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

function AwardCard({ category, loading, canEdit, canManageInactive, onActiveChange, onEdit, onViewCriteria, drag }) {
  const isActive = Boolean(category.is_active)
  const appliesTo = appliesToTags[category.applies_to]
  const nominee = nomineeTypes[category.nominee_type]

  return (
    <article
      className={`award-card${isActive ? '' : ' is-inactive'}${drag?.isDragging ? ' is-dragging' : ''}`}
      draggable={Boolean(drag)}
      onDragStart={drag?.onDragStart}
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
      onDragEnd={drag?.onDragEnd}
    >
      <div className="award-card-top">
        {drag && (
          <Tooltip title="Drag to change the order. Arrow keys also move it.">
            <button
              type="button"
              className="award-card-handle"
              aria-label={`Move ${category.name}. Use the arrow keys to change its position.`}
              onKeyDown={drag.onKeyDown}
            >
              <HolderOutlined />
            </button>
          </Tooltip>
        )}
        <span className="award-card-chip" aria-hidden>
          <TrophyOutlined />
        </span>
        <span className="award-card-code">{category.code}</span>
        <span className="award-card-switch">
          {!isActive && <Tag style={{ margin: 0 }}>Inactive</Tag>}
          <Switch
            size="small"
            checked={isActive}
            loading={loading}
            disabled={isActive ? !canEdit : !canManageInactive}
            aria-label={`${category.name} active`}
            onChange={(checked) => onActiveChange(category, checked)}
          />
        </span>
      </div>

      <h3 className="award-card-title">{category.name}</h3>
      <p className="award-card-description">{category.description}</p>

      <div className="award-card-tags">
        {appliesTo && <Tag color={appliesTo.color}>{appliesTo.label}</Tag>}
        {nominee && <Tag icon={nominee.icon}>{nominee.label}</Tag>}
        {Boolean(category.has_plaque) && <Tag color="gold">Plaque</Tag>}
      </div>

      <div className="award-card-grant">
        <div className="award-card-label">Max grant</div>
        <GrantLevels category={category} />
      </div>

      <div className="award-card-footer">
        <Button type="link" size="small" icon={<ReadOutlined />} onClick={() => onViewCriteria(category)} style={{ paddingInline: 0 }}>
          View criteria
        </Button>
        {canEdit && (
          <Button size="small" icon={<EditOutlined />} aria-label={`Edit ${category.name}`} onClick={() => onEdit(category)}>
            Edit
          </Button>
        )}
      </div>
    </article>
  )
}

export default function AwardCategories() {
  const { can } = useAccess()
  const { data: categories, error: loadError, loading, reload } = useApi(listCategoriesWithInactive)
  const [saveError, setSaveError] = useState(null)
  const [isAdding, setIsAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  // Display order: the saved order, or a local one while it is being dragged. A reload of the
  // list drops the local order (adjusting state during render, not in an effect).
  const [localOrder, setLocalOrder] = useState(null)
  const [orderSource, setOrderSource] = useState(categories)
  if (orderSource !== categories) {
    setOrderSource(categories)
    setLocalOrder(null)
  }
  const orderedIds = localOrder ?? (categories ?? []).map((category) => category.id)
  const setOrderedIds = (update) => setLocalOrder(typeof update === 'function' ? update(orderedIds) : update)
  const [draggingId, setDraggingId] = useState(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [notifications, notificationHolder] = notification.useNotification()
  const [modal, modalHolder] = Modal.useModal()
  const error = saveError ?? loadError
  const canEdit = can('award_categories.edit')
  const canManageInactive = can('award_categories.manage_inactive')
  // People who cannot manage inactive awards never see them.
  const byId = new Map((categories ?? []).map((category) => [category.id, category]))
  const orderedCategories = orderedIds.map((id) => byId.get(id)).filter(Boolean)
  const visibleCategories = orderedCategories.filter((category) => category.is_active || canManageInactive)
  const query = search.trim().toLowerCase()
  const shownCategories = visibleCategories.filter(
    (category) =>
      (statusFilter === 'all' || Boolean(category.is_active) === (statusFilter === 'active')) &&
      (!query || category.name.toLowerCase().includes(query) || category.code.toLowerCase().includes(query)),
  )

  // Reordering works on the full list, so it is off while a search or filter hides some awards.
  const isFiltered = Boolean(query) || statusFilter !== 'all'
  const canReorder = canEdit && !isFiltered && !savingOrder

  // Moves one award to another's position. People who cannot see inactive awards only move the
  // visible ones; hidden ones keep their place in the full order.
  const moveTo = (ids, movingId, targetId) => {
    if (movingId === targetId) return ids
    const next = ids.filter((id) => id !== movingId)
    const at = next.indexOf(targetId)
    next.splice(ids.indexOf(movingId) < ids.indexOf(targetId) ? at + 1 : at, 0, movingId)
    return next
  }

  const saveOrder = async (ids) => {
    setSavingOrder(true)
    setSaveError(null)
    try {
      await saveCategoryOrder(ids)
      notifications.success({ title: 'Order saved', description: 'The Award list on the nomination form follows this order.' })
    } catch (failure) {
      setSaveError(failure)
      reload()
    } finally {
      setSavingOrder(false)
    }
  }

  const dragProps = (category) =>
    canReorder
      ? {
          isDragging: draggingId === category.id,
          onDragStart: (event) => {
            event.dataTransfer.effectAllowed = 'move'
            setDraggingId(category.id)
          },
          onDragOver: (event) => {
            if (draggingId === null) return
            event.preventDefault()
            if (draggingId !== category.id) setOrderedIds((ids) => moveTo(ids, draggingId, category.id))
          },
          onDrop: (event) => {
            event.preventDefault()
          },
          onDragEnd: () => {
            setDraggingId(null)
            const original = (categories ?? []).map((item) => item.id)
            if (orderedIds.join() !== original.join()) saveOrder(orderedIds)
          },
          onKeyDown: (event) => {
            const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key]
            if (!step) return
            event.preventDefault()
            const index = visibleCategories.findIndex((item) => item.id === category.id)
            const target = visibleCategories[index + step]
            if (!target) return
            const next = moveTo(orderedIds, category.id, target.id)
            setOrderedIds(next)
            saveOrder(next)
          },
        }
      : null

  const handleCreated = (category) => {
    setIsAdding(false)
    reload()
    notifications.success({ title: 'Award category added', description: `${category.name} was added.` })
  }

  const handleEdited = (category) => {
    setEditing(null)
    reload()
    notifications.success({ title: 'Award category updated', description: `${category.name} was updated.` })
  }

  const setActive = async (id, checked) => {
    setSaveError(null)
    try {
      await setCategoryActive(id, checked)
    } catch (failure) {
      setSaveError(failure)
    }
    reload()
  }

  // The card disappears for people who cannot manage inactive awards, and they cannot undo it.
  const handleActiveChange = (category, checked) => {
    if (checked || canManageInactive) {
      setActive(category.id, checked)
      return
    }
    modal.confirm({
      title: `Deactivate ${category.name}?`,
      content:
        'It will be hidden from all lists and forms, and only the Secretariat or Admin can reactivate it. Its existing records are kept.',
      okText: 'Deactivate',
      onOk: () => setActive(category.id, false),
    })
  }

  return (
    <>
      {notificationHolder}
      {modalHolder}
      <PageHeader
        title="Award Categories"
        subtitle="The awards employees can be nominated for, their grant levels and status."
        extra={
          can('award_categories.create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsAdding(true)}>
              Add Award Category
            </Button>
          )
        }
      />
      {error && <Alert type="error" title={error.message} style={{ marginBottom: 16 }} />}

      <div className="award-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search awards by name or code"
          aria-label="Search awards"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="award-toolbar-search"
        />
        {canManageInactive && (
          <Segmented
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
        )}
        <span className="award-toolbar-count">
          {canEdit && (isFiltered ? 'Clear the search and filter to reorder · ' : 'Drag cards to reorder · ')}
          {shownCategories.length} of {visibleCategories.length} awards
        </span>
      </div>

      {!categories && loading ? (
        <div className="award-grid">
          {[0, 1, 2].map((key) => (
            <div key={key} className="award-card">
              <Skeleton active />
            </div>
          ))}
        </div>
      ) : shownCategories.length === 0 ? (
        <Empty description={visibleCategories.length === 0 ? 'No award categories yet.' : 'No awards match your search.'} />
      ) : (
        <div className="award-grid">
          {shownCategories.map((category) => (
            <AwardCard
              key={category.id}
              category={category}
              loading={loading}
              canEdit={canEdit}
              canManageInactive={canManageInactive}
              onActiveChange={handleActiveChange}
              onEdit={setEditing}
              onViewCriteria={setViewing}
              drag={dragProps(category)}
            />
          ))}
        </div>
      )}

      {viewing && <CriteriaModal category={viewing} onClose={() => setViewing(null)} />}
      {isAdding && (
        <CategoryModal categories={categories ?? []} onClose={() => setIsAdding(false)} onSaved={handleCreated} />
      )}
      {editing && (
        <CategoryModal
          category={editing}
          categories={categories ?? []}
          onClose={() => setEditing(null)}
          onSaved={handleEdited}
        />
      )}
    </>
  )
}
