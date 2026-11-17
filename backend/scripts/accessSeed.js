const secretariatCategoryPermissions = [
  'award_categories.edit',
  'award_categories.create',
  'award_categories.manage_inactive',
]

const secretariatValidationPermissions = ['validation', 'validation.review']
const secretariatCommitteePermissions = ['committee', 'committee.manage']
const secretariatScreeningPermissions = ['screening', 'screening.results']
// Endorsing shortlisted nominees to the Chief of Hospital and recording conferment dates.
const secretariatAwardingPermissions = ['endorsement', 'endorsement.manage']
// Recording plaque and grant releases for awardees on the Records page.
const secretariatRecordsPermissions = ['records', 'records.manage']

// The Chairperson, Secretariat and Committee members may still nominate (conflicts are handled by
// relieving a nominated member and barring self-review), so their roles include nominations.create.
const nominatingRoleCodes = ['secretariat', 'committee']

// Starting permissions for the roles in PRAISE_PROCESS_FLOW.md. Admins can change them in Access Management.
const accessRoles = [
  { code: 'admin', name: 'Admin', permissions: [] },
  {
    code: 'secretariat',
    name: 'Secretariat',
    permissions: [
      'dashboard',
      'award_categories',
      ...secretariatCategoryPermissions,
      'nominations',
      'nominations.create',
      ...secretariatValidationPermissions,
      ...secretariatCommitteePermissions,
      ...secretariatScreeningPermissions,
      ...secretariatAwardingPermissions,
      ...secretariatRecordsPermissions,
      'reports',
    ],
  },
  { code: 'committee', name: 'Committee member', permissions: ['dashboard', 'nominations', 'nominations.create', 'committee', 'screening', 'reports'] },
  // The Chief of Hospital picks the winner of each endorsed award and makes the COH Choice picks.
  { code: 'coh', name: 'Chief of Hospital', permissions: ['dashboard', 'coh_approval', 'coh_approval.decide'] },
  { code: 'nominator', name: 'Nominator', permissions: ['dashboard', 'nominations', 'nominations.create'] },
  { code: 'viewer', name: 'Viewer', permissions: ['dashboard', 'nominations', 'reports'] },
]

module.exports = {
  accessRoles,
  nominatingRoleCodes,
  secretariatAwardingPermissions,
  secretariatCategoryPermissions,
  secretariatCommitteePermissions,
  secretariatRecordsPermissions,
  secretariatScreeningPermissions,
  secretariatValidationPermissions,
}
