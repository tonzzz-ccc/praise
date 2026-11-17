import { Select, Tag } from 'antd'
import { awardStages } from '../utils/awarding'
import { getStatus } from '../utils/nominations'

export function StageTag({ stage }) {
  const { label, color } = awardStages[stage]
  return <Tag color={color}>{label}</Tag>
}

export function StatusTag({ status }) {
  const option = getStatus(status)
  return <Tag color={option?.color}>{option?.label ?? status}</Tag>
}

export function CycleSelect({ cycles, cycleId, onChange }) {
  return (
    <Select
      aria-label="Award cycle"
      placeholder="Select a cycle"
      style={{ width: 240, maxWidth: '100%' }}
      value={cycleId}
      onChange={onChange}
      options={(cycles ?? []).map((cycle) => ({ value: cycle.id, label: cycle.name }))}
    />
  )
}
