# PRAISE Design System

## Product context
PRAISE — Program on Awards and Incentives for Service Excellence, for DOH-MTRC (a government treatment & rehabilitation center). An internal web app for staff to nominate employees for awards, check eligibility, manage award categories, run access control, and (later) track conferment. Audience: government HR/secretariat staff and employees. Tone: trustworthy, clean, government-professional — not flashy.

Key pages: Dashboard, Award Categories, Nominations list, New Nomination form, Access Management, Login. Built on **React + Vite + Ant Design v6** (NOT Tailwind — antd is the component library and its ConfigProvider tokens are the theme).

## Branding & styling
- **Primary blue:** `#1677ff` (antd colorPrimary), with `#0958d9` (dark/press) and `#4096ff` (hover), tints `#e6f4ff`/`#f5faff`, deep navy sidebar.
- **Font:** DM Sans (Google Fonts) everywhere.
- **Neutrals:** text `#111827`/`#1f2937`/`#4b5563`, muted `#6b7280`/`#9ca3af`, borders `#f0f0f0`/`#f3f4f6`, surfaces white on a light `#f5f5f5` app background.
- **Status:** success green `#10b981`, warning amber `#faad14`, error red `#ff4d4f`; antd Tag colors for nomination statuses.
- **Shape:** base radius 6px (antd), cards 8–16px; soft shadows `0 2px 10px rgba(0,0,0,0.05)`.
- **Spacing scale:** 8 / 12 / 16 / 24; page content padding 24; grid gutter 16.
- **Layout:** dark categorized left sidebar (240px) + white top bar + white content cards. Responsive: usable on desktop, tablet (stacks), mobile (sidebar collapses, tables scroll).

## Consistency goals (this redesign)
Keep the blue theme, DM Sans, the dark categorized sidebar, the Login split screen, the Sign-out farewell animation, and the EMIS-styled Access Management. Make the plain pages (Dashboard, Records/Reports placeholders) and the shared page headers feel like one coherent system: a consistent page header (title + subtitle + action), tidy stat cards, clear empty states, uniform card/table spacing, and solid responsiveness. Change only styling/layout — never logic, routes, permissions, or features.

## Motion
Subtle only: login fireworks burst on sign-in; gentle falling-sparkle "farewell" on sign-out; antd default transitions. Respect prefers-reduced-motion.
