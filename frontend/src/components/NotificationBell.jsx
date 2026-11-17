import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Button, Empty, Flex, Grid, Popover, Spin, Tooltip, Typography, message as antdMessage, theme } from 'antd'
import {
  BellOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  FileAddOutlined,
  KeyOutlined,
  SendOutlined,
  StarOutlined,
  TeamOutlined,
  TrophyOutlined,
  CalendarOutlined,
  StopOutlined,
  RollbackOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  deleteNotification,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/api'
import { formatRelativeTime } from '../utils/format'
import './NotificationBell.css'

const POLL_MS = 30 * 1000

// Icon and accent color per notification type. Colors are antd preset token names.
const TYPE_LOOK = {
  nomination_submitted: { icon: FileAddOutlined, color: 'colorPrimary' },
  nomination_validated: { icon: CheckCircleOutlined, color: 'colorSuccess' },
  screening_ready: { icon: StarOutlined, color: 'colorPrimary' },
  nomination_disqualified: { icon: CloseCircleOutlined, color: 'colorError' },
  nomination_closed: { icon: StopOutlined, color: 'colorTextSecondary' },
  screening_finalized: { icon: StarOutlined, color: 'colorSuccess' },
  award_endorsed: { icon: SendOutlined, color: 'colorPrimary' },
  endorsement_withdrawn: { icon: RollbackOutlined, color: 'colorWarning' },
  winner_selected: { icon: TrophyOutlined, color: 'colorWarning' },
  nominee_won: { icon: TrophyOutlined, color: 'colorWarning' },
  award_won: { icon: TrophyOutlined, color: 'colorWarning' },
  coh_choice: { icon: TrophyOutlined, color: 'colorWarning' },
  conferment_scheduled: { icon: CalendarOutlined, color: 'colorPrimary' },
  committee_added: { icon: TeamOutlined, color: 'colorPrimary' },
  committee_relieved: { icon: TeamOutlined, color: 'colorTextSecondary' },
  access_changed: { icon: KeyOutlined, color: 'colorTextSecondary' },
}

function NotificationItem({ item, onOpen, onRemove }) {
  const { token } = theme.useToken()
  const look = TYPE_LOOK[item.type] ?? {
    icon: BellOutlined,
    color: 'colorPrimary',
  }
  const Icon = look.icon

  return (
    <div
      role="button"
      tabIndex={0}
      className={`praise-notification${item.is_read ? '' : ' is-unread'}`}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(item)
        }
      }}
    >
      <span
        className="praise-notification-icon"
        style={{
          color: token[look.color],
          background: token.colorFillTertiary,
        }}
      >
        <Icon />
      </span>
      <span className="praise-notification-body">
        <span className="praise-notification-title">{item.title}</span>
        <span className="praise-notification-message">{item.message}</span>
        <span className="praise-notification-meta">
          {formatRelativeTime(item.created_at)}
          {item.actor_name ? ` · ${item.actor_name}` : ''}
        </span>
      </span>
      <span className="praise-notification-side">
        {!item.is_read && <span className="praise-notification-dot" style={{ background: token.colorPrimary }} aria-label="Unread" />}
        <Tooltip title="Remove">
          <Button
            type="text"
            size="small"
            className="praise-notification-remove"
            aria-label="Remove notification"
            icon={<CloseOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              onRemove(item)
            }}
          />
        </Tooltip>
      </span>
    </div>
  )
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [message, messageHolder] = antdMessage.useMessage()
  const screens = Grid.useBreakpoint()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Read by the refresh timer, which should not restart each time the panel opens or closes.
  const openRef = useRef(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listNotifications()
      setItems(data.items)
      setHasMore(data.has_more)
      setUnread(data.unread)
      setError(null)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // The unread count refreshes every 30 seconds while the tab is visible, and right away when the
  // tab comes back into view. The open list refreshes along with it.
  useEffect(() => {
    let isCurrent = true
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return
      if (openRef.current) return loadList()
      try {
        const { unread: count } = await getUnreadNotificationCount()
        if (isCurrent) setUnread(count)
      } catch {
        // A missed refresh is retried on the next tick.
      }
    }
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      isCurrent = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [loadList])

  const handleOpenChange = (next) => {
    setOpen(next)
    openRef.current = next
    if (next) loadList()
  }

  const handleOpen = async (item) => {
    if (!item.is_read) {
      setItems((current) => current.map((other) => (other.id === item.id ? { ...other, is_read: true } : other)))
      setUnread((count) => Math.max(0, count - 1))
      markNotificationRead(item.id)
        .then(({ unread: count }) => setUnread(count))
        .catch(() => {})
    }
    if (item.link) {
      handleOpenChange(false)
      navigate(item.link)
    }
  }

  const handleRemove = async (item) => {
    setItems((current) => current.filter((other) => other.id !== item.id))
    try {
      const { unread: count } = await deleteNotification(item.id)
      setUnread(count)
    } catch (removeError) {
      message.error(removeError.message)
      loadList()
    }
  }

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead()
      setItems((current) => current.map((item) => ({ ...item, is_read: true })))
      setUnread(0)
    } catch (markError) {
      message.error(markError.message)
    }
  }

  const handleLoadMore = async () => {
    setLoading(true)
    try {
      const data = await listNotifications(items.at(-1)?.id)
      setItems((current) => [...current, ...data.items])
      setHasMore(data.has_more)
      setUnread(data.unread)
    } catch (loadError) {
      message.error(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  const panel = (
    <div className="praise-notifications" style={{ width: screens.sm ? 380 : 'calc(100vw - 32px)' }}>
      <Flex align="center" justify="space-between" className="praise-notifications-header">
        <Typography.Text strong>Notifications</Typography.Text>
        <Button type="link" size="small" disabled={unread === 0} onClick={handleMarkAll}>
          Mark all as read
        </Button>
      </Flex>
      <div className="praise-notifications-list">
        {error && items.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error} />
        ) : items.length === 0 ? (
          loading ? (
            <Flex justify="center" style={{ padding: 32 }}>
              <Spin />
            </Flex>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="You're all caught up." />
          )
        ) : (
          <>
            {items.map((item) => (
              <NotificationItem key={item.id} item={item} onOpen={handleOpen} onRemove={handleRemove} />
            ))}
            {hasMore && (
              <Flex justify="center" style={{ padding: 8 }}>
                <Button type="link" loading={loading} onClick={handleLoadMore}>
                  Show older
                </Button>
              </Flex>
            )}
          </>
        )}
      </div>
    </div>
  )

  return (
    <>
      {messageHolder}
      <Popover
        trigger="click"
        placement="bottomRight"
        arrow={false}
        open={open}
        onOpenChange={handleOpenChange}
        content={panel}
        styles={{ container: { padding: 0 } }}
      >
        <Badge count={unread} size="small" overflowCount={99} offset={[-6, 6]}>
          <Button
            type="text"
            className="praise-header-icon-button"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            icon={<BellOutlined />}
          />
        </Badge>
      </Popover>
    </>
  )
}
