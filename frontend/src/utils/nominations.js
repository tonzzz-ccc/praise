export const nominationCriteria = [
  { key: 'achievements', label: 'Achievements and Contributions' },
  { key: 'method', label: 'The way the achievements and contributions were attained is described.' },
  { key: 'impact', label: 'Impact' },
  { key: 'behavioral_indicators', label: 'Behavioral Indicators' },
]

export const criterionShortLabels = {
  achievements: 'Achievements',
  method: 'Method',
  impact: 'Impact',
  behavioral_indicators: 'Behavioral indicators',
}

// PRAISE rating matrix: each criterion is rated 0-4 and earns that share of its weight.
export const RATING_MAX = 4
export const ratingLevels = [
  { value: 0, label: 'No evidence' },
  { value: 1, label: 'Limited evidence' },
  { value: 2, label: 'Suitable evidence' },
  { value: 3, label: 'Strong evidence' },
  { value: 4, label: 'Exceptional evidence' },
]
export const ratingDescriptors = {
  achievements: [
    'None identified',
    'Limited level of detail provided',
    'Suitable level of detail provided. Achievements/contributions demonstrate the nominee once or twice going "above and beyond" the normal scope of their role.',
    'Strong level of detail provided. Achievements/contributions demonstrate the nominee occasionally going "above and beyond" the normal scope of their role.',
    'Exceptional level of detail provided. Achievements/contributions demonstrate the nominee consistently going "above and beyond" the normal scope of their role.',
  ],
  method: ['Not described', 'Limited description', 'Suitable description', 'Strong description', 'Exceptional description'],
  impact: [
    'Not demonstrated',
    'Limited demonstration',
    'Suitable demonstration. Achievements/contributions had moderate impact.',
    'Strong demonstration. Achievements/contributions had great impact.',
    'Exceptional demonstration. Achievements/contributions had significant impact.',
  ],
  behavioral_indicators: [
    'Not demonstrated',
    'Limited alignment demonstrated',
    'Suitable alignment demonstrated. Some examples of situations associated.',
    'Strong alignment demonstrated',
    'Exceptional alignment demonstrated',
  ],
}
// The percentage a rating earns on a criterion, e.g. 3 on a 30% criterion = 22.5.
export const ratingPercent = (level, weight) => (Number(level) / RATING_MAX) * weight
export const formatPercent = (value) => `${Number(value.toFixed(2))}%`

export const nominationStatuses = [
  { value: 'draft', label: 'Draft', color: 'default' },
  { value: 'submitted', label: 'Submitted', color: 'blue' },
  { value: 'validated', label: 'Validated', color: 'cyan' },
  { value: 'disqualified', label: 'Disqualified', color: 'red' },
  { value: 'closed', label: 'Closed', color: 'default' },
  { value: 'shortlisted', label: 'Shortlisted', color: 'geekblue' },
  { value: 'not_selected', label: 'Not selected', color: 'orange' },
  { value: 'endorsed', label: 'Endorsed to COH', color: 'purple' },
  { value: 'awarded', label: 'Awarded', color: 'green' },
]

export const nominatorTypeOptions = [
  { value: 'supervisor', label: 'Immediate supervisor' },
  { value: 'co_employee', label: 'Co-employee' },
  { value: 'external', label: 'Private person or organization' },
]

export const disqualificationReasonLabels = {
  incomplete_documents: 'Incomplete documents',
  misrepresentation: 'Misrepresentation',
  special_favor: 'Asked a Committee member for a special favor',
}

export const documentTypeOptions = [
  { value: 'nomination_form', label: 'Nomination form' },
  { value: 'ipcr', label: 'IPCR' },
  { value: 'dpcr', label: 'DPCR' },
  { value: 'opcr', label: 'OPCR' },
  { value: 'award_commendation', label: 'Award or commendation' },
  { value: 'publication', label: 'Publication' },
  { value: 'photo', label: 'Photo' },
  { value: 'testimonial', label: 'Testimonial' },
  { value: 'other', label: 'Other' },
]

export function getStatus(value) {
  return nominationStatuses.find((status) => status.value === value)
}
