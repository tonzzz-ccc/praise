# PRAISE: Process Flow and Build Spec

Program on Awards and Incentives for Service Excellence (PRAISE), DOH-MTRC (Malinao Treatment and Rehabilitation Center).
Source: MTRC Office Order No. 14, August 30, 2024 (adopts DOH Department Order No. 2019-0436 plus customized awards),
plus the client decisions recorded below (last updated 2026-11-26).

See also `CLAUDE.md` (rules for developers and AI assistants) and `backend/MIGRATION_README.md` (database merge and rollback).

## Stack and conventions

- Frontend: React + Vite (JavaScript), Ant Design (antd v6), @ant-design/icons, react-router-dom. No Tailwind.
- Frontend lives in `frontend/`. Structure: `src/layouts`, `src/pages`, `src/components`, `src/services` (API calls), `src/hooks`, `src/utils`, `src/config/navigation.js` (menu and permissions).
- Backend lives in `backend/`: Node, Express and mysql2. API style: REST, JSON under `/api`. Start it with `npm run dev`; `npm run setup-db` creates or updates the PRAISE tables. Live notifications use a WebSocket at `/api/ws`.
- Database: MySQL, one database (`DB_NAME`, normally `emis`). PRAISE keeps its own tables in it with a `praise_` prefix (`backend/sql/praise_schema.sql`), linked to the EMIS tables by foreign keys. Employees, sections, positions, personal data sheets and IPCR forms are EMIS tables, which PRAISE only reads and never writes. No mock data.
- The old, separate `praise` database is kept untouched as the rollback source for the merge. Do not drop it.
- Runs on a server inside the center's LAN only; it is not exposed to the internet.
- Keep code simple and consistent with existing files.

## Roles

| Role | Can do |
|---|---|
| Admin | Full access to everything; cannot be edited or removed through Access Management. Includes the built-in account set in `backend/.env` |
| Secretariat | Manage award categories, validate or disqualify nominations, manage the committee, see screening results and finalize the shortlist, endorse to the COH, record conferment dates and plaque/grant/certificate releases, reports |
| Committee member | Score validated nominees (not their own nomination, and not while relieved) |
| Chief of Hospital (COH) | Picks one winner per award from the endorsed nominees, and the COH Choice awardees. Logs in personally; nobody decides on the COH's behalf |
| Nominator (employee/supervisor) | Create and submit nominations, delete own drafts |
| Viewer | Read-only dashboard, nominations and reports |

Role permissions are seeded by `backend/scripts/accessSeed.js` and can be changed in Access Management.

## Award cycle

- Selection period: every November 1 to October 31 of the next year.
- Nominations are submitted in the first quarter of every year.
- Every record belongs to one `praise_award_cycles` row.
- Cycles are managed **by hand** (System Settings, General). Nothing opens, closes or extends automatically, so the Secretariat or Admin can extend the nomination window if too few nominations come in. Only one cycle is open at a time. "Start Next Cycle" only pre-fills the form (dates +1 year) and saves nothing until Save is clicked. If the nomination window is extended past the ceremony date, the ceremony date must move too.

## Main process flow

