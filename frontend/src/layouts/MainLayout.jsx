import { createElement, useEffect, useState } from 'react'
import {
  Alert,
  Avatar,
  Breadcrumb,
  Button,
  ConfigProvider,
  Divider,
  Drawer,
  Dropdown,
  Flex,
  Grid,
  Layout,
  Menu,
  Select,
  theme,
} from 'antd'
import {
  DoubleLeftOutlined,
  DoubleRightOutlined,
  DownOutlined,
  EyeOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { findActivePath, navigation, visibleNavigation } from '../config/navigation'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import { brandingLogo, useBranding } from '../hooks/useBranding'
import NotificationBell from '../components/NotificationBell'
import { listCycles } from '../services/api'
import { playFarewell } from '../utils/fireworks'

const { Header, Sider, Content } = Layout

// Sidebar menu look (Refined Navy), set through antd's Menu tokens so antd's own styles cannot
// override it: rows inset 12px with rounded corners, a soft blue current page, no separate
// background behind open groups.
const siderMenuTheme = {
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkPopupBg: '#0b1f3a',
      darkItemColor: 'rgba(255, 255, 255, 0.65)',
      darkItemHoverColor: '#ffffff',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.06)',
      darkItemSelectedBg: 'rgba(22, 119, 255, 0.18)',
      darkItemSelectedColor: '#ffffff',
      darkGroupTitleColor: 'rgba(255, 255, 255, 0.55)',
      itemHeight: 40,
      itemMarginInline: 12,
      itemMarginBlock: 2,
      itemBorderRadius: 8,
      subMenuItemBorderRadius: 8,
    },
  },
}

function previewOptions(access) {
  if (!access) return []

  const roles = access.roles.filter((role) => !role.is_admin)
  const groups = [
    {
      label: 'Roles',
      options: [
        { value: '', label: 'Myself' },
        ...roles.map((role) => ({
          value: `role:${role.id}`,
          label: role.name,
        })),
      ],
    },
  ]
  if (access.users.length > 0) {
    groups.push({
      label: 'People with custom access',
      options: access.users.map((user) => ({
        value: `user:${user.employee_id}`,
        label: user.name,
      })),
    })
  }
  return groups
}

