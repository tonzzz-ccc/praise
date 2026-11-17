# Layouts

## MainLayout — src/layouts/MainLayout.jsx
antd `Layout` with a dark collapsible `Sider` (width 240, breakpoint md), a white `Header` (sidebar toggle, "Preview as" role selector for access managers, account dropdown with Sign out → farewell animation), and a `Content` (margin 16, padding 24, white, borderRadiusLG). Sidebar menu is built from `visibleNavigation(can)` over `config/navigation.js`; categories render as antd Menu groups (or a collapsible submenu for System Settings). Brand wordmark "PRAISE" at the top of the sider.

Full source: frontend/src/layouts/MainLayout.jsx (pass as --context-file for reproduction).

## AuthShell — src/components/AuthShell.jsx (+ AuthShell.css)
Split screen for Login/Forgot: left `aside.auth-brand` = DOH + MTRC round logos, "DOH-MTRC", big "PRAISE" wordmark, full program name, over a blue gradient on background.jpg; right `main.auth-panel` = centered `.auth-card` (max 400px) holding the form. Stacks under 860px.

Full source: frontend/src/components/AuthShell.jsx, frontend/src/components/AuthShell.css.
