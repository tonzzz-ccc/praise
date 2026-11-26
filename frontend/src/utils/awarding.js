import { formatPercent } from './nominations'

export { formatDate } from './format'

// Where an award stands after screening.
export const awardStages = {
  screening: { label: 'Screening in progress', color: 'default' },
  ready: { label: 'Ready to endorse', color: 'blue' },
  with_coh: { label: 'With the Chief of Hospital', color: 'purple' },
  decided: { label: 'Winner picked', color: 'green' },
}

export const formatAverage = (value) => (value === null ? '—' : formatPercent(value))


// Shows the grant level only for awards with a shortlisted nominee per level (e.g. Dangal).
export const hasLevels = (nominations) => new Set(nominations.map((nomination) => nomination.tier_label).filter(Boolean)).size > 1
