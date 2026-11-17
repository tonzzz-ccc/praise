# PRAISE → EMIS database migration

PRAISE now lives **inside the EMIS database**. Its own tables use a `praise_` prefix
(`praise_nominations`, `praise_award_categories`, …), and they link to the EMIS tables
(`users`, `reference_sections`) through foreign keys, so EMIS stays the single source of truth for
employees and sections. Only **Permanent and COS** employees count as current members.

The app connects to one database, set by `DB_NAME` in `backend/.env` (the EMIS database).

## What the migration does

- Creates the `praise_*` tables inside the EMIS database (if they are not there yet).
- Copies any existing PRAISE data from the **old, separate** `praise` schema into those tables.
- **Never changes or deletes anything in EMIS's own tables, or in the old `praise` schema.** The
  old schema is left intact, so it doubles as a rollback source.
- Reports row counts and any rows whose employee/section no longer exists in EMIS (skipped).

Because PRAISE only *adds* its own tables, no existing EMIS data is modified by the migration.

## Run steps

From `backend/`, with `backend/.env` filled in (`DB_NAME=emis`, and `PRAISE_DB_NAME=praise` if you
had a separate PRAISE database to copy from):

```bash
# 1. Back up BOTH databases first (writes timestamped .sql files into backend/backups/).
npm run backup-db

# 2. Create the praise_* tables in EMIS and copy existing PRAISE data into them. Idempotent.
npm run migrate

# 3. (fresh installs only, instead of a copy) seed the starting categories, cycle and roles.
npm run setup-db

# 4. Start the backend; it now reads and writes the praise_* tables in the EMIS database.
npm run dev
```

`npm run migrate` and `npm run setup-db` are both safe to run more than once: they use
`CREATE TABLE IF NOT EXISTS` and `INSERT IGNORE`, so re-running never duplicates data or
overwrites later Access Management changes.

## Verifying

`npm run migrate` prints, per table, the source and target row counts and whether they match, plus
a referential-integrity line (`praise_nominations` with a missing EMIS employee/section — kept at 0
by the foreign keys). Any row it could not match (an employee or section no longer in EMIS) is
listed and skipped.

## Rollback

The migration copies data and leaves the old `praise` schema untouched, so rolling back is safe:

```bash
# 1. Remove the praise_* tables from EMIS (never touches EMIS's own tables).
npm run rollback

# 2. Revert the PRAISE code to before the migration.
git checkout <pre-migration-commit> -- backend frontend   # or: git revert

# 3. Point the app back at the old schema in backend/.env:
#    set DB_NAME / connection back to the separate PRAISE database, then: npm run dev
```

If you also want to restore from the dumps taken in step 1, each file in `backend/backups/`
is a full `mysqldump` and can be reloaded with:

```bash
"C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe" -u <user> -p < backend/backups/<file>.sql
```

## Notes

- **Foreign keys.** `praise_*.employee_id` → `users.user_id`, `praise_*.section_id` →
  `reference_sections.id`. EMIS can no longer delete a user or section that PRAISE references
  until that reference is removed (this is the intended coupling).
- **Built-in Admin.** `praise_sessions.employee_id` has **no** foreign key, because the built-in
  Admin (`builtin-admin`) has no EMIS user record. Login, roles, and the Admin fallback are
  unchanged.
- **Collation.** The `praise_*` employee columns use `utf8mb4_general_ci` to match
  `emis.users.user_id`, which is what makes the foreign keys valid.
- **Old `praise` schema.** Keep it until you have verified the migration. You can drop it later
  once you are satisfied.
