// Plaque and grant release tracking for awardees (Records page), on both award winners
// (praise_nominations) and COH Choice awardees (praise_coh_choices), plus each cycle's PRAISE
// budget (Reports: grants released against the allocation). Shared by setup-db and
// export-deploy-sql, so older databases get them too.
const EMPLOYEE_ID = 'VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL'

const releaseColumns = [
  ['plaque_released_on', 'DATE NULL AFTER conferment_recorded_by'],
  ['grant_amount', 'DECIMAL(10, 2) NULL AFTER plaque_released_on'],
  ['grant_released_on', 'DATE NULL AFTER grant_amount'],
  ['release_recorded_by', `${EMPLOYEE_ID} AFTER grant_released_on`],
]
const releaseTables = ['praise_nominations', 'praise_coh_choices']

// COH Choice awardees get a certificate, not a plaque or grant.
const certificateColumn = ['certificate_released_on', 'DATE NULL AFTER conferment_recorded_by']

const cycleBudgetColumn = ['budget', 'DECIMAL(12, 2) NULL AFTER ceremony_date']

module.exports = { certificateColumn, cycleBudgetColumn, releaseColumns, releaseTables }
