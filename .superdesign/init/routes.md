# Routes

Config-based routing (react-router-dom 7) in `frontend/src/App.jsx`. `main.jsx` wraps `<BrowserRouter><App/></BrowserRouter>`. All routes except /login and /forgot-password are wrapped in `<RequireLogin><MainLayout/></RequireLogin>` and gated per-permission via `protectedPage(permission, page)` → `<RequireAccess permission=...>`.

| Path | Component | Layout | Permission |
|---|---|---|---|
| /login | pages/Login | AuthShell | public |
| /forgot-password | pages/ForgotPassword | AuthShell | public |
| / | FirstAllowedPage (redirect) | MainLayout | login |
| /dashboard | pages/Dashboard | MainLayout | dashboard |
| /award-categories | pages/AwardCategories | MainLayout | award_categories |
| /nominations | pages/Nominations | MainLayout | nominations |
| /nominations/new | pages/NominationForm | MainLayout | nominations.create |
| /nominations/:id/edit | pages/NominationForm | MainLayout | nominations.create |
| /records | pages/Placeholder | MainLayout | records |
| /reports | pages/Placeholder | MainLayout | reports |
| /settings | pages/Placeholder | MainLayout | settings |
| /settings/access-management | pages/AccessManagement | MainLayout | access_management |

Sidebar menu + permission keys come from a single config: `frontend/src/config/navigation.js` (categorized: Overview, Awards and Nominations, Records and Reports, System Settings).