```
1. NOMINATE
   Nominator: immediate supervisor, co-employee, or any private person/organization.
   Select award category, then nominee (individual) or section (group/team).
   Duplicate nominations are allowed (any nominator, any award). Nominators are not told that
   someone is already nominated.
        |
        v
2. ELIGIBILITY CHECK (automatic, saved as eligibility_snapshot JSON)
   Individual nominee must have:
   - at least 3 years of service in the Department at time of nomination
     (the Dangal award is exempt: no minimum length of service)
   - Very Satisfactory or higher rating for the last 2 consecutive rating periods
   - no administrative or criminal offense involving moral turpitude
   - no pending administrative or criminal case
   A check the records cannot answer (e.g. no PDS or IPCR on file) does NOT block the
   nomination. It is marked for the Secretariat to verify.
   Group/team nominee (section, committee or unit): the award goes to the group as a whole.
   Every current member is included regardless of hire date, and the individual checks above
   (service, ratings, declarations) do not apply. Members are listed only for reference, and
   none is excluded. A group with no current members cannot be nominated.
   Also check:
   - a previous winner may be renominated in the same award only after 3 years, counted from
     the end of the cycle they won in; the message gives the date they can be nominated again.
   There is NO "one award per employee per cycle" check at nomination time (see step 5).
        |
        v
3. COMPLETE DOCUMENTS (status: draft)
   Required: fully accomplished nomination form.
   Other documents as required:
   - awards and commendations
   - individual: IPCR (Very Satisfactory or higher, last 2 periods) with supervisor remarks
   - section/group: a DPCR or an OPCR (either one; same rating rule)
   - publications, photos and testimonials, other supporting documents
   Only the creator edits a draft, and can delete it.
        |
        v
4. SUBMIT TO SECRETARIAT (status: submitted, only within the nomination window)
   Submitting relieves any committee member who is the nominee or in the nominated section.
        |
        v
5. SECRETARIAT VALIDATION
   Check completeness and accuracy of documents. Every document must be verified first.
        |
        +-- fails -> DISQUALIFIED (status: disqualified)
        |     reasons (enum disqualification_reason):
        |     - incomplete_documents (non-submission of complete requirements)
        |     - misrepresentation (false information in form or documents)
        |     - special_favor (nominee asked a Committee member for favor/consideration)
        |     A committee member relieved because of this nomination is reinstated.
        |
        +-- passes -> VALIDATED (status: validated)
              The nominee's other draft/submitted nominations for the SAME award in this
              cycle are closed automatically (status: closed).
              Nominations for a DIFFERENT award are not closed automatically: an employee can
              receive only one award, and the Secretariat disqualifies the others by hand.
        |
        v
6. PRAISE COMMITTEE SCREENING AND SELECTION
   Each active committee member rates every validated nominee on the four criteria using the
   official rating matrix: 0 (no evidence) to 4 (exceptional evidence) per criterion.
   Weights: Achievements 20%, Method 30%, Impact 30%, Behavioral Indicators 20% (an award can
   have its own weights; they lock once scoring starts). A rating earns that share of the
   criterion's weight, e.g. 3 on a 30% criterion = 22.5%. Totals are out of 100% and averaged
   across members. Scores are visible only to the Secretariat (screening.results).
   The Secretariat finalizes each award, and Dangal Level I and Level II separately: the highest
   average is shortlisted; on a tie the Secretariat chooses among the tied nominees.
   - selected -> status: shortlisted
   - not selected -> status: not_selected
   Conflict rule: if a Committee member, or their section, is nominated, they are automatically
   relieved (status = relieved) and the rest of the committee proceeds without them. If that
   nomination is later disqualified, they are reinstated (final rule).
        |
        v
7. ENDORSE TO CHIEF OF HOSPITAL (status: endorsed)
   The Secretariat endorses the shortlisted nominees to the Chief of Hospital.
        |
        v
8. COH APPROVAL (COH Approval page, COH's own login)
   For each award, the COH sees every endorsed nominee with their full qualifications and picks
   ONE winner per award overall (not one per Dangal level).
   - picked -> status: awarded
   - not picked -> status: not_selected
   COH Choice: the COH also picks, without a nomination, one section (any section, no conditions)
   and one permanent employee with at least 3 years in the center (praise_coh_choices).
        |
        v
9. CONFERMENT AND RELEASES (Records page)
   Only the Secretariat records the conferment date.
   Awardees: track plaque release, grant amount (never above the tier's max) and grant release.
   COH Choice awardees receive a certificate only (no plaque, no grant): track
   certificate_released_on.
```

## Status transitions (praise_nominations.status)

```
draft -> submitted -> validated -> shortlisted -> endorsed -> awarded
                  \-> disqualified           \-> not_selected     \-> not_selected (COH did not pick)
                  \-> closed (same-award duplicate, when another is validated)
                               \-> not_selected
```

