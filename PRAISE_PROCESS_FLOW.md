# PRAISE: Process Flow and Build Spec

Program on Awards and Incentives for Service Excellence (PRAISE), DOH-MTRC (Malinao Treatment and Rehabilitation Center).
Source: MTRC Office Order No. 14, August 30, 2024 (adopts DOH Department Order No. 2019-0436 plus customized awards).

## Stack and conventions

- Frontend: React + Vite (JavaScript), Ant Design (antd v6), @ant-design/icons, react-router-dom. No Tailwind.
- Frontend lives in `frontend/`. Structure: `src/layouts`, `src/pages`, `src/components`, `src/services` (API calls), `src/hooks`, `src/utils`.
- Backend lives in `backend/`: Node, Express and mysql2. API style: REST, JSON. Start it with `npm run dev`; `npm run setup-db` creates the database.
- Databases: MySQL on this computer. PRAISE keeps its own tables in the `praise` database (`backend/sql/praise_schema.sql`). Employees, sections, positions and personal data sheets are read from the `emis` database, which PRAISE never writes to. No mock data.
- Output complete files, not diffs. Keep code simple and consistent with existing files.

## Roles

| Role | Can do |
|---|---|
| Admin | Full access to everything; cannot be edited or removed through Access Management. Includes the built-in account set in `backend/.env` |
| Secretariat | Receive and validate nominations, disqualify, notify awardees, prepare conferment; apart from Admin, the only role that can add award categories and see or reactivate inactive ones |
| Committee member | Screen, evaluate, select, endorse (not for own nomination) |
| Nominator (employee/supervisor) | Create and submit nominations |
| Viewer | Read-only dashboards and reports |

## Award cycle

- Selection period: every November 1 to October 31 of the next year.
- Nominations are submitted in the first quarter of every year.
- Every record belongs to one `award_cycles` row.

## Main process flow

```
1. NOMINATE
   Nominator: immediate supervisor, co-employee, or any private person/organization.
   Select award category, then nominee (individual) or section (group/team).
        |
        v
2. ELIGIBILITY CHECK (automatic, saved as eligibility_snapshot JSON)
   Individual nominee must have:
   - at least 3 years of service in the Department at time of nomination
     (the Dangal award is exempt: no minimum length of service)
   - Very Satisfactory or higher rating for the last 2 consecutive rating periods
   - no administrative or criminal offense involving moral turpitude
   - no pending administrative or criminal case
   Group/team nominee (section, committee or unit): the award goes to the group as a whole.
   Every current member is included regardless of hire date, and the individual checks above
   (service, ratings, declarations) do not apply. Members are listed only for reference, and
   none is excluded. A group with no current members cannot be nominated.
   Also check:
   - one individual award category per employee per cycle
     (except categories with is_limit_exempt = 1)
   - previous winner of Dangal ng Kagawaran / Outstanding / Innovative award may be
     renominated in the same category only after 3 years, with new accomplishments.
     Dangal: there is no cap on nominations. A winner is blocked for 3 years, counted from the
     end of the cycle they won in, and the message gives the date they can be nominated again.
        |
        v
3. COMPLETE DOCUMENTS (status: draft)
   Required: fully accomplished nomination form.
   Other documents as required:
   - awards and commendations
   - individual: IPCR (Very Satisfactory or higher, last 2 periods) with supervisor remarks
   - division: DPCR; office: OPCR (same rating rule)
   - publications, photos and testimonials, other supporting documents
        |
        v
4. SUBMIT TO SECRETARIAT (status: submitted, only within nomination window)
        |
        v
5. SECRETARIAT VALIDATION
   Check completeness and accuracy of documents.
        |
        +-- fails -> DISQUALIFIED (status: disqualified)
        |     reasons (enum disqualification_reason):
        |     - incomplete_documents (non-submission of complete requirements)
        |     - misrepresentation (false information in form or documents)
        |     - special_favor (nominee asked a Committee member for favor/consideration)
        |
        +-- passes -> VALIDATED (status: validated)
        |
        v
6. PRAISE COMMITTEE SCREENING AND SELECTION
   Screens and selects nominees by prescribed criteria.
   Each active committee member scores every validated nominee 0-100 on the four criteria.
   A member's score is weighted by the award's criteria_weights (default 25% each; locked once
   scoring starts) and averaged across members. Scores are visible only to the Secretariat
   (screening.results). The Secretariat finalizes each award (per grant level): the highest
   average is shortlisted; on a tie the Secretariat chooses among the tied nominees.
   - selected -> status: shortlisted
   - not selected -> status: not_selected
   Conflict rule: if a Committee member, or their section, is nominated, they are automatically
   relieved (committee_members.status = relieved) and the rest of the committee proceeds without
   them. If that nomination is later disqualified, they are reinstated (provisional rule).
        |
        v
7. ENDORSE TO CHIEF OF HOSPITAL (status: endorsed)
   The MTRC PRAISE Committee endorses the shortlisted nominees (the final list of
   awardees per award) to the Chief of Hospital for approval.
        |
        v
8. AWARD AND CONFERMENT (status: awarded)
   Create awardees row (grant_amount, tier, conferment_date).
   Secretariat informs awardees and prepares the conferment program.
   Track plaque_released and grant_released.
```

