const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function formatPeso(amount) {
  return pesoFormatter.format(amount)
}

const moneyFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 })

// ₱12,345.00, for budgets and grants released.
export function formatMoney(amount) {
  return moneyFormatter.format(amount ?? 0)
}

export function formatTier(tier) {
  let salaryGrades = ''
  if (tier.salary_grade_min !== null) {
    salaryGrades =
      tier.salary_grade_max === null
        ? ` (SG ${tier.salary_grade_min} and up)`
        : ` (SG ${tier.salary_grade_min}-${tier.salary_grade_max})`
  }
  return `${tier.tier_label}${salaryGrades}: ${formatPeso(tier.max_amount)}`
}

export function todayString() {
  return new Date().toLocaleDateString('en-CA')
}

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const RELATIVE_STEPS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

// "just now", "5 minutes ago", "yesterday", ...
export function formatRelativeTime(value) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  if (Math.abs(seconds) < 45) return 'just now'
  const [unit, size] = RELATIVE_STEPS.find(([, step]) => Math.abs(seconds) >= step) ?? RELATIVE_STEPS.at(-1)
  return relativeFormatter.format(Math.round(seconds / size), unit)
}

// Dates from the API come as "YYYY-MM-DD" or "YYYY-MM-DD hh:mm:ss"; only the day is shown.
const longDateFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
const shortDateFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
const toLocalDay = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00`)

// "November 19, 2026", for sentences and detail views. Empty values show as a dash.
export function formatDate(value) {
  return value ? longDateFormatter.format(toLocalDay(value)) : '—'
}

// "Nov 19, 2026", for tables and cards.
export function formatShortDate(value) {
  return value ? shortDateFormatter.format(toLocalDay(value)) : '—'
}
