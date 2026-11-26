# PRAISE: guide for developers and AI assistants

PRAISE (Program on Awards and Incentives for Service Excellence) is the awards and incentives
system of DOH-MTRC (Malinao Treatment and Rehabilitation Center). It handles nominations,
Secretariat validation, Committee screening, endorsement, Chief of Hospital (COH) approval,
conferment records and reports.

**Read this file before changing anything.** Many behaviours that look like bugs are rules the
client decided on purpose (see "Client rules"). Do not "fix" them without written approval from
the client (the MTRC PRAISE Secretariat / Chief of Hospital).

Background documents:
- `PRAISE_PROCESS_FLOW.md`: full process flow, awards, tables and page status. Keep it in step
  with this file. If the two ever disagree, this file wins and the other should be fixed.
- `backend/MIGRATION_README.md`: how PRAISE was merged into the EMIS database, and how to roll back.

## Stack

- **Frontend** (`frontend/`): React 19 + Vite, JavaScript (no TypeScript), **Ant Design v6**
  (`antd`, `@ant-design/icons`), react-router-dom. No Tailwind or other UI libraries.
  Folders: `src/pages`, `src/components`, `src/layouts`, `src/hooks`, `src/services/api.js`
  (all API calls), `src/utils`, `src/config/navigation.js` (menu + permissions per page).
- **Backend** (`backend/`): Node + Express 5 + mysql2, CommonJS. REST/JSON under `/api`.
  `server.js` → `routes/api.js` (every route, with its permission check) → `services/*.js`
  (all business logic and SQL). Live notifications use a WebSocket at `/api/ws`
  (`services/realtime.js`).
- **Database**: MySQL, one database (`DB_NAME`, normally `emis`). PRAISE's own tables are the
  `praise_*` tables. Everything else (`users`, `reference_sections`, PDS, IPCR tables) belongs to
  EMIS.

## Running it

```bash
# backend (copy .env.example to .env and fill it in first)
cd backend && npm install && npm run dev        # http://127.0.0.1:5050
# frontend (copy .env.example to .env; leave VITE_API_URL empty to use the Vite proxy)
cd frontend && npm install && npm run dev       # http://<this-pc-ip>:5173
npm run lint                                    # in frontend/, run before committing
```

Backend scripts (`backend/package.json`): `setup-db` (create/update `praise_*` tables and seed
starting data, safe to re-run), `backup-db` (mysqldump into `backend/backups/`), `migrate`,
`rollback`, `seed-ipcr-sample` (fake ratings for testing; `-- --remove` deletes them),
`seed-test-flow`, `export-deploy-sql`.

## Hard rules: do not break these

1. **Never write to EMIS tables.** PRAISE only reads `users`, `reference_sections`, PDS and IPCR
   data. It writes only to `praise_*` tables.
2. **Do not drop or modify the old separate `praise` schema.** It is the rollback source for the
   EMIS migration and is kept on purpose as a safety net.
3. **Back up before any database change**: `npm run backup-db`. Never run `rollback`, `DROP`,
   `TRUNCATE` or bulk `DELETE` on the live server without a fresh backup and approval.
4. **Every route needs a permission check** (`requirePermission(...)` in `routes/api.js`), and the
   service must re-check ownership/role where it matters (e.g. only the creator edits a draft).
   Hiding a button in the frontend is not security.
5. **Never put secrets in `VITE_*` variables** (they are sent to the browser). The built-in Admin
   account lives only in `backend/.env`. Never commit `.env`, `backend/uploads/` or
   `backend/backups/`.
6. **LAN only.** The system runs on a server inside the center and is not exposed to the internet.
   Do not add features that need internet access (cloud services, external email, CDNs). Use
   local alternatives (in-app notifications, backups to an external drive or NAS).
7. **Use Ant Design** components and theme tokens for UI. Match the style of existing pages.

## Client rules (settled, do not change without client approval)

### Process and statuses
`praise_nominations.status`:
`draft → submitted → validated → shortlisted → endorsed → awarded`, with side exits
`disqualified`, `closed` (auto-closed duplicate) and `not_selected`.
- Only the **Secretariat** validates or disqualifies (reasons: `incomplete_documents`,
  `misrepresentation`, `special_favor`).