## Status transitions (nominations.status)

```
draft -> submitted -> validated -> shortlisted -> endorsed -> awarded
                  \-> disqualified
                               \-> not_selected
```

Rules: only Secretariat moves submitted -> validated/disqualified. Only Committee moves validated -> shortlisted/not_selected. Only the creator edits while draft. Record who and when for every transition.

## Awards

Only these six can be nominated. The official nomination forms are the source for who can be nominated. Dangal Level I and Level II are one category with two tiers.

| Code | Award | Nominee | Who can be nominated | Plaque | Max grant |
|---|---|---|---|---|---|
| DANGAL | Dangal ng MTRC Award - Level I | individual | permanent, SG 1 to 11 | yes | P5,000 |
| DANGAL | Dangal ng MTRC Award - Level II | individual | permanent, SG 12 and up | yes | P10,000 |
| CUSTOMER_SVC | Excellence in Customer Service Award | section/committee | any section or committee | yes | P10,000 |
| AGAP_SERBISYO | Agap Serbisyo | individual | COS | yes | none |
| SULONG_KALINANGAN | Sulong Kalinangan | individual | permanent and COS | yes | none |
| GAWAD_HIRAYA | Gawad Hiraya | individual | permanent and COS | yes | none |

Every individual nominee must have at least 3 years of service, whether permanent or COS, except for the Dangal award, which has no minimum length of service (any permanent employee qualifies regardless of how long they have been employed). This also does not apply to group awards (section, committee or unit), where all current members are included regardless of hire date. Group members and all nominees must be permanent or COS; outsourced/agency staff, job order, casual and interns cannot be nominated. The Dangal level is set automatically from the nominee's salary grade; the nominator does not choose it.

Where eligibility data comes from:

- Years of service: counted from the earliest Department of Health entry in the PDS work experience (EMIS), up to the date of nomination.
- Offense and criminal charge: PDS questions 35a, 35b and 36 (EMIS). These are self-declared, so a "Yes" or a blank asks the Secretariat to review and does not block the nomination.
- Ratings: approved forms in the EMIS IPCR tables (`ipcr_forms`, `ipcr_target_items`) and `praise_employee_ratings`. When both cover a period, the IPCR wins. A form's score is the average of its target items, labeled on the CSC SPMS scale (Outstanding 4.5+, Very Satisfactory 3.5+, Satisfactory 2.5+, Unsatisfactory 1.5+, Poor below that). With fewer than 2 ratings on file, the Secretariat verifies from the IPCR. The local database holds made-up ratings for testing: `npm run seed-ipcr-sample` adds them and `npm run seed-ipcr-sample -- --remove` deletes them.
- A check the records cannot answer does not block the nomination. It is marked for the Secretariat to verify.

Every nomination form asks for a Justification and Evidences under each criterion: Achievements and Contributions; The way the achievements and contributions were attained is described; Impact; Behavioral Indicators. The description and behavioral indicators for each award are in `frontend/src/data/categories.js`.

Removed from nomination: Chief of Hospital's Choice Award (individual and Section/Committee), Pagpupugay sa Watawat Award, DOH Service Award.

Other incentives (separate modules, phase 2):

- Loyalty Incentive: 10 and 15 years (bronze pin, P3,000 / P5,000); 20 and 25 years (silver ring, P7,000 / P9,000); 30, 35 and 40 years (gold medallion, P10,000 / P12,000 / P14,000). Plus a cash gift of P500 to P1,000 per year of service.
- Performance Based Bonus, Compensatory Time Off, Flexi-time, "Salu-salo" Together, Personal Growth Opportunities: informational only for now.

Applicability: permanent and COS employees can both be nominated, subject to each award's rule above; only permanent employees are considered for the national DOH PRAISE awards.

## Database tables

Read from EMIS, not stored in PRAISE: `users` (employees; `user_id` is the employee number), `reference_sections`, `reference_divisions`, `reference_positions` (salary grade), `emis_personal_data_sheets` (work experience, declarations).

