import { useCallback, useState } from 'react'
import { Alert, Button, Card, Col, Descriptions, Flex, Form, Input, Modal, Row, Select, Spin, Table, Tabs, Tag, Typography } from 'antd'
import { CycleSelect, StageTag, StatusTag } from '../components/AwardingShared'
import { useCycleChoice } from '../hooks/useCycleChoice'
import { formatAverage, formatDate, hasLevels } from '../utils/awarding'
import NominationDetails from '../components/NominationDetails'
import PageHeader from '../components/PageHeader'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import { getCohApproval, listCohChoiceCandidates, saveCohChoice, selectAwardWinner } from '../services/api'
import { useTableScroll } from '../hooks/useTableScroll'

const choiceTypes = {
  section: { title: 'COH Choice - Section', field: 'section_id', placeholder: 'Choose a section' },
  employee: { title: 'COH Choice - Employee', field: 'employee_id', placeholder: 'Choose a permanent employee' },
}

function ChoiceCard({ type, choice, candidates, canDecide, onChoose }) {
  const [form] = Form.useForm()
  const { title, field, placeholder } = choiceTypes[type]

  if (choice) {
    return (
      <Card title={title} extra={<Tag color="green">Chosen</Tag>} style={{ height: '100%' }}>
        <Descriptions
          column={1}
          size="small"
          items={[
            { key: 'awardee', label: type === 'section' ? 'Section' : 'Employee', children: <strong>{choice.awardee_name}</strong> },
            { key: 'chosen', label: 'Chosen on', children: formatDate(choice.chosen_at) },
            { key: 'remarks', label: 'Remarks', children: choice.remarks || '—' },
            { key: 'conferred', label: 'Conferred on', children: formatDate(choice.conferment_date) },
          ]}
        />
      </Card>
    )
  }

  const options =
    type === 'section'
      ? (candidates?.sections ?? []).map((section) => ({
          value: section.id,
          label: section.division_name ? `${section.name} (${section.division_name})` : section.name,
        }))
      : (candidates?.employees ?? []).map((employee) => ({
          value: employee.id,
          label: `${employee.name}${employee.section_name ? ` · ${employee.section_name}` : ''} · ${
            employee.years_of_service === null ? 'service needs checking' : `${employee.years_of_service} yrs`
          }`,
        }))

  return (
    <Card title={title} style={{ height: '100%' }}>
      <Typography.Paragraph type="secondary">
        {type === 'section'
          ? 'Any section can be chosen.'
          : `Active permanent employees with at least ${candidates?.min_years ?? 3} years in the center. Employees with no service record in EMIS yet are listed as "service needs checking".`}
      </Typography.Paragraph>
      {canDecide ? (
        <Form form={form} layout="vertical" onFinish={(values) => onChoose(type, values, options)}>
          <Form.Item name={field} label={type === 'section' ? 'Section' : 'Employee'} rules={[{ required: true, message: placeholder }]}>
            <Select showSearch optionFilterProp="label" placeholder={placeholder} options={options} loading={!candidates} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} maxLength={2000} placeholder="Optional reason for this choice" />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            Choose
          </Button>
        </Form>
      ) : (
        <Typography.Text type="secondary">Not chosen yet.</Typography.Text>
      )}
    </Card>
  )
}