Rules: only the Secretariat moves submitted -> validated/disqualified. Screening moves validated -> shortlisted/not_selected (finalized by the Secretariat). Only the Secretariat endorses. Only the COH picks winners. Only the creator edits while draft. Record who and when for every transition. Count `closed` like `disqualified`.

## Awards

Only these can be nominated. The official nomination forms are the source for who can be nominated. Dangal Level I and Level II are two separate categories, each with one tier.

| Code | Award | Nominee | Who can be nominated | Plaque | Max grant |
|---|---|---|---|---|---|
| DANGAL | Dangal ng MTRC Award Level I | individual | permanent, SG 1 to 11 | yes | P5,000 |
| DANGAL_NG_MTRC_AWARD_LEVEL_II | Dangal ng MTRC Award Level II | individual | permanent, SG 12 and up | yes | P10,000 |
| CUSTOMER_SVC | Excellence in Customer Service Award | section/committee | any section or committee | yes | P20,000 |
| AGAP_SERBISYO | Agap Serbisyo | individual | COS | yes | none |
| SULONG_KALINANGAN | Sulong Kalinangan | individual | permanent and COS | yes | none |
| GAWAD_HIRAYA | Gawad Hiraya | individual | permanent and COS | yes | none |

Not nominated, chosen by the COH: **COH Choice** (one section + one permanent employee with 3+ years in the center). Certificate only.

The starting categories, their descriptions and behavioral indicators are seeded by `backend/scripts/awardSeed.js` and can be edited on the Award Categories page.

Every individual nominee must have at least 3 years of service, whether permanent or COS, except for the Dangal award, which has no minimum length of service (any permanent employee qualifies regardless of how long they have been employed). This also does not apply to group awards (section, committee or unit), where all current members are included regardless of hire date. Group members and all nominees must be permanent or COS; outsourced/agency staff, job order, casual and interns cannot be nominated. The Dangal level is set automatically from the nominee's salary grade; the nominator does not choose it.

Where eligibility data comes from:

- Years of service: counted from the earliest Department of Health entry in the PDS work experience (EMIS), up to the date of nomination.
- Offense and criminal charge: PDS questions 35a, 35b and 36 (EMIS). These are self-declared, so a "Yes" or a blank asks the Secretariat to review and does not block the nomination.
- Ratings: approved forms in the EMIS IPCR tables (`ipcr_forms`, `ipcr_target_items`) and `praise_employee_ratings`. When both cover a period, the IPCR wins. A form's score is the average of its target items, labeled on the CSC SPMS scale (Outstanding 4.5+, Very Satisfactory 3.5+, Satisfactory 2.5+, Unsatisfactory 1.5+, Poor below that). With fewer than 2 ratings on file, the Secretariat verifies from the attached IPCR. The local database holds made-up ratings for testing: `npm run seed-ipcr-sample` adds them and `npm run seed-ipcr-sample -- --remove` deletes them.
- A check the records cannot answer does not block the nomination. It is marked for the Secretariat to verify. (The local EMIS copy is still incomplete; many employees have no PDS or IPCR yet.)

Every nomination form asks for a Justification and Evidences under each criterion: Achievements and Contributions; The way the achievements and contributions were attained is described; Impact; Behavioral Indicators.

Removed from nomination: Chief of Hospital's Choice Award as a nominated award (replaced by the COH-picked COH Choice above), Pagpupugay sa Watawat Award, DOH Service Award.

Other incentives (separate modules, phase 2, not built):

- Loyalty Incentive: 10 and 15 years (bronze pin, P3,000 / P5,000); 20 and 25 years (silver ring, P7,000 / P9,000); 30, 35 and 40 years (gold medallion, P10,000 / P12,000 / P14,000). Plus a cash gift of P500 to P1,000 per year of service.
- Performance Based Bonus, Compensatory Time Off, Flexi-time, "Salu-salo" Together, Personal Growth Opportunities: informational only for now.