- `employee_ratings` (employee_id, rating_period, period_end, rating_score, rating_label)
- `sessions` (token_hash, employee_id, expires_at)
- `access_roles` (code, name), `role_permissions` (role_id, permission_key), `user_access` (employee_id, role_id), `user_permission_overrides` (employee_id, permission_key, is_allowed)
- `award_cycles` (name, period_start, period_end, nomination_start, nomination_end, status draft/open/screening/closed)
- `award_categories` (code, name, description, behavioral_indicators JSON, counterpart_of, applies_to permanent/cos/both, nominee_type individual/section, has_plaque, has_grant, is_limit_exempt, is_active)
- `award_category_tiers` (category_id, tier_label, max_amount, salary_grade_min, salary_grade_max)
- `committee_members` (cycle_id, employee_id, role chair/secretariat/member, status active/relieved, relieved_reason, relieved_at)
- `nominations` (cycle_id, category_id, tier_id, employee_id, section_id, nominator_type supervisor/co_employee/external, nominator_employee_id, nominator_name, form_responses JSON, eligibility_snapshot JSON, status, disqualification_reason, remarks, submitted_at, validated_by, validated_at)
- `nomination_members` (nomination_id, employee_id, is_qualified, is_excluded)
- `nomination_documents` (nomination_id, doc_type nomination_form/ipcr/dpcr/opcr/award_commendation/publication/photo/testimonial/other, file_name, file_path, mime_type, file_size, is_verified, verified_by, uploaded_by)
- `awardees` (nomination_id unique, cycle_id, category_id, tier_id, employee_id, section_id, grant_amount, endorsed_to_coh, coh_decision, conferment_date, plaque_released, grant_released, remarks)

Business rules enforced in application code: eligibility checks, one-category-per-cycle limit, 3-year renomination gap, committee-member auto-relief, grant amount never above tier max_amount.

## Pages to build (in order)

1. Layout and routing (done: MainLayout with sidebar, header, content)
2. Award Categories (done: table, tiers, Add for the Secretariat and Admin, Edit with `award_categories.edit`, system-generated read-only code, no delete). Deactivating hides a category from every list, dropdown and form and keeps its records; a draft already on it can still be finished. Only the Secretariat and Admin see and reactivate inactive categories.
3. Award Cycles (done, under System Settings, General: table of cycles with add/edit — name, selection period, nomination window, status. The nomination window set here is what the nomination form uses to decide when nominations can be submitted. Needs the `settings` permission; Admin has it by default)
4. Employees (table, search, filter by section and status)
5. Nominations list (done: antd Table, status Tag colors, filters by cycle, category, status)
6. Nomination form (done: category, nominee/section, nominator, justification and evidences per criterion, document upload, live eligibility panel)
7. Secretariat validation screen (done: document checklist with a type picker for each attachment, validate or disqualify with reason). Every document must be verified before validating, and the checklist must include a nomination form (plus an IPCR for an individual nominee). Nobody can review a nomination they are the nominee, nominator or a group member of. Disqualification is final for that nomination, but it does not count toward the one-award limit, so the nominee can be nominated for another award. Reviewing needs `validation.review`, which only the Secretariat and Admin can hold. `validated_by` and `validated_at` record who made either decision and when.
8. Committee screening and selection screen (shortlist, not selected, conflict-of-interest block)
9. Endorsement to the Chief of Hospital (final list)
10. Awardees and conferment records (plaque and grant release tracking)
11. Committee management (done: roster per cycle of 1 Chairperson, 3 Secretariat and 5 Members, no alternates; relieve with a reason; remove a mistaken entry). Submitting a nomination automatically relieves the nominee, or every member of a nominated section, if they are on the cycle's committee. Someone already nominated (or in a nominated section) cannot join its committee. Managing needs `committee.manage`.
12. Dashboard (counts per status and per category, current cycle)
13. Reports (awardees per cycle, budget used vs allocation, export PDF/Excel)
14. Phase 2: Loyalty Incentive tracker, notifications to awardees
15. Access Management (done, under System Settings, styled to match EMIS: user table, Account Settings with module access, and role permissions). Passwords stay in EMIS. The sidebar and permission list both come from `frontend/src/config/navigation.js`. People who manage access can use the header's "Preview as" to see the app as a role or person; the server still applies their real access.
16. Login (done): sign in with an EMIS username, or the email on the person's PDS, and password, checked read-only against EMIS. Sessions are stored in `praise.sessions`, and the server enforces Access Management on every request. Until given a role, EMIS admins are Admin and everyone else is Nominator. Password resets stay in EMIS. The owner can also sign in with the built-in Admin account, using `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `backend/.env`; it is checked on the server and has no EMIS record.

## Funding note

The Department allocates at least 5% of HRD funds for PRAISE. Reports should compare total grants released against the cycle budget.

## First task for Claude Code

Read this file, then:
1. Create the folder structure under `frontend/src`.
2. Create mock data files for categories, cycles, employees and nominations in `frontend/src/data` so pages work before the backend exists.
3. Build page 2 (Award Categories) using antd Table, with the sidebar menu and routes updated.
Stop after step 3 and wait for review.
