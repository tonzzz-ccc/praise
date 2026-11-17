-- PRAISE's own tables, living inside the EMIS database with a praise_ prefix so both systems
-- share one database. Employees and sections are the EMIS tables (the single source of truth):
-- praise_*.employee_id references emis users.user_id, section_id references reference_sections.id.
--
-- These tables use utf8mb4_general_ci to match emis.users.user_id, so the foreign keys below are
-- valid. This file is run against the EMIS database and never creates or alters any EMIS table.

CREATE TABLE IF NOT EXISTS praise_award_cycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  nomination_start DATE NOT NULL,
  nomination_end DATE NOT NULL,
  ceremony_date DATE NULL,
  -- The PRAISE allocation for the cycle (at least 5% of HRD funds), compared with grants released.
  budget DECIMAL(12, 2) NULL,
  status ENUM('draft', 'open', 'screening', 'closed') NOT NULL DEFAULT 'draft'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS praise_award_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  behavioral_indicators JSON NOT NULL,
  applies_to ENUM('permanent', 'cos', 'both') NOT NULL,
  nominee_type ENUM('individual', 'section') NOT NULL,
  has_plaque TINYINT(1) NOT NULL DEFAULT 1,
  has_grant TINYINT(1) NOT NULL DEFAULT 0,
  is_limit_exempt TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  criteria_weights JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_category_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS praise_award_category_tiers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  tier_label VARCHAR(50) NOT NULL,
  max_amount DECIMAL(10, 2) NOT NULL,
  salary_grade_min TINYINT UNSIGNED NULL,
  salary_grade_max TINYINT UNSIGNED NULL,
  UNIQUE KEY uq_category_tier (category_id, tier_label),
  CONSTRAINT fk_praise_tier_category FOREIGN KEY (category_id) REFERENCES praise_award_categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- employee_id references emis.users.user_id.
