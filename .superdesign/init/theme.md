# Theme

## Part 1 — Token summary

Framework: React 19 + Vite. UI library: **Ant Design v6** (antd). CSS: vanilla CSS files + antd ConfigProvider tokens. No Tailwind.

### Colors (blue theme)
- colorPrimary: `#1677ff`
- primary dark / hover: `#0958d9`, `#4096ff`
- primary tints: `#91caff`, `#bae0ff`, `#e6f4ff`, `#f5faff`
- sider (dark): antd dark sider, background ~`#001529`
- text: `#111827` / `#1f2937` / `#4b5563`; muted `#6b7280` / `#9ca3af`; faint `#d1d5db`
- surfaces: `#fff`; subtle fills `#fafafa`, `#fafcff`, `#f3f4f6`, `#f8f8f8`
- success `#10b981`/`#065f46`/`#ecfdf5`; warning `#faad14`/`#fef3c7`/`#92400e`; error `#ff4d4f`/`#dc2626`
- status tag colors via antd Tag (blue/purple/green/gold)

### Typography
- Font family: `'DM Sans', sans-serif` (Google Fonts), set on `body` and in ConfigProvider token `fontFamily`.
- Headings: antd `Typography.Title level={3}` for page titles.
- Uppercase micro-labels: 10–11px, weight 600–700, letter-spacing 0.07–0.1em (used in sidebar group titles, Access Management).

### Shape / spacing
- borderRadius token: `6`. Custom cards use 12–24px radii.
- Layout: MainLayout Content `margin: 16; padding: 24`. Sider width 240 (collapsed 80). Header height 56–64.
- Card/section gaps: 8 / 12 / 16 / 24.

### Breakpoints (antd Grid)
xs <576, sm ≥576, md ≥768, lg ≥992, xl ≥1200.

## Part 2 — Raw sources

### ConfigProvider theme (src/App.jsx)
```jsx
<ConfigProvider theme={{ token: { colorPrimary: '#1677ff', borderRadius: 6, fontFamily: "'DM Sans', sans-serif" } }}>
```

### src/index.css (global)
See frontend/src/index.css — body font DM Sans; `.praise-sider` menu group-title/selected/submenu styling; `.nomination-docs-*` flex-fill rules at ≥992px.

### Custom stylesheets
- frontend/src/components/AuthShell.css — Login/Forgot split-screen branding (DOH-MTRC logos, blue gradient over background.jpg).
- frontend/src/pages/AccessManagement.css — EMIS-style card/table/modal design (rounded cards, gradient icon chips, custom pagination). Intentionally distinct, matching the EMIS system.
