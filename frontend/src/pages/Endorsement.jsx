import { useCallback, useState } from 'react'
import { Alert, Button, Card, DatePicker, Empty, Flex, Form, Modal, Spin, Table, Typography } from 'antd'
import dayjs from 'dayjs'
import { CycleSelect, StageTag, StatusTag } from '../components/AwardingShared'
import { useCycleChoice } from '../hooks/useCycleChoice'
import { formatAverage, formatDate, hasLevels } from '../utils/awarding'
import NominationDetails from '../components/NominationDetails'
import PageHeader from '../components/PageHeader'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import { endorseAward, getEndorsement, recordConferment, withdrawEndorsement } from '../services/api'

function ConfermentModal({ target, onCancel, onSaved }) {
  const [form] = Form.useForm()
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function save({ conferment_date: date }) {
    setSaving(true)
    setError(null)
    try {
      await recordConferment({ kind: target.kind, id: target.id, conferment_date: date ? date.format('YYYY-MM-DD') : null })
      onSaved()
    } catch (saveError) {
      setError(saveError.message)
    }
    setSaving(false)
  }

  return (
    <Modal
      open={Boolean(target)}
      destroyOnHidden
      title={`Conferment date for ${target?.name ?? ''}`}
      okText="Save"
      okButtonProps={{ loading: saving }}
      onOk={() => form.submit()}
      onCancel={() => {
        setError(null)
        onCancel()
      }}
    >
      {target && (
        <>
          <Typography.Paragraph type="secondary">{target.award}. Leave the date empty to clear it.</Typography.Paragraph>
          {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
          <Form
            form={form}
            layout="vertical"
            preserve={false}
            initialValues={{ conferment_date: target.date ? dayjs(target.date) : null }}
            onFinish={save}
          >
            <Form.Item name="conferment_date" label="Date conferred">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  )
}

function ConfermentCell({ date, canManage, onEdit }) {
  return (
    <Flex gap={8} align="center" wrap="wrap">
      <span>{date ? formatDate(date) : <Typography.Text type="secondary">Not recorded</Typography.Text>}</span>
      {canManage && (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={onEdit}>
          {date ? 'Change' : 'Record'}
        </Button>
      )}
    </Flex>
  )
}

const choiceLabels = { section: 'COH Choice - Section', employee: 'COH Choice - Employee' }

export default function Endorsement() {
  const { can } = useAccess()
  const canManage = can('endorsement.manage')
  const [modal, modalHolder] = Modal.useModal()
  const { cycles, cycleId, setCycleId } = useCycleChoice()
  const [viewingId, setViewingId] = useState(null)
  const [conferment, setConferment] = useState(null)
  const [actionError, setActionError] = useState(null)

  const load = useCallback(() => (cycleId ? getEndorsement(cycleId) : Promise.resolve(null)), [cycleId])
  const { data, error, loading, reload } = useApi(load)

  function confirmAction({ title, content, okText, action }) {
    modal.confirm({
      title,
      content,
      okText,
      onOk: async () => {
        setActionError(null)
        try {
          await action()
        } catch (actionFailure) {
          setActionError(actionFailure.message)
        }
        reload()
      },
    })
  }

  function endorse(award) {
    confirmAction({
      title: `Endorse ${award.award_name} to the Chief of Hospital?`,
      content: `${award.nominations.map((nomination) => nomination.nominee_name).join(', ')} will be sent to the Chief of Hospital, who picks one winner.`,
      okText: 'Endorse',
      action: () => endorseAward({ cycle_id: cycleId, category_id: award.category_id }),
    })
  }

  function withdraw(award) {
    confirmAction({
      title: `Take ${award.award_name} back from the Chief of Hospital?`,
      content: 'Its nominees go back to shortlisted. You can endorse the award again later.',
      okText: 'Take back',
      action: () => withdrawEndorsement({ cycle_id: cycleId, category_id: award.category_id }),
    })
  }

  function columnsFor(award) {
    return [
      { title: 'Nominee', dataIndex: 'nominee_name' },
      ...(hasLevels(award.nominations) ? [{ title: 'Level', dataIndex: 'tier_label' }] : []),
      { title: 'Screening average', dataIndex: 'average', render: formatAverage },
      { title: 'Status', dataIndex: 'status', render: (status) => <StatusTag status={status} /> },
      {
        title: 'Conferment date',
        key: 'conferment',
        render: (_, row) =>
          row.status === 'awarded' ? (
            <ConfermentCell
              date={row.conferment_date}
              canManage={canManage}
              onEdit={() => setConferment({ kind: 'nomination', id: row.id, name: row.nominee_name, award: row.award_name, date: row.conferment_date })}
            />
          ) : (
            '—'
          ),
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_, row) => (
          <Button type="link" size="small" onClick={() => setViewingId(row.id)}>
            View
          </Button>
        ),
      },
    ]
  }

  const choices = data ? ['section', 'employee'].map((type) => ({ type, choice: data.coh_choices[type] })) : []

  return (
    <>
      {modalHolder}
      <PageHeader
        title="Endorsement and Conferment"
        subtitle="Endorse each award's shortlist to the Chief of Hospital, who picks one winner per award. Then record when each award was conferred."
      />

      <Flex className="page-filters" gap={8} wrap="wrap" style={{ marginBottom: 16 }}>
        <CycleSelect cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
      </Flex>

      {error && <Alert type="error" title={error.message} style={{ marginBottom: 16 }} />}
      {actionError && <Alert type="error" title={actionError} closable onClose={() => setActionError(null)} style={{ marginBottom: 16 }} />}

      {loading && !data ? (
        <Spin />
      ) : !data ? null : (
        <Flex vertical gap={16}>
          {data.awards.length === 0 ? (
            <Card>
              <Empty description="No award in this cycle has a shortlisted nominee yet. Finalize screening first." />
            </Card>
          ) : (
            data.awards.map((award) => (
              <Card
                key={award.category_id}
                title={
                  <Flex gap={8} align="center" wrap="wrap">
                    <span>{award.award_name}</span>
                    <StageTag stage={award.stage} />
                  </Flex>
                }
                extra={
                  canManage &&
                  (award.stage === 'ready' ? (
                    <Button type="primary" size="small" onClick={() => endorse(award)}>
                      Endorse to COH
                    </Button>
                  ) : award.stage === 'with_coh' ? (
                    <Button size="small" onClick={() => withdraw(award)}>
                      Take back
                    </Button>
                  ) : null)
                }
              >
                {award.stage === 'screening' && (
                  <Alert
                    type="info"
                    style={{ marginBottom: 12 }}
                    title={`${award.still_screening} nominee${award.still_screening === 1 ? ' is' : 's are'} still in screening. Finalize every level of this award before endorsing it.`}
                  />
                )}
                <Table
                  rowKey="id"
                  size="middle"
                  pagination={false}
                  columns={columnsFor(award)}
                  dataSource={award.nominations}
                  scroll={{ x: 'max-content' }}
                />
              </Card>
            ))
          )}

          <Card title="COH Choice">
            <Table
              rowKey="type"
              size="middle"
              pagination={false}
              scroll={{ x: 'max-content' }}
              dataSource={choices}
              columns={[
                { title: 'Award', dataIndex: 'type', render: (type) => choiceLabels[type] },
                {
                  title: 'Awardee',
                  key: 'awardee',
                  render: (_, { choice }) => choice?.awardee_name ?? <Typography.Text type="secondary">Not chosen yet</Typography.Text>,
                },
                { title: 'Chosen on', key: 'chosen', render: (_, { choice }) => (choice ? formatDate(choice.chosen_at) : '—') },
                {
                  title: 'Conferment date',
                  key: 'conferment',
                  render: (_, { type, choice }) =>
                    choice ? (
                      <ConfermentCell
                        date={choice.conferment_date}
                        canManage={canManage}
                        onEdit={() => setConferment({ kind: 'coh_choice', id: choice.id, name: choice.awardee_name, award: choiceLabels[type], date: choice.conferment_date })}
                      />
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
          </Card>
        </Flex>
      )}

      <NominationDetails nominationId={viewingId} onClose={() => setViewingId(null)} />
      <ConfermentModal
        target={conferment}
        onCancel={() => setConferment(null)}
        onSaved={() => {
          setConferment(null)
          reload()
        }}
      />
    </>
  )
}
