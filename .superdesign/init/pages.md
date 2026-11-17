# Pages (dependency trees)

## /dashboard
Entry: frontend/src/pages/Dashboard.jsx (antd Card/Col/Row/Statistic/Typography only). Rendered inside MainLayout.

## /award-categories
Entry: frontend/src/pages/AwardCategories.jsx
- frontend/src/components/CategoryModal.jsx
- frontend/src/hooks/useAccess.js, useApi.js
- frontend/src/services/api.js, utils/format.js

## /nominations
Entry: frontend/src/pages/Nominations.jsx
- frontend/src/components/NominationDetails.jsx
- utils/nominations.js, services/api.js

## /nominations/new, /nominations/:id/edit
Entry: frontend/src/pages/NominationForm.jsx
- frontend/src/components/EligibilityPanel.jsx
- utils/nominations.js, utils/format.js, services/api.js

## /settings/access-management
Entry: frontend/src/pages/AccessManagement.jsx (+ AccessManagement.css)
- config/navigation.js, hooks/useAccess.js, services/api.js, utils/access.js

## /login, /forgot-password
Entry: frontend/src/pages/Login.jsx / ForgotPassword.jsx
- frontend/src/components/AuthShell.jsx (+ AuthShell.css), utils/fireworks.js (login burst + sign-out farewell)

## Shared shell
frontend/src/layouts/MainLayout.jsx + config/navigation.js on every in-app page.
