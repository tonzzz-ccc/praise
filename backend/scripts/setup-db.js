// Creates the PRAISE database and its starting data. Safe to run again: existing rows are kept.
const fs = require('node:fs')
const path = require('node:path')
const mysql = require('mysql2/promise')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })
const {
  accessRoles,
  nominatingRoleCodes,
  secretariatAwardingPermissions,
  secretariatCategoryPermissions,
  secretariatCommitteePermissions,
  secretariatRecordsPermissions,
  secretariatScreeningPermissions,
  secretariatValidationPermissions,
} = require('./accessSeed')
const { awardCategories, awardCycles } = require('./awardSeed')
const { awardingColumns } = require('./awardingColumns')
const { emisBrandingColumns } = require('./emisBrandingColumns')
const { certificateColumn, cycleBudgetColumn, releaseColumns, releaseTables } = require('./releaseColumns')

async function main() {
  // PRAISE now lives inside the EMIS database. The praise_* tables reference EMIS tables
  // (users, reference_sections), so this database must already exist with those tables.
  const dbName = process.env.DB_NAME || process.env.EMIS_DB_NAME
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  })

  await connection.query(`CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(dbName)}`)
  await connection.query(`USE ${mysql.escapeId(dbName)}`)
  await connection.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'praise_schema.sql'), 'utf8'))

  // Databases created before category names had to be unique.
  const [nameIndex] = await connection.query("SHOW INDEX FROM praise_award_categories WHERE Key_name = 'uq_category_name'")
  if (nameIndex.length === 0) {
    await connection.query('ALTER TABLE praise_award_categories ADD UNIQUE KEY uq_category_name (name)')
  }

  // Databases created before documents were tied to a criterion.
  const [docCriterion] = await connection.query("SHOW COLUMNS FROM praise_nomination_documents LIKE 'criterion'")
  if (docCriterion.length === 0) {
    await connection.query('ALTER TABLE praise_nomination_documents ADD COLUMN criterion VARCHAR(40) NULL AFTER doc_type')
  }

  // Databases created before committee screening used per-award criterion weights.
  const [weightsColumn] = await connection.query("SHOW COLUMNS FROM praise_award_categories LIKE 'criteria_weights'")
  if (weightsColumn.length === 0) {
    await connection.query('ALTER TABLE praise_award_categories ADD COLUMN criteria_weights JSON NULL AFTER is_active')
  }

  // Databases created before cycles had an awarding ceremony date.
  const [ceremonyColumn] = await connection.query("SHOW COLUMNS FROM praise_award_cycles LIKE 'ceremony_date'")
  if (ceremonyColumn.length === 0) {
    await connection.query('ALTER TABLE praise_award_cycles ADD COLUMN ceremony_date DATE NULL AFTER nomination_end')
  }

  // Branding shared with EMIS: PRAISE's columns on EMIS's settings row (emis_agency_setup, id 1).
  for (const column of emisBrandingColumns) {
    const [found] = await connection.query('SHOW COLUMNS FROM emis_agency_setup LIKE ?', [column.name])
    if (found.length === 0) {
      await connection.query(`ALTER TABLE emis_agency_setup ADD COLUMN ${mysql.escapeId(column.name)} ${column.definition}`)
    }
  }
  await connection.query('INSERT IGNORE INTO emis_agency_setup (id) VALUES (1)')

  // A sidebar logo saved by the earlier, file-based version moves into the database once.
  const [oldTables] = await connection.query("SHOW TABLES LIKE 'praise_system_settings'")
  if (oldTables.length > 0) {
    const [[oldLogo]] = await connection.query("SELECT setting_value, updated_at FROM praise_system_settings WHERE setting_key = 'sidebar_logo'")
    const oldFile = oldLogo && path.join(__dirname, '..', 'uploads', 'branding', path.basename(oldLogo.setting_value))
    if (oldFile && fs.existsSync(oldFile)) {
      const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
      await connection.query(
        'UPDATE emis_agency_setup SET sidebar_logo = ?, sidebar_logo_mime = ?, sidebar_logo_updated_at = ? WHERE id = 1 AND sidebar_logo IS NULL',
        [fs.readFileSync(oldFile), types[path.extname(oldFile).toLowerCase()] ?? 'image/png', oldLogo.updated_at],
      )
    }
  }

  // Databases created before nominations recorded the account that entered them. Existing ones
  // are credited to their nominator, the closest record of who entered them.
  // Databases created before awards could be put in order (Award Categories, drag to reorder).
  // Existing awards keep the order they were added in.
  const [sortColumn] = await connection.query("SHOW COLUMNS FROM praise_award_categories LIKE 'sort_order'")
  if (sortColumn.length === 0) {
    await connection.query('ALTER TABLE praise_award_categories ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER criteria_weights')
    await connection.query('UPDATE praise_award_categories SET sort_order = id')
  }

  // Databases created before screening used the rating matrix (0-4 per criterion, with remarks).
  const [remarksColumn] = await connection.query("SHOW COLUMNS FROM praise_screening_scores LIKE 'remarks'")
  if (remarksColumn.length === 0) {
    await connection.query('ALTER TABLE praise_screening_scores ADD COLUMN remarks TEXT NULL AFTER scores')
  }

  // Databases created before duplicate nominations were closed automatically ('closed' status).
  const [[statusColumn]] = await connection.query("SHOW COLUMNS FROM praise_nominations LIKE 'status'")
  if (!statusColumn.Type.includes("'closed'")) {
    await connection.query("ALTER TABLE praise_nominations MODIFY COLUMN status ENUM('draft', 'submitted', 'validated', 'disqualified', 'closed', 'shortlisted', 'not_selected', 'endorsed', 'awarded') NOT NULL DEFAULT 'draft'")
  }

  const [createdByColumn] = await connection.query("SHOW COLUMNS FROM praise_nominations LIKE 'created_by'")
  if (createdByColumn.length === 0) {
    await connection.query('ALTER TABLE praise_nominations ADD COLUMN created_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL AFTER nominator_name')
    await connection.query('UPDATE praise_nominations SET created_by = nominator_employee_id WHERE created_by IS NULL')
  }

  // Databases created before endorsement to the Chief of Hospital and conferment tracking.
  for (const [name, definition] of awardingColumns) {
    const [found] = await connection.query('SHOW COLUMNS FROM praise_nominations LIKE ?', [name])
    if (found.length === 0) await connection.query(`ALTER TABLE praise_nominations ADD COLUMN ${mysql.escapeId(name)} ${definition}`)
  }

  // Databases created before plaque and grant release tracking and cycle budgets.
  for (const table of releaseTables) {
    for (const [name, definition] of releaseColumns) {
      const [found] = await connection.query(`SHOW COLUMNS FROM ${mysql.escapeId(table)} LIKE ?`, [name])
      if (found.length === 0) await connection.query(`ALTER TABLE ${mysql.escapeId(table)} ADD COLUMN ${mysql.escapeId(name)} ${definition}`)
    }
  }
  const [certificateName, certificateDefinition] = certificateColumn
  const [certificate] = await connection.query('SHOW COLUMNS FROM praise_coh_choices LIKE ?', [certificateName])
  if (certificate.length === 0) {
    await connection.query(`ALTER TABLE praise_coh_choices ADD COLUMN ${mysql.escapeId(certificateName)} ${certificateDefinition}`)
  }
  const [budgetName, budgetDefinition] = cycleBudgetColumn
  const [budgetColumn] = await connection.query('SHOW COLUMNS FROM praise_award_cycles LIKE ?', [budgetName])
  if (budgetColumn.length === 0) {
    await connection.query(`ALTER TABLE praise_award_cycles ADD COLUMN ${mysql.escapeId(budgetName)} ${budgetDefinition}`)
  }

  for (const { tiers, behavioral_indicators, ...category } of awardCategories) {
    const [added] = await connection.query('INSERT IGNORE INTO praise_award_categories SET ?', {
      ...category,
      behavioral_indicators: JSON.stringify(behavioral_indicators),
    })
    const [[{ id }]] = await connection.query('SELECT id FROM praise_award_categories WHERE code = ?', [category.code])
    // Levels are only seeded with a new award, so ones later renamed or removed stay that way.
    for (const tier of added.affectedRows ? tiers : []) {
      await connection.query('INSERT IGNORE INTO praise_award_category_tiers SET ?', { ...tier, category_id: id })
    }
  }

  for (const cycle of awardCycles) {
    await connection.query('INSERT IGNORE INTO praise_award_cycles SET ?', cycle)
  }

  // Permissions are only seeded when a role is first created, so later edits are kept.
  for (const { permissions, ...role } of accessRoles) {
    const [result] = await connection.query('INSERT IGNORE INTO praise_access_roles SET ?', role)
    for (const permissionKey of result.affectedRows ? permissions : []) {
      await connection.query('INSERT INTO praise_role_permissions SET ?', {
        role_id: result.insertId,
        permission_key: permissionKey,
      })
    }
  }

  // Databases created before adding categories and managing inactive ones became Secretariat-only.
  const [step] = await connection.query('INSERT IGNORE INTO praise_setup_steps SET ?', { name: 'secretariat_category_permissions' })
  if (step.affectedRows) {
    const [[secretariat]] = await connection.query("SELECT id FROM praise_access_roles WHERE code = 'secretariat'")
    for (const permissionKey of secretariatCategoryPermissions) {
      await connection.query('INSERT IGNORE INTO praise_role_permissions SET ?', { role_id: secretariat.id, permission_key: permissionKey })
    }
    const onlySecretariat = ['award_categories.create', 'award_categories.manage_inactive']
    await connection.query('DELETE FROM praise_role_permissions WHERE role_id <> ? AND permission_key IN (?)', [secretariat.id, onlySecretariat])
    await connection.query('DELETE FROM praise_user_permission_overrides WHERE permission_key IN (?) AND is_allowed = 1', [onlySecretariat])
  }

  // Databases created before the Secretariat validation screen.
  const [validationStep] = await connection.query('INSERT IGNORE INTO praise_setup_steps SET ?', { name: 'secretariat_validation_permissions' })
  if (validationStep.affectedRows) {
    const [[secretariat]] = await connection.query("SELECT id FROM praise_access_roles WHERE code = 'secretariat'")
    for (const permissionKey of secretariatValidationPermissions) {
      await connection.query('INSERT IGNORE INTO praise_role_permissions SET ?', { role_id: secretariat.id, permission_key: permissionKey })
    }
  }

  // Databases created before Committee management.
  const [committeeStep] = await connection.query('INSERT IGNORE INTO praise_setup_steps SET ?', { name: 'committee_permissions' })
  if (committeeStep.affectedRows) {
    const [roles] = await connection.query("SELECT id, code FROM praise_access_roles WHERE code IN ('secretariat', 'committee')")
    for (const role of roles) {
      const keys = role.code === 'secretariat' ? secretariatCommitteePermissions : ['committee']
      for (const permissionKey of keys) {
        await connection.query('INSERT IGNORE INTO praise_role_permissions SET ?', { role_id: role.id, permission_key: permissionKey })
      }
    }
  }

  // Databases created before Committee screening.
  const [screeningStep] = await connection.query('INSERT IGNORE INTO praise_setup_steps SET ?', { name: 'screening_permissions' })
  if (screeningStep.affectedRows) {
    const [roles] = await connection.query("SELECT id, code FROM praise_access_roles WHERE code IN ('secretariat', 'committee')")
    for (const role of roles) {
      const keys = role.code === 'secretariat' ? secretariatScreeningPermissions : ['screening']
      for (const permissionKey of keys) {
        await connection.query('INSERT IGNORE INTO praise_role_permissions SET ?', { role_id: role.id, permission_key: permissionKey })
      }
    }
  }

  // Databases created before the Chairperson, Secretariat and Committee members could nominate.
  const [nominateStep] = await connection.query('INSERT IGNORE INTO praise_setup_steps SET ?', { name: 'committee_can_nominate' })
  if (nominateStep.affectedRows) {
    const [roles] = await connection.query('SELECT id FROM praise_access_roles WHERE code IN (?)', [nominatingRoleCodes])
    for (const role of roles) {
      for (const permissionKey of ['nominations', 'nominations.create']) {
        await connection.query('INSERT IGNORE INTO praise_role_permissions SET ?', { role_id: role.id, permission_key: permissionKey })
      }
    }
  }

  // Databases created before endorsement to the Chief of Hospital. The COH role itself is new, so
  // it gets its permissions when it is first seeded above.
  const [awardingStep] = await connection.query('INSERT IGNORE INTO praise_setup_steps SET ?', { name: 'awarding_permissions' })
  if (awardingStep.affectedRows) {
    const [[secretariat]] = await connection.query("SELECT id FROM praise_access_roles WHERE code = 'secretariat'")
    for (const permissionKey of secretariatAwardingPermissions) {
      await connection.query('INSERT IGNORE INTO praise_role_permissions SET ?', { role_id: secretariat.id, permission_key: permissionKey })
    }
  }

  // Databases created before the Records page let the Secretariat record releases.
  const [recordsStep] = await connection.query('INSERT IGNORE INTO praise_setup_steps SET ?', { name: 'records_permissions' })
  if (recordsStep.affectedRows) {
    const [[secretariat]] = await connection.query("SELECT id FROM praise_access_roles WHERE code = 'secretariat'")
    for (const permissionKey of secretariatRecordsPermissions) {
      await connection.query('INSERT IGNORE INTO praise_role_permissions SET ?', { role_id: secretariat.id, permission_key: permissionKey })
    }
  }

  await connection.end()
  console.log(`Database ${dbName} is ready.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
