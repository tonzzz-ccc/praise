import { formatPercent } from './nominations'

// Where an award stands after screening.
export const awardStages = {
  screening: { label: 'Screening in progress', color: 'default' },
  ready: { label: 'Ready to endorse', color: 'blue' },
  with_coh: { label: 'With the Chief of Hospital', color: 'purple' },
  decided: { label: 'Winner picked', color: 'green' },
}

export const formatAverage = (value) => (value === null ? '—' : formatPercent(value))

const dateFormatter = new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
export const formatDate = (value) => (value ? dateFormatter.format(new Date(`${value.slice(0, 10)}T00:00:00`)) : '—')

// Shows the grant level only for awards with a shortlisted nominee per level (e.g. Dangal).
export const hasLevels = (nominations) => new Set(nominations.map((nomination) => nomination.tier_label).filter(Boolean)).size > 1