- Only the **Committee** screens. Only the **COH** selects winners. Only the **Secretariat**
  records the conferment date.
- Treat `closed` like `disqualified` in counts.

### Eligibility (`services/eligibility.js`)
- Individual nominees: 3+ years of DOH service (from PDS work experience), Very Satisfactory or
  better on the last 2 rating periods, no offense or pending case (PDS Q35a, Q35b, Q36).
  **Dangal is exempt from the 3-year rule.**
- Only Permanent and COS employees can be nominated (each award has its own rule:
  `applies_to`). Dangal level (I: SG 1–11, II: SG 12+) is set automatically from salary grade.
- **A check the records cannot answer does not block the nomination.** It is flagged for the
  Secretariat to verify. The local EMIS data is incomplete (many employees have no PDS or IPCR
  yet), so do not turn these "verify" flags into hard blocks.
- Previous winners of the same award wait 3 years (counted from the end of the cycle they won).
- Group/section nominees: all current members are included; individual checks do not apply.
  Section nominations need a **DPCR or OPCR** (either one) before validation
  (`findMissingDocuments` in `services/nominations.js`).

### Duplicate nominations
- Duplicates are **allowed** (any nominator, any award). Nominators must not be able to see that
  someone is already nominated. Do not add a "one award per employee per cycle" check.
- When the Secretariat validates one, the nominee's other draft/submitted nominations for the
  **same award** in that cycle are auto-closed (`closeDuplicateNominations`).
- Nominations for a **different award** are not auto-closed. The Secretariat disqualifies them
  by hand (an employee can receive only one award).

### Committee
- Fixed seats: 1 Chairperson, 3 Secretariat, 5 Members.
- A member is automatically **relieved** if they or their section is nominated
  (`relieveNominatedMembers`), and **reinstated** if that nomination is disqualified
  (`reinstateNominatedMembers`). Both are final rules, not provisional.

### Screening (`services/screening.js`)
- Official rating matrix: each criterion rated **0–4**, weights **20 / 30 / 30 / 20**. Weights
  lock once scoring starts. Scores are visible only to the Secretariat.
- Dangal Level I and Level II are ranked **separately** (one shortlist per level).

### COH approval (`pages/CohApproval.jsx`, `services/awarding.js`)
- The COH has a separate module and logs in personally. The Secretariat does not decide for them.
- The COH picks **one winner per award** overall (not per Dangal level) from the endorsed list.
  Endorsed nominees not picked become `not_selected`.
- **COH Choice** award: COH picks one section (any) and one permanent employee with 3+ years in
  the center (need not have been nominated). COH Choice gets a **certificate only**, no plaque
  and no cash grant (`certificate_released_on` on `praise_coh_choices`).
- The "only permanent employees" rule for national DOH awards still applies.

### Cycles
- Cycles are **manual**. No schedulers, no auto-open, auto-close or auto-extend based on dates.
  The Secretariat/Admin must be able to extend a nomination window by editing the cycle.
- Only one cycle is open at a time. The "Start Next Cycle" button only pre-fills the form
  (dates +1 year) and saves nothing until Save is clicked. Keep it.

### Deferred features (do not build unless asked)
- Awarding/ceremony program page.
- Employees page (spec item 4).
- Loyalty Incentive and other incentives (phase 2).

## Working conventions

- Keep code simple and consistent with nearby files. Put business logic in `backend/services/`,
  not in routes or React components.
- New pages: add the route in `App.jsx`, and the menu entry with its permission keys
  (`key` and `features`) in `frontend/src/config/navigation.js`. Then protect the backend routes
  with the same keys via `requirePermission`. Check `backend/services/access.js` for special
  role rules (e.g. COH-only features).
- Database changes: add them to `backend/sql/praise_schema.sql` **and** to `scripts/setup-db.js`
  using `CREATE TABLE IF NOT EXISTS` / additive `ALTER`s, so re-running is safe. Never write
  migrations that delete data.
- Work on a git branch, not directly on `main`. Test the full flow (nominate → validate → screen
  → endorse → COH → records) on a local test database. `npm run seed-test-flow` adds marked test
  nominations at every stage (`-- --remove` deletes them). Never test on the live server.
- If a requested change conflicts with a rule in this file, stop and ask the Secretariat before
  changing it, then update this file.