Applicability: permanent and COS employees can both be nominated, subject to each award's rule above; only permanent employees are considered for the national DOH PRAISE awards.

## Database tables

Read from EMIS, never written by PRAISE: `users` (employees; `user_id` is the employee number), `reference_sections`, `reference_divisions`, `reference_positions` (salary grade), `emis_personal_data_sheets` (work experience, declarations), `ipcr_forms`, `ipcr_target_items`.

PRAISE tables (all in the same database, see `backend/sql/praise_schema.sql` for full columns):

- `praise_award_cycles` (name, selection period, nomination window, ceremony date, status draft/open/screening/closed)
- `praise_award_categories` (code, name, description, behavioral_indicators JSON, applies_to permanent/cos/both, nominee_type individual/section, has_plaque, has_grant, criteria_weights JSON, sort order, is_active)
- `praise_award_category_tiers` (category_id, tier_label, max_amount, salary_grade_min, salary_grade_max)
- `praise_employee_ratings` (employee_id, rating_period, period_end, rating_score, rating_label)
- `praise_nominations` (cycle, category, tier, nominee employee or section, nominator, form_responses JSON, eligibility_snapshot JSON, status, disqualification_reason, validation, endorsement, COH decision, conferment date, plaque/grant release). There is no separate awardees table: an awardee is a nomination with status `awarded`.
- `praise_nomination_members` (section members at the time of nomination, for reference)
- `praise_nomination_documents` (doc_type, criterion, file info, is_verified, verified_by). Files are stored in `backend/uploads/`.
- `praise_committee_members` (cycle_id, employee_id, role chair/secretariat/member, status active/relieved)
- `praise_screening_scores` (one row per member per nomination; scores JSON 0-4 per criterion)
- `praise_coh_choices` (cycle_id, choice_type section/employee, conferment date, certificate_released_on)
- `praise_access_roles`, `praise_role_permissions`, `praise_user_access`, `praise_user_permission_overrides` (Access Management)
- `praise_sessions` (login sessions), `praise_notifications` (in-app notifications), `praise_setup_steps`

Business rules enforced in application code (`backend/services/`): eligibility checks, 3-year renomination gap, same-award duplicate closing, committee-member auto-relief and reinstatement, DPCR/OPCR for sections, one winner per award, grant amount never above the tier's max_amount.

## Pages (current state)

| Page | Status |
|---|---|
| Login, Forgot Password | Done. Sign in with an EMIS username or PDS email and password, checked read-only against EMIS. Password resets stay in EMIS. The built-in Admin account (`ADMIN_USERNAME` / `ADMIN_PASSWORD` in `backend/.env`) has no EMIS record |
| Dashboard | Done |
| Award Categories | Done. Add/edit (no delete), system-generated code. Deactivating hides a category everywhere and keeps its records; only the Secretariat and Admin see and reactivate inactive ones |
| Nominations list and Nomination form | Done. Live eligibility panel, documents per criterion, nominators can delete their own drafts |
| Validation | Done. Document checklist, validate or disqualify with reason. Nobody reviews a nomination they are the nominee, nominator or a group member of |
| Committee | Done. Roster per cycle (1 Chairperson, 3 Secretariat, 5 Members, no alternates), relieve with a reason, remove a mistaken entry |
| Screening | Done. 0-4 rating matrix, results for the Secretariat, finalize per award/level |
| Endorsement | Done |
| COH Approval | Done. One winner per award, COH Choice section and employee |
| Records | Done. Conferment dates, plaque/grant/certificate releases |
| Reports | Done. Print and Excel export |
| System Settings | Done. Cycles, branding (texts and logos), Access Management with "Preview as" |
| Notifications | Done. In-app bell with live updates over WebSocket |
| Employees page | Deferred to a future update |
| Awarding/ceremony program page | Deferred, maybe later |
| Loyalty Incentive and other incentives | Phase 2, not built |

## Funding note

The Department allocates at least 5% of HRD funds for PRAISE. Reports should compare total grants released against the cycle budget.