export default function CohApproval() {
  const tableScroll = useTableScroll()
  const { can } = useAccess()
  const canDecide = can('coh_approval.decide')
  const [modal, modalHolder] = Modal.useModal()
  const { cycles, cycleId, setCycleId } = useCycleChoice()
  const [viewingId, setViewingId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const load = useCallback(() => (cycleId ? getCohApproval(cycleId) : Promise.resolve(null)), [cycleId])
  const { data, error, loading, reload } = useApi(load)
  const loadCandidates = useCallback(() => (canDecide ? listCohChoiceCandidates() : Promise.resolve(null)), [canDecide])
  const { data: candidates } = useApi(loadCandidates)

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

  function pickWinner(award, nomination) {
    const others = award.nominations.filter((row) => row.id !== nomination.id)
    confirmAction({
      title: `Pick ${nomination.nominee_name} as the winner of ${award.award_name}?`,
      content: `This is final. ${others.length > 0 ? `${others.map((row) => row.nominee_name).join(', ')} will be marked not selected.` : ''}`,
      okText: 'Pick as winner',
      action: () => selectAwardWinner(nomination.id),
    })
  }

  function chooseForCoh(type, values, options) {
    const field = choiceTypes[type].field
    const label = options.find((option) => option.value === values[field])?.label ?? ''
    confirmAction({
      title: `Choose ${label.split(' · ')[0]} as ${choiceTypes[type].title}?`,
      content: 'This is final for this cycle.',
      okText: 'Choose',
      action: () => saveCohChoice({ cycle_id: cycleId, choice_type: type, ...values }),
    })
  }

  function columnsFor(award) {
    const open = award.stage === 'with_coh'
    return [
      { title: 'Nominee', dataIndex: 'nominee_name' },
      ...(hasLevels(award.nominations) ? [{ title: 'Level', dataIndex: 'tier_label' }] : []),
      { title: 'Screening average', dataIndex: 'average', responsive: ['sm'], render: formatAverage },
      { title: 'Status', dataIndex: 'status', responsive: ['md'], render: (status) => <StatusTag status={status} /> },
      {
        title: 'Actions',
        key: 'actions',
        render: (_, row) => (
          <Flex gap={8} wrap="wrap">
            <Button size="small" onClick={() => setViewingId(row.id)}>
              View qualifications
            </Button>
            {canDecide && open && (
              <Button type="primary" size="small" onClick={() => pickWinner(award, row)}>
                Pick as winner
              </Button>
            )}
          </Flex>
        ),
      },
    ]
  }

  const awardTabs = (data?.awards ?? []).map((award) => {
    const winner = award.nominations.find((row) => row.status === 'awarded')
    return {
      key: String(award.category_id),
      label: (
        <Flex gap={6} align="center">
          {award.award_name}
          {award.stage === 'with_coh' && <Tag color="purple" style={{ margin: 0 }}>To decide</Tag>}
        </Flex>
      ),
      children: (
        <Card
          title={
            <Flex gap={8} align="center" wrap="wrap">
              <span>{award.award_name}</span>
              <StageTag stage={award.stage} />
            </Flex>
          }
        >
          <Typography.Paragraph type="secondary">
            {winner
              ? `${winner.nominee_name} was picked as the winner on ${formatDate(winner.coh_decided_at)}.`
              : 'Open each nominee\'s qualifications, then pick one winner for this award. The other nominees will be marked not selected.'}
          </Typography.Paragraph>
          <Table
            rowKey="id"
            size="middle"
            pagination={false}
            columns={columnsFor(award)}
            dataSource={award.nominations}
            scroll={tableScroll}
          />
        </Card>
      ),
    }
  })

  const choiceTab = data && {
    key: 'coh_choice',
    label: 'COH Choice',
    children: (
      <Row gutter={[16, 16]}>
        {Object.keys(choiceTypes).map((type) => (
          <Col key={type} xs={24} lg={12}>
            <ChoiceCard type={type} choice={data.coh_choices[type]} candidates={candidates} canDecide={canDecide} onChoose={chooseForCoh} />
          </Col>
        ))}
      </Row>
    ),
  }

  return (
    <>
      {modalHolder}
      <PageHeader
        title="COH Approval"
        subtitle="Review the nominees the Secretariat endorsed for each award and pick one winner, then make the COH Choice picks."
      />

      <Flex className="page-filters" gap={8} wrap="wrap" style={{ marginBottom: 16 }}>
        <CycleSelect cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
      </Flex>

      {error && <Alert type="error" title={error.message} style={{ marginBottom: 16 }} />}
      {actionError && <Alert type="error" title={actionError} closable onClose={() => setActionError(null)} style={{ marginBottom: 16 }} />}

      {loading && !data ? (
        <Spin />
      ) : !data ? null : (
        <>
          {awardTabs.length === 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              title="No award has been endorsed to you for this cycle yet."
              description={
                <>
                  Each award gets its own tab here, with a Pick as winner button, once the Secretariat endorses its shortlist to you.
                  You will also get a notification.
                  {data.upcoming?.length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingInlineStart: 20 }}>
                      {data.upcoming.map((award) => (
                        <li key={award.category_id}>
                          <strong>{award.award_name}</strong>:{' '}
                          {award.stage === 'ready'
                            ? 'shortlist ready, waiting for the Secretariat to endorse it to you.'
                            : 'still being screened by the Committee.'}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              }
            />
          )}
          {awardTabs.length > 0 && data.upcoming?.length > 0 && (
            <Alert
              type="info"
              style={{ marginBottom: 16 }}
              title={`Not endorsed to you yet: ${data.upcoming.map((award) => award.award_name).join(', ')}.`}
            />
          )}
          <Tabs key={cycleId} items={[...awardTabs, choiceTab]} />
        </>
      )}

      <NominationDetails nominationId={viewingId} onClose={() => setViewingId(null)} />
    </>
  )
}
