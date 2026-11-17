// Columns on praise_nominations for endorsement to the Chief of Hospital, the COH's pick and the
// conferment date. Shared by setup-db and export-deploy-sql, so older databases get them too.
const EMPLOYEE_ID = 'VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL'

const awardingColumns = [
  ['endorsed_by', `${EMPLOYEE_ID} AFTER validated_at`],
  ['endorsed_at', 'DATETIME NULL AFTER endorsed_by'],
  ['coh_decided_by', `${EMPLOYEE_ID} AFTER endorsed_at`],
  ['coh_decided_at', 'DATETIME NULL AFTER coh_decided_by'],
  ['conferment_date', 'DATE NULL AFTER coh_decided_at'],
  ['conferment_recorded_by', `${EMPLOYEE_ID} AFTER conferment_date`],
]

module.exports = { awardingColumns }
