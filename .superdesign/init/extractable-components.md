# Extractable components

## Sidebar (dark categorized menu)
- Source: `frontend/src/layouts/MainLayout.jsx` (Sider block)
- Category: layout
- Description: Dark collapsible sidebar with "PRAISE" wordmark and categorized menu groups (Overview, Awards and Nominations, Records and Reports, System Settings).
- Extractable props: activePath (string), collapsed (boolean)
- Hardcoded: menu items/icons from config/navigation.js, blue selected state.

## Header (app top bar)
- Source: `frontend/src/layouts/MainLayout.jsx` (Header block)
- Category: layout
- Description: White top bar with sidebar toggle, optional "Preview as" role selector, and account dropdown (name + role, Sign out).
- Extractable props: userName, roleName, canManageAccess (boolean)
- Hardcoded: avatar icon, antd styling.

## PageHeader (title + action)
- Source: pattern in `frontend/src/pages/AwardCategories.jsx` / `Nominations.jsx`
- Category: basic
- Description: Flex row with page `Typography.Title level={3}` and an optional primary action button. Candidate to standardize across all pages.
- Extractable props: title (string), actionLabel (string)

## AuthBrand (login split panel)
- Source: `frontend/src/components/AuthShell.jsx`
- Category: layout
- Description: Left branding panel for Login/Forgot with DOH+MTRC logos and blue gradient.
- Hardcoded: logos, program name, background image.
