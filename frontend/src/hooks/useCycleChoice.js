import { useState } from 'react'
import { useApi } from './useApi'
import { listCycles } from '../services/api'

const ACTIVE_STATUSES = ['open', 'screening']

// The cycle a page opens on: the newest one still in use (open for nominations or in screening),
// else the latest. Cycles come newest first, so last year's cycle never wins over this year's.
export function defaultCycle(cycles) {
  return cycles?.find((cycle) => ACTIVE_STATUSES.includes(cycle.status)) ?? cycles?.[0]
}

export function useCycleChoice() {
  const [chosenCycleId, setChosenCycleId] = useState()
  const { data: cycles } = useApi(listCycles)
  return { cycles, cycleId: chosenCycleId ?? defaultCycle(cycles)?.id, setCycleId: setChosenCycleId }
}
