import dayjs from 'dayjs'

// The next year's cycle, from the latest one: every year in the name and every date moves forward
// one year, the budget carries over, and it opens for nominations.
export function nextCycleFrom(cycle) {
  if (!cycle) return null
  const nextYear = (date) => (date ? dayjs(date).add(1, 'year').format('YYYY-MM-DD') : null)
  return {
    name: cycle.name.replace(/\b(\d{4})\b/g, (year) => String(Number(year) + 1)),
    period_start: nextYear(cycle.period_start),
    period_end: nextYear(cycle.period_end),
    nomination_start: nextYear(cycle.nomination_start),
    nomination_end: nextYear(cycle.nomination_end),
    ceremony_date: nextYear(cycle.ceremony_date),
    budget: cycle.budget,
    status: 'open',
  }
}
