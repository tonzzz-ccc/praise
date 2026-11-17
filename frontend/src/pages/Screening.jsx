import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd'
import PageHeader from '../components/PageHeader'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import { defaultCycle } from '../hooks/useCycleChoice'
import { finalizeScreening, getScreening, listCycles, saveScreeningScore } from '../services/api'
import {
  criterionShortLabels,
  formatPercent,
  nominationCriteria,
  nominationStatuses,
  ratingDescriptors,
  ratingLevels,
  ratingPercent,
} from '../utils/nominations'
import './Screening.css'

const criteria = Object.keys(criterionShortLabels)
const roleNames = { chair: 'Chairperson', secretariat: 'Secretariat', member: 'Member' }

function StatusTag({ status }) {
  const option = nominationStatuses.find((item) => item.value === status)
  return <Tag color={option?.color}>{option?.label ?? status}</Tag>
}

function ScoreModal({ nomination, onCancel, onSaved }) {
  const [form] = Form.useForm()
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const values = Form.useWatch([], form)

  const total = nomination
    ? criteria.reduce((sum, key) => sum + (values?.[key] === undefined ? 0 : ratingPercent(values[key], nomination.weights[key])), 0)
    : 0

  async function submit({ remarks, ...scores }) {
    setSaving(true)
    setError(null)
    try {
      await saveScreeningScore(nomination.id, scores, remarks)
      onSaved()
    } catch (saveError) {
      setError(saveError.message)
    }
    setSaving(false)
  }

  return (
    <Modal
      open={Boolean(nomination)}
      destroyOnHidden
      width={720}
      title={`Rate ${nomination?.nominee_name ?? ''}`}
      okText="Save rating"
      okButtonProps={{ loading: saving }}
      onOk={() => form.submit()}
      onCancel={onCancel}
    >
      {nomination && (
        <>
          <Typography.Paragraph type="secondary">
            {nomination.award_name}. Rate each criterion using the rating matrix, from 0 (No evidence) to 4
            (Exceptional evidence). You can change your rating until the Secretariat finalizes this award. Other members
            cannot see your rating.
          </Typography.Paragraph>
          {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
          <Form
            form={form}
            layout="vertical"
            initialValues={{ ...(nomination.my_scores ?? {}), remarks: nomination.my_remarks ?? '' }}
            onFinish={submit}
            preserve={false}
          >
            {nominationCriteria.map(({ key, label }) => (
              <Card
                key={key}
                size="small"
                className="rating-criterion"
                title={label}
                extra={
                  <Tag color="blue" style={{ margin: 0 }}>
                    {nomination.weights[key]}%
                  </Tag>
                }
              >
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }} ellipsis={{ rows: 4, expandable: true }}>
                  {nomination.justifications[key] || <Typography.Text type="secondary">No justification given.</Typography.Text>}
                </Typography.Paragraph>
                <Form.Item
                  name={key}
                  label="Rating"
                  rules={[{ required: true, message: 'Choose a rating.' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Radio.Group className="rating-options">
                    {ratingLevels.map((level) => (
                      <Radio.Button key={level.value} value={level.value} className="rating-option">
                        <span className="rating-option-head">
                          <span className="rating-option-level">{level.value}</span>
                          <span className="rating-option-label">{level.label}</span>
                          <span className="rating-option-percent">
                            {formatPercent(ratingPercent(level.value, nomination.weights[key]))}
                          </span>
                        </span>
                        <span className="rating-option-text">{ratingDescriptors[key][level.value]}</span>
                      </Radio.Button>
                    ))}
                  </Radio.Group>
                </Form.Item>
              </Card>
            ))}
            <Form.Item name="remarks" label="Remarks">
              <Input.TextArea rows={3} maxLength={2000} showCount placeholder="Optional notes on this nominee" />
            </Form.Item>
          </Form>
          <div className="rating-total">
            <span>Total</span>
            <strong>{formatPercent(total)}</strong>
          </div>
        </>
      )}
    </Modal>
  )
}

function FinalizeModal({ group, cycleId, onCancel, onDone }) {
  const tied = group ? group.rows.filter((row) => row.status === 'validated' && row.rank === 1) : []
  const [winnerId, setWinnerId] = useState()
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function finalize() {
    setSaving(true)
    setError(null)
    try {
      await finalizeScreening({ cycle_id: cycleId, group_key: group.key, winner_id: winnerId })
      setWinnerId(undefined)
      onDone()
    } catch (finalizeError) {
      setError(finalizeError.message)
    }
    setSaving(false)
  }

  const isTie = tied.length > 1
  return (
    <Modal
      open={Boolean(group)}
      title={`Finalize ${group?.awardName ?? ''}?`}
      okText="Finalize"
      okButtonProps={{ loading: saving, disabled: isTie && !winnerId }}
      onOk={finalize}
      onCancel={() => {
        setWinnerId(undefined)
        setError(null)
        onCancel()
      }}
    >
      {isTie ? (
        <>
          <p>These nominees are tied for the highest average. Choose who is shortlisted:</p>
          <Radio.Group
            value={winnerId}
            onChange={(event) => setWinnerId(event.target.value)}
            options={tied.map((row) => ({ value: row.id, label: `${row.nominee_name} (${formatPercent(row.average)})` }))}
          />
        </>
      ) : (
        <p>
          {tied[0]?.nominee_name ?? 'The top-ranked nominee'} will be shortlisted and the others marked not selected.
          Members can no longer change their scores for this award.
        </p>
      )}
      {error && <Alert type="error" title={error} style={{ marginTop: 16 }} />}
    </Modal>
  )
}

function MemberScores({ nomination }) {
  if (nomination.scores.length === 0) return <Typography.Text type="secondary">No scores yet.</Typography.Text>
  return (
    <Table
      size="small"
      rowKey="committee_member_id"
      pagination={false}
      dataSource={nomination.scores}
      columns={[
        { title: 'Member', dataIndex: 'name', render: (name, row) => `${name} (${roleNames[row.role]})` },
        ...criteria.map((key) => ({
          title: `${criterionShortLabels[key]} (${nomination.weights[key]}%)`,
          key,
          render: (_, row) => `${row.scores[key]} · ${formatPercent(ratingPercent(row.scores[key], nomination.weights[key]))}`,
        })),
        { title: 'Total', dataIndex: 'total', render: (value) => formatPercent(value) },
        { title: 'Remarks', dataIndex: 'remarks', render: (value) => value || '—' },
      ]}
    />
  )
}

export default function Screening() {
  const { can } = useAccess()
  const canSeeResults = can('screening.results')
  const [chosenCycleId, setChosenCycleId] = useState()
  const [scoring, setScoring] = useState(null)
  const [finalizing, setFinalizing] = useState(null)

  const { data: cycles } = useApi(listCycles)
  const cycleId = chosenCycleId ?? defaultCycle(cycles)?.id
  const load = useCallback(() => (cycleId ? getScreening(cycleId) : Promise.resolve(null)), [cycleId])
  const { data, error, loading, reload } = useApi(load)

  const groups = useMemo(() => {
    const byKey = new Map()
    for (const row of data?.nominations ?? []) {
      if (!byKey.has(row.group_key)) byKey.set(row.group_key, { key: row.group_key, awardName: row.award_name, rows: [] })
      byKey.get(row.group_key).rows.push(row)
    }
    return [...byKey.values()]
  }, [data])

  const isMember = data?.membership?.status === 'active'

  const columns = [
    { title: 'Nominee', dataIndex: 'nominee_name' },
    { title: 'Status', dataIndex: 'status', render: (status) => <StatusTag status={status} /> },
    {
      title: 'My score',
      key: 'mine',
      render: (_, row) => {
        if (row.is_own_nomination) return <Typography.Text type="secondary">Your own nomination</Typography.Text>
        return row.my_total === null ? <Typography.Text type="secondary">Not rated</Typography.Text> : formatPercent(row.my_total)
      },
    },
    ...(canSeeResults
      ? [
          {
            title: 'Scored by',
            key: 'count',
            render: (_, row) => `${row.scores.length} of ${data.active_members}`,
          },
          { title: 'Average', dataIndex: 'average', render: (value) => (value === null ? '—' : formatPercent(value)) },
          { title: 'Rank', dataIndex: 'rank', render: (value) => value ?? '—' },
        ]
      : []),
    {
      title: 'Actions',
      key: 'actions',
      render: (_, row) =>
        row.can_score && (
          <Button type="link" size="small" onClick={() => setScoring(row)}>
            {row.my_scores ? 'Edit rating' : 'Rate'}
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Committee Screening"
        subtitle="Committee members rate each validated nominee with the rating matrix. The highest average in each award is shortlisted."
      />

      <Flex className="page-filters" gap={8} wrap="wrap" style={{ marginBottom: 16 }}>
        <Select
          aria-label="Award cycle"
          placeholder="Select a cycle"
          style={{ width: 240, maxWidth: '100%' }}
          value={cycleId}
          onChange={setChosenCycleId}
          options={(cycles ?? []).map((cycle) => ({ value: cycle.id, label: cycle.name }))}
        />
      </Flex>

      {error && <Alert type="error" title={error.message} style={{ marginBottom: 16 }} />}
      {data && !isMember && (
        <Alert
          type="info"
          style={{ marginBottom: 16 }}
          title={
            data.membership?.status === 'relieved'
              ? 'You have been relieved from this cycle\'s committee, so you cannot score nominees.'
              : 'You are not on this cycle\'s committee, so you cannot score nominees.'
          }
        />
      )}

      {loading && !data ? (
        <Spin />
      ) : groups.length === 0 ? (
        <Empty description="No validated nominees to screen in this cycle yet." />
      ) : (
        <Flex vertical gap={16}>
          {groups.map((group) => {
            const weights = group.rows[0].weights
            const open = group.rows.some((row) => row.status === 'validated')
            return (
              <Card
                key={group.key}
                title={group.awardName}
                extra={
                  canSeeResults &&
                  open && (
                    <Button type="primary" size="small" onClick={() => setFinalizing(group)}>
                      Finalize
                    </Button>
                  )
                }
              >
                <Flex gap={8} wrap="wrap" style={{ marginBottom: 12 }}>
                  {criteria.map((key) => (
                    <Tag key={key} style={{ margin: 0 }}>
                      {criterionShortLabels[key]}: <strong>{weights[key]}%</strong>
                    </Tag>
                  ))}
                </Flex>
                <Table
                  rowKey="id"
                  size="middle"
                  pagination={false}
                  columns={columns}
                  dataSource={group.rows}
                  scroll={{ x: 'max-content' }}
                  expandable={canSeeResults ? { expandedRowRender: (row) => <MemberScores nomination={row} /> } : undefined}
                />
              </Card>
            )
          })}
        </Flex>
      )}

      <ScoreModal
        nomination={scoring}
        onCancel={() => setScoring(null)}
        onSaved={() => {
          setScoring(null)
          reload()
        }}
      />
      {canSeeResults && (
        <FinalizeModal
          group={finalizing}
          cycleId={cycleId}
          onCancel={() => setFinalizing(null)}
          onDone={() => {
            setFinalizing(null)
            reload()
          }}
        />
      )}
    </>
  )
}