// The open cycle, shown as a status pill in the header. Hidden when none is open or the user
// cannot read cycles.
function CyclePill() {
  const { data: cycles, reload } = useApi(listCycles)
  // Settings announces saved cycles, so the pill follows a newly opened cycle without a reload.
  useEffect(() => {
    window.addEventListener('praise:cycles-changed', reload)
    return () => window.removeEventListener('praise:cycles-changed', reload)
  }, [reload])
  const cycle = cycles?.find((item) => item.status === 'open')
  if (!cycle) return null
  return (
    <span className="praise-header-cycle">
      <span className="praise-header-cycle-dot" aria-hidden />
      {cycle.name} · Nominations open
    </span>
  )
}

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { access, can, canManageAccess, error, me, preview, setPreview, signOut } = useAccess()
  const screens = Grid.useBreakpoint()
  const branding = useBranding()
  const sidebarLogo = brandingLogo(branding, 'sidebar')
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  // Play the farewell, then sign out. playFarewell signs out immediately if motion is reduced
  // or the animation cannot run, so logout is never blocked.
  const handleSignOut = () => playFarewell(signOut)

  const categories = visibleNavigation(can)
  const activePath = findActivePath(
    categories.flatMap((category) => category.items),
    pathname,
  )
  const menuItems = categories.map((category) => ({
    type: category.collapsible ? undefined : 'group',
    key: category.key,
    label: category.label,
    icon: category.icon && createElement(category.icon),
    children: category.items.map((item) => ({
      key: item.path,
      icon: item.icon && createElement(item.icon),
      label: item.label,
    })),
  }))
  const activeCategory = categories.find((category) => category.items.some((item) => item.path === activePath))
  const activeItem = activeCategory?.items.find((item) => item.path === activePath)
  const [defaultOpenKeys] = useState(() =>
    navigation
      .filter((category) => category.collapsible && findActivePath(category.items, pathname))
      .map((category) => category.key),
  )

  // Phones (below md) get the sidebar as a slide-in drawer instead of a fixed column, so pages
  // use the full width. Before the first breakpoint reading, screens is empty: treat it as desktop.
  const isMobile = screens.md === false
  const isCollapsed = collapsed && !isMobile
  const toggleSidebar = () => (isMobile ? setMobileOpen(true) : setCollapsed(!collapsed))

  const sidebar = (
    <>
      <div className="praise-sider-brand">
        {sidebarLogo ? (
          <img className="praise-sider-brand-logo" src={sidebarLogo} alt="" />
        ) : (
          <span className="praise-sider-brand-icon" aria-hidden>
            <TrophyOutlined />
          </span>
        )}
        {!isCollapsed && (
          <span className="praise-sider-brand-text">
            <span className="praise-sider-brand-name">PRAISE</span>
            <span className="praise-sider-brand-tagline">Awards &amp; Incentives</span>
          </span>
        )}
      </div>
      {/* The menu scrolls on its own if it is taller than the sidebar; the sidebar never
            moves with the page. */}
      <div className="praise-sider-menu">
        <ConfigProvider theme={siderMenuTheme}>
          <Menu
            theme="dark"
            mode="inline"
            defaultOpenKeys={defaultOpenKeys}
            selectedKeys={activePath ? [activePath] : []}
            items={menuItems}
            onClick={({ key }) => {
              navigate(key)
              setMobileOpen(false)
            }}
          />
        </ConfigProvider>
      </div>

      {!isMobile && (
        <div className="praise-sider-footer">
          <button
            type="button"
            className="praise-sider-collapse"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
            {!collapsed && <span>Collapse sidebar</span>}
          </button>
        </div>
      )}
    </>
  )

  return (
    // Full-viewport height: the sidebar and header stay put while only the content area scrolls.
    <Layout style={{ height: '100dvh', overflow: 'hidden' }}>
      {isMobile ? (
        <Drawer
          placement="left"
          size={260}
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          closable={false}
          rootClassName="praise-sider praise-sider-drawer"
          styles={{
            section: { background: 'linear-gradient(180deg, #0b1f3a 0%, #001529 100%)' },
            body: { padding: 0, display: 'flex', flexDirection: 'column' },
          }}
        >
          {sidebar}
        </Drawer>
      ) : (
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          breakpoint="lg"
          onBreakpoint={setCollapsed}
          theme="dark"
          width={240}
          className="praise-sider"
        >
          {sidebar}
        </Sider>
      )}

      <Layout>
        <Header className="praise-header" style={{ background: colorBgContainer }}>
          <Flex align="center" gap={12} className="praise-header-left">
            <Button
              type="text"
              className="praise-header-icon-button"
              aria-label={isMobile ? 'Open menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              icon={isMobile ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleSidebar}
            />
            {screens.sm && activeItem && (
              <>
                <Divider orientation="vertical" style={{ height: 20, margin: 0 }} />
                <Breadcrumb
                  className="praise-header-breadcrumb"
                  items={screens.xl ? [{ title: activeCategory.label }, { title: activeItem.label }] : [{ title: activeItem.label }]}
                />
              </>
            )}
          </Flex>

          <Flex align="center" gap={screens.md ? 12 : 8} className="praise-header-right">
            {screens.xl && <CyclePill />}
            {canManageAccess && (
              <Select
                aria-label="Preview as"
                className="praise-header-preview"
                style={{ width: screens.xl ? 210 : screens.sm ? 160 : 130 }}
                value={preview}
                onChange={setPreview}
                options={previewOptions(access)}
                prefix={<EyeOutlined />}
                labelRender={({ label }) => (screens.xl ? <>Viewing as: {label}</> : label)}
              />
            )}
            <NotificationBell />
            <Divider orientation="vertical" style={{ height: 24, margin: 0 }} />
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              menu={{
                items: [
                  // The name and role are hidden in the header on phones, so show them here.
                  ...(screens.lg
                    ? []
                    : [{ key: 'name', disabled: true, label: `${me.name} (${me.role_name})` }, { type: 'divider' }]),
                  {
                    key: 'sign-out',
                    icon: <LogoutOutlined />,
                    label: 'Sign out',
                    onClick: handleSignOut,
                  },
                ],
              }}
            >
              <button type="button" className="praise-header-account" aria-label="Account menu">
                <Avatar size={32} icon={<UserOutlined />} className="praise-header-avatar" />
                {screens.lg && (
                  <span className="praise-header-account-text">
                    <span className="praise-header-account-name">{me.name}</span>
                    <span className="praise-header-account-role">{me.role_name}</span>
                  </span>
                )}
                <DownOutlined className="praise-header-account-caret" />
              </button>
            </Dropdown>
          </Flex>
        </Header>

        <Content
          style={{
            flex: 1,
            overflow: 'auto',
            margin: screens.sm === false ? 8 : 16,
            padding: screens.sm === false ? 16 : 24,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
          }}
        >
          {error && <Alert type="error" title={error.message} style={{ marginBottom: 16 }} />}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
