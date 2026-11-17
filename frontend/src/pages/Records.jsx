import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Empty, Flex, Form, Input, InputNumber, Modal, Segmented, Table, Tag, Tooltip, Typography } from 'antd'
import { CheckCircleFilled, ClockCircleOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { CycleSelect, StatusTag } from '../components/AwardingShared'
import PageHeader from '../components/PageHeader'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import { useCycleChoice } from '../hooks/useCycleChoice'
import { getRecords, recordRelease } from '../services/api'
import { formatDate } from '../utils/awarding'
import { formatMoney } from '../utils/format'
import { disqualificationReasonLabels, nominationStatuses } from '../utils/nominations'

const { Text } = Typography

// Released (with the date) or still to release. Never color alone: each state has an icon and words.
function ReleaseState({ applies, date, children }) {
  if (!applies) return <Text type="secondary">None for this award</Text>
  if (date) {
    return (
      <Flex vertical gap={2}>
        <Tag color="success" icon={<CheckCircleFilled />} style={{ width: 'fit-content', marginInlineEnd: 0 }}>
          Released {formatDate(date)}
        </Tag>
        {children}
      </Flex>
    )
  }
  return (
    <Flex vertical gap={2}>
      <Tag icon={<ClockCircleOutlined />} style={{ width: 'fit-content', marginInlineEnd: 0 }}>
        Not yet released
      </Tag>
      {children}
    </Flex>
  )
}

function ReleaseModal({ awardee, onCancel, onSaved }) {
  const [form] = Form.useForm()
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const notFuture = (current) => current && current.isAfter(dayjs(), 'day')

  async function save(values) {
    setSaving(true)
    setError(null)
    try {
      const data = await recordRelease({
        kind: awardee.kind,
        id: awardee.id,
        plaque_released_on: values.plaque_released_on ? values.plaque_released_on.format('YYYY-MM-DD') : null,
        certificate_released_on: values.certificate_released_on ? values.certificate_released_on.format('YYYY-MM-DD') : null,
        grant_amount: values.grant_amount ?? null,
        grant_released_on: values.grant_released_on ? values.grant_released_on.format('YYYY-MM-DD') : null,
      })
      onSaved(data)
    } catch (saveError) {
      setError(saveError.message)
    }
    setSaving(false)
  }

  return (
    <Modal
      open={Boolean(awardee)}
      destroyOnHidden
      title={`Releases for ${awardee?.awardee_name ?? ''}`}
      okText="Save"
      okButtonProps={{ loading: saving }}
      onOk={() => form.submit()}
      onCancel={() => {
        setError(null)
        onCancel()
      }}
    >
      {awardee && (
        <>
          <Typography.Paragraph type="secondary">
            {awardee.award_name}. Leave a date empty if it has not been released. The awardee is notified when a release is first recorded.
          </Typography.Paragraph>
          {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
          <Form
            form={form}
            layout="vertical"
            preserve={false}
            initialValues={{
              plaque_released_on: awardee.plaque_released_on ? dayjs(awardee.plaque_released_on) : null,
              certificate_released_on: awardee.certificate_released_on ? dayjs(awardee.certificate_released_on) : null,
              grant_amount: awardee.grant_amount ?? awardee.max_grant ?? null,
              grant_released_on: awardee.grant_released_on ? dayjs(awardee.grant_released_on) : null,
            }}
            onFinish={save}
            onValuesChange={() => setError(null)}
          >
            {awardee.has_certificate ? (
              <Form.Item name="certificate_released_on" label="Certificate released on">
                <DatePicker style={{ width: '100%' }} disabledDate={notFuture} />
              </Form.Item>
            ) : (
              <Form.Item name="plaque_released_on" label="Plaque released on" extra={awardee.has_plaque ? null : 'This award has no plaque.'}>
                <DatePicker style={{ width: '100%' }} disabled={!awardee.has_plaque} disabledDate={notFuture} />
              </Form.Item>
            )}
            {awardee.has_certificate ? (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                The COH Choice Award comes with a certificate only, no plaque or cash grant.
              </Typography.Paragraph>
            ) : (
              <>
              <Form.Item
                name="grant_amount"
                label="Cash grant"
                extra={
                  !awardee.has_grant
                    ? 'This award has no cash grant.'
                    : awardee.max_grant !== null
                      ? `Up to ${formatMoney(awardee.max_grant)} for this award.`
                      : 'Enter the amount given, if any.'
                }
              >
                <InputNumber
                  style={{ width: '100%' }}
                  disabled={!awardee.has_grant}
                  min={0.01}
                  max={awardee.max_grant ?? 99999999.99}
                  precision={2}
                  prefix="₱"
                  formatter={(value) => (value === '' || value === undefined ? '' : `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','))}
                  parser={(value) => value?.replace(/,/g, '') ?? ''}
                />
              </Form.Item>
              <Form.Item
                name="grant_released_on"
                label="Grant released on"
                dependencies={['grant_amount']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('grant_amount')) return Promise.resolve()
                      return Promise.reject(new Error('Enter the grant amount released.'))
                    },
                  }),
                ]}
              >
                <DatePicker style={{ width: '100%' }} disabled={!awardee.has_grant} disabledDate={notFuture} />
              </Form.Item>
              </>
            )}
          </Form>
        </>
      )}
    </Modal>
  )
}

function AwardeesTable({ awardees, canManage, onEdit }) {
  const columns = [
    { title: 'Award', dataIndex: 'award_name', width: 220 },
    {
      title: 'Awardee',
      key: 'awardee',
      render: (_, awardee) => (
        <Flex vertical>
          <Text strong>{awardee.awardee_name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {awardee.nominee_type === 'section'
              ? 'Section or unit'
              : [awardee.position_title, awardee.unit_name].filter(Boolean).join(' · ')}
          </Text>
        </Flex>
      ),
    },
    {
      title: 'Conferred',
      dataIndex: 'conferment_date',
      width: 150,
      render: (date) => (date ? formatDate(date) : <Text type="secondary">Not yet</Text>),
    },
    {
      title: 'Plaque or certificate',
      key: 'plaque',
      width: 190,
      render: (_, awardee) =>
        awardee.has_certificate ? (
          <ReleaseState applies date={awardee.certificate_released_on}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Certificate
            </Text>
          </ReleaseState>
        ) : (
          <ReleaseState applies={awardee.has_plaque} date={awardee.plaque_released_on}>
            {awardee.has_plaque && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Plaque
              </Text>
            )}
          </ReleaseState>
        ),
    },
    {
      title: 'Cash grant',
      key: 'grant',
      width: 210,
      render: (_, awardee) => (
        <ReleaseState applies={awardee.has_grant} date={awardee.grant_released_on}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {awardee.grant_released_on
              ? formatMoney(awardee.grant_amount)
              : awardee.max_grant !== null
                ? `Up to ${formatMoney(awardee.max_grant)}`
                : awardee.grant_amount
                  ? formatMoney(awardee.grant_amount)
                  : null}
          </Text>
        </ReleaseState>
      ),
    },
    ...(canManage
      ? [
          {
            title: 'Actions',
            key: 'actions',
            width: 130,
            render: (_, awardee) => (
              <Button size="small" onClick={() => onEdit(awardee)}>
                Record release
              </Button>
            ),
          },
        ]
      : []),
  ]
  return (
    <Table
      rowKey="key"
      columns={columns}
      dataSource={awardees}
      pagination={false}
      scroll={{ x: 900 }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No awardees in this cycle yet." /> }}
    />
  )
}

function NominationsTable({ nominations }) {
  const [search, setSearch] = useState('')
  const awards = [...new Set(nominations.map((nomination) => nomination.award_name))]
  const statuses = nominationStatuses.filter((status) => nominations.some((nomination) => nomination.status === status.value))
  const query = search.trim().toLowerCase()
  const shown = query
    ? nominations.filter((nomination) =>
        [nomination.nominee_name, nomination.nominator_name, String(nomination.id)].some((value) => value?.toLowerCase().includes(query)),
      )
    : nominations

  const columns = [
    { title: 'No.', dataIndex: 'id', width: 70, sorter: (a, b) => a.id - b.id, defaultSortOrder: 'ascend' },
    {
      title: 'Award',
      dataIndex: 'award_name',
      filters: awards.map((award) => ({ text: award, value: award })),
      onFilter: (value, nomination) => nomination.award_name === value,
    },
    { title: 'Nominee', dataIndex: 'nominee_name' },
    { title: 'Nominator', dataIndex: 'nominator_name', render: (name) => name ?? '—' },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 150,
      filters: statuses.map((status) => ({ text: status.label, value: status.value })),
      onFilter: (value, nomination) => nomination.status === value,
      render: (status) => <StatusTag status={status} />,
    },
    { title: 'Submitted', dataIndex: 'submitted_at', width: 180, render: (date) => formatDate(date) },
    {
      title: 'Validation',
      key: 'validation',
      render: (_, nomination) => {
        if (!nomination.validated_at) return <Text type="secondary">—</Text>
        const reason = nomination.disqualification_reason && disqualificationReasonLabels[nomination.disqualification_reason]
        return (
          <Flex vertical>
            <Text style={{ fontSize: 13 }}>
              {formatDate(nomination.validated_at)}
              {nomination.validated_by_name ? ` by ${nomination.validated_by_name}` : ''}
            </Text>
            {reason && (
              <Tooltip title={nomination.remarks}>
                <Text type="danger" style={{ fontSize: 12 }}>
                  {reason}
                </Text>
              </Tooltip>
            )}
          </Flex>
        )
      },
    },
  ]

  return (
    <Flex vertical gap={12}>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Search by nominee, nominator or number"
        style={{ maxWidth: 360 }}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={shown}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 1000 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No submitted nominations in this cycle." /> }}
      />
    </Flex>
  )
}

export default function Records() {
  const { can } = useAccess()
  const { cycles, cycleId, setCycleId } = useCycleChoice()
  const [view, setView] = useState('awardees')
  const [editing, setEditing] = useState(null)
  const [saved, setSaved] = useState(null)
  const load = useCallback(() => (cycleId ? getRecords(cycleId) : Promise.resolve(null)), [cycleId])
  const { data: loaded, error, loading } = useApi(load)
  // A save returns the refreshed records, so the page updates without reloading.
  const data = saved?.cycle?.id === cycleId ? saved : loaded

  const counts = useMemo(
    () => ({
      awardees: data?.awardees.length ?? 0,
      nominations: data?.nominations.length ?? 0,
    }),
    [data],
  )

  return (
    <>
      <PageHeader
        title="Records"
        subtitle="Each cycle's awardees with their plaque, certificate and grant releases, and every nomination submitted."
        extra={
          <CycleSelect
            cycles={cycles}
            cycleId={cycleId}
            onChange={(id) => {
              setSaved(null)
              setCycleId(id)
            }}
          />
        }
      />
      {error && <Alert type="error" title={error.message} style={{ marginBottom: 16 }} />}
      <Segmented
        style={{ marginBottom: 16 }}
        value={view}
        onChange={setView}
        options={[
          { value: 'awardees', label: `Awardees (${counts.awardees})` },
          { value: 'nominations', label: `All nominations (${counts.nominations})` },
        ]}
      />
      {loading && !data ? (
        <Table loading columns={[]} dataSource={[]} />
      ) : !data ? (
        <Empty description="Select a cycle." />
      ) : view === 'awardees' ? (
        <AwardeesTable awardees={data.awardees} canManage={can('records.manage')} onEdit={setEditing} />
      ) : (
        <NominationsTable key={data.cycle.id} nominations={data.nominations} />
      )}
      <ReleaseModal
        awardee={editing}
        onCancel={() => setEditing(null)}
        onSaved={(records) => {
          setSaved(records)
          setEditing(null)
        }}
      />
    </>
  )
}