CREATE TABLE IF NOT EXISTS praise_employee_ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  rating_period VARCHAR(50) NOT NULL,
  period_end DATE NOT NULL,
  rating_score DECIMAL(4, 2) NULL,
  rating_label VARCHAR(50) NOT NULL,
  UNIQUE KEY uq_employee_period (employee_id, period_end),
  CONSTRAINT fk_praise_rating_user FOREIGN KEY (employee_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- employee_id references emis.users.user_id; section_id references emis.reference_sections.id.
-- nominator_employee_id and validated_by are left without a foreign key because they can hold the
-- built-in Admin or an external nominator that has no EMIS user record.
CREATE TABLE IF NOT EXISTS praise_nominations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  category_id INT NOT NULL,
  tier_id INT NULL,
  employee_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  section_id INT NULL,
  nominator_type ENUM('supervisor', 'co_employee', 'external') NULL,
  nominator_employee_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  nominator_name VARCHAR(200) NULL,
  created_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  form_responses JSON NOT NULL,
  eligibility_snapshot JSON NOT NULL,
  status ENUM('draft', 'submitted', 'validated', 'disqualified', 'closed', 'shortlisted', 'not_selected', 'endorsed', 'awarded') NOT NULL DEFAULT 'draft',
  disqualification_reason ENUM('incomplete_documents', 'misrepresentation', 'special_favor') NULL,
  remarks TEXT NULL,
  submitted_at DATETIME NULL,
  validated_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  validated_at DATETIME NULL,
  -- Endorsement to the Chief of Hospital (Secretariat), the COH's pick, and the conferment date
  -- the Secretariat records for the winner. These ids can be the built-in Admin, so no foreign key.
  endorsed_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  endorsed_at DATETIME NULL,
  coh_decided_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  coh_decided_at DATETIME NULL,
  conferment_date DATE NULL,
  conferment_recorded_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  -- Plaque and grant release for an awardee, recorded by the Secretariat on the Records page.
  plaque_released_on DATE NULL,
  grant_amount DECIMAL(10, 2) NULL,
  grant_released_on DATE NULL,
  release_recorded_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cycle_employee (cycle_id, employee_id),
  CONSTRAINT fk_praise_nomination_cycle FOREIGN KEY (cycle_id) REFERENCES praise_award_cycles (id),
  CONSTRAINT fk_praise_nomination_category FOREIGN KEY (category_id) REFERENCES praise_award_categories (id),
  CONSTRAINT fk_praise_nomination_tier FOREIGN KEY (tier_id) REFERENCES praise_award_category_tiers (id),
  CONSTRAINT fk_praise_nomination_employee FOREIGN KEY (employee_id) REFERENCES users (user_id),
  CONSTRAINT fk_praise_nomination_section FOREIGN KEY (section_id) REFERENCES reference_sections (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- employee_id references emis.users.user_id.
CREATE TABLE IF NOT EXISTS praise_nomination_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nomination_id INT NOT NULL,
  employee_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  is_qualified TINYINT(1) NOT NULL,
  is_excluded TINYINT(1) NOT NULL,
  UNIQUE KEY uq_nomination_member (nomination_id, employee_id),
  CONSTRAINT fk_praise_member_nomination FOREIGN KEY (nomination_id) REFERENCES praise_nominations (id) ON DELETE CASCADE,
  CONSTRAINT fk_praise_member_user FOREIGN KEY (employee_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS praise_nomination_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nomination_id INT NOT NULL,
  doc_type ENUM('nomination_form', 'ipcr', 'dpcr', 'opcr', 'award_commendation', 'publication', 'photo', 'testimonial', 'other') NOT NULL DEFAULT 'other',
  -- The nomination criterion this document supports (achievements, method, impact,
  -- behavioral_indicators). NULL for documents not tied to a criterion.
  criterion VARCHAR(40) NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  verified_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  uploaded_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_praise_document_nomination FOREIGN KEY (nomination_id) REFERENCES praise_nominations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- One roster per cycle: 1 chair, 3 secretariat, 5 members (enforced by the app).
-- employee_id references emis.users.user_id. A relieved member keeps their seat.
CREATE TABLE IF NOT EXISTS praise_committee_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  employee_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  role ENUM('chair', 'secretariat', 'member') NOT NULL,
  status ENUM('active', 'relieved') NOT NULL DEFAULT 'active',
  relieved_reason VARCHAR(255) NULL,
  relieved_at DATETIME NULL,
  UNIQUE KEY uq_committee_cycle_employee (cycle_id, employee_id),
  CONSTRAINT fk_praise_committee_cycle FOREIGN KEY (cycle_id) REFERENCES praise_award_cycles (id),
  CONSTRAINT fk_praise_committee_user FOREIGN KEY (employee_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Committee screening: one row per committee member per nomination. scores holds 0-100 per
-- criterion; the weighted total and averages are worked out from the award's criteria_weights.
CREATE TABLE IF NOT EXISTS praise_screening_scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nomination_id INT NOT NULL,
  committee_member_id INT NOT NULL,
  scores JSON NOT NULL,
  remarks TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_screening_score (nomination_id, committee_member_id),
  CONSTRAINT fk_praise_score_nomination FOREIGN KEY (nomination_id) REFERENCES praise_nominations (id) ON DELETE CASCADE,
  CONSTRAINT fk_praise_score_member FOREIGN KEY (committee_member_id) REFERENCES praise_committee_members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- COH Choice: the Chief of Hospital's own two awardees per cycle, chosen without a nomination:
-- one section (no conditions) and one permanent employee with at least 3 years in the center.
-- employee_id references emis.users.user_id; section_id references emis.reference_sections.id.
CREATE TABLE IF NOT EXISTS praise_coh_choices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  choice_type ENUM('section', 'employee') NOT NULL,
  employee_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  section_id INT NULL,
  remarks TEXT NULL,
  chosen_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  chosen_at DATETIME NOT NULL,
  conferment_date DATE NULL,
  conferment_recorded_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  -- Plaque and grant release for an awardee, recorded by the Secretariat on the Records page.
  plaque_released_on DATE NULL,
  grant_amount DECIMAL(10, 2) NULL,
  grant_released_on DATE NULL,
  release_recorded_by VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  UNIQUE KEY uq_coh_choice (cycle_id, choice_type),
  CONSTRAINT fk_praise_coh_choice_cycle FOREIGN KEY (cycle_id) REFERENCES praise_award_cycles (id),
  CONSTRAINT fk_praise_coh_choice_user FOREIGN KEY (employee_id) REFERENCES users (user_id),
  CONSTRAINT fk_praise_coh_choice_section FOREIGN KEY (section_id) REFERENCES reference_sections (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Access Management. The admin role always has every permission, so it has no rows in praise_role_permissions.
CREATE TABLE IF NOT EXISTS praise_access_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS praise_role_permissions (
  role_id INT NOT NULL,
  permission_key VARCHAR(100) NOT NULL,
  PRIMARY KEY (role_id, permission_key),
  CONSTRAINT fk_praise_permission_role FOREIGN KEY (role_id) REFERENCES praise_access_roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- employee_id references emis.users.user_id.
CREATE TABLE IF NOT EXISTS praise_user_access (
  employee_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci PRIMARY KEY,
  role_id INT NULL,
  CONSTRAINT fk_praise_user_access_role FOREIGN KEY (role_id) REFERENCES praise_access_roles (id),
  CONSTRAINT fk_praise_user_access_user FOREIGN KEY (employee_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- employee_id references emis.users.user_id.
CREATE TABLE IF NOT EXISTS praise_user_permission_overrides (
  employee_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  permission_key VARCHAR(100) NOT NULL,
  is_allowed TINYINT(1) NOT NULL,
  PRIMARY KEY (employee_id, permission_key),
  CONSTRAINT fk_praise_override_user FOREIGN KEY (employee_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- One-time data changes already made, so running setup again cannot undo later Access Management edits.
CREATE TABLE IF NOT EXISTS praise_setup_steps (
  name VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Login sessions. Only a hash of the session token is stored. employee_id has no foreign key
-- because it can be the built-in Admin ('builtin-admin'), which has no EMIS user record.
CREATE TABLE IF NOT EXISTS praise_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  employee_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_session_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- In-app notifications, one row per recipient. recipient_id and actor_id have no foreign key
-- because either can be the built-in Admin ('builtin-admin'), which has no EMIS user record.
-- link is the app page the notification opens (for example /validation).
CREATE TABLE IF NOT EXISTS praise_notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  recipient_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(150) NOT NULL,
  message VARCHAR(500) NOT NULL,
  link VARCHAR(200) NULL,
  nomination_id INT NULL,
  actor_id VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  actor_name VARCHAR(150) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notification_inbox (recipient_id, is_read, created_at),
  KEY idx_notification_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
