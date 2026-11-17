import { useCallback } from 'react'
import { Alert, Button, Card, Empty, Flex, Table, Tooltip, Typography, theme } from 'antd'
import { DownloadOutlined, ExclamationCircleFilled, PrinterOutlined } from '@ant-design/icons'
import { CycleSelect } from '../components/AwardingShared'
import PageHeader from '../components/PageHeader'
import { useApi } from '../hooks/useApi'
import { brandingDefaults, useBranding } from '../hooks/useBranding'
import { useCycleChoice } from '../hooks/useCycleChoice'
import { getReport } from '../services/api'
import { formatDate } from '../utils/awarding'
import { formatMoney } from '../utils/format'
import { downloadWorkbook } from '../utils/xlsx'
import './Reports.css'

const { Text, Title } = Typography

const count = (value) => (value === null || value === undefined ? '—' : value)

// One headline number. Values wear text colors; the label says what it counts.
function StatTile({ label, value, detail }) {
  return (
    <Card size="small" className="report-stat">
      <Text type="secondary" className="report-stat-label">
        {label}
      </Text>
      <div className="report-stat-value">{value}</div>
      {detail && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {detail}
        </Text>
      )}
    </Card>
  )
}

// Grants released and still to release, as shares of the cycle budget. One hue at two strengths,
// with a legend and a tooltip on each segment; going over budget adds an icon and words.
function BudgetMeter({ budget }) {
  const { token } = theme.useToken()
  const { allocation, released, pending } = budget
  if (allocation === null) {
    return (
      <Alert
        type="info"
        showIcon
        title="No budget is set for this cycle."
        description="Set the cycle's PRAISE budget in System Settings > General to compare grants against it. Grants are still totaled below."
      />
    )
  }
  const scale = Math.max(allocation, released + pending, 1)
  const releasedShare = (released / scale) * 100
  const pendingShare = (pending / scale) * 100
  const overBy = released + pending - allocation
  const segments = [
    { key: 'released', label: 'Released', amount: released, share: releasedShare, color: token.colorPrimary },
    { key: 'pending', label: 'Awarded, not yet released', amount: pending, share: pendingShare, color: token.colorPrimaryBorder },
  ]

  return (
    <Flex vertical gap={10}>
      <div
        className="budget-meter"
        role="img"
        aria-label={`${formatMoney(released)} released and ${formatMoney(pending)} not yet released of a ${formatMoney(allocation)} budget`}
      >
        <div className="budget-meter-track" style={{ background: token.colorFillSecondary }}>
          {segments
            .filter((segment) => segment.share > 0)
            .map((segment) => (
              <Tooltip
                key={segment.key}
                title={`${segment.label}: ${formatMoney(segment.amount)} (${((segment.amount / allocation) * 100).toFixed(1)}% of budget)`}
              >
                <div className="budget-meter-segment" style={{ width: `${segment.share}%`, background: segment.color }} />
              </Tooltip>
            ))}
        </div>
      </div>
      <Flex gap={20} wrap="wrap" className="budget-legend">
        {segments.map((segment) => (
          <Flex key={segment.key} align="center" gap={6}>
            <span className="budget-swatch" style={{ background: segment.color }} aria-hidden />
            <Text style={{ fontSize: 13 }}>
              {segment.label}: <Text strong>{formatMoney(segment.amount)}</Text>
            </Text>
          </Flex>
        ))}
        <Flex align="center" gap={6}>
          <span className="budget-swatch" style={{ background: token.colorFillSecondary }} aria-hidden />
          <Text style={{ fontSize: 13 }}>
            Budget: <Text strong>{formatMoney(allocation)}</Text>
          </Text>
        </Flex>
      </Flex>
      {overBy > 0 ? (
        <Text type="danger" style={{ fontSize: 13 }}>
          <ExclamationCircleFilled /> Over budget by {formatMoney(overBy)} once every grant is released.
        </Text>
      ) : (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {formatMoney(allocation - released)} of the budget is left now, and {formatMoney(allocation - released - pending)} once every
          awarded grant is released.
        </Text>
      )}
    </Flex>
  )
}

const awardColumns = [
  { title: 'Award', dataIndex: 'award_name' },
  { title: 'Nominations', dataIndex: 'submitted', align: 'right', render: count },
  { title: 'Disqualified', dataIndex: 'disqualified', align: 'right', render: count },
  { title: 'Passed validation', dataIndex: 'validated', align: 'right', render: count },
  { title: 'Shortlisted', dataIndex: 'shortlisted', align: 'right', render: count },
  { title: 'Awarded', dataIndex: 'awarded', align: 'right', render: count },
  {
    title: 'Awardees',
    dataIndex: 'awardees',
    render: (names) => (names.length ? names.join(', ') : <Text type="secondary">—</Text>),
  },
  { title: 'Grants released', dataIndex: 'grants_released', align: 'right', render: (amount) => formatMoney(amount) },
  { title: 'Not yet released', dataIndex: 'grants_pending', align: 'right', render: (amount) => formatMoney(amount) },
]

const awardeeColumns = [
  { title: 'Award', dataIndex: 'award_name' },
  { title: 'Awardee', dataIndex: 'awardee_name' },
  {
    title: 'Unit',
    key: 'unit',
    render: (_, awardee) => (awardee.nominee_type === 'section' ? 'Section or unit' : (awardee.unit_name ?? '—')),
  },
  { title: 'Conferred', dataIndex: 'conferment_date', render: (date) => formatDate(date) },
  { title: 'Plaque or certificate', key: 'plaque', render: (_, awardee) => itemState(awardee, (date) => `released ${formatDate(date)}`) },
  {
    title: 'Grant',
    key: 'grant',
    align: 'right',
    render: (_, awardee) =>
      !awardee.has_grant
        ? 'None'
        : awardee.grant_released_on
          ? `${formatMoney(awardee.grant_amount)}, ${formatDate(awardee.grant_released_on)}`
          : 'Not yet released',
  },
]

// The plaque (award winners) or certificate (COH Choice) and whether it was released.
function itemState(awardee, released) {
  const item = awardee.has_certificate ? 'Certificate' : awardee.has_plaque ? 'Plaque' : null
  if (!item) return 'None'
  const date = awardee.has_certificate ? awardee.certificate_released_on : awardee.plaque_released_on
  return `${item} ${date ? released(date) : 'not yet released'}`
}

// "2 of 5 plaques, 1 of 2 certificates released", leaving out an item no awardee gets.
function releasedDetail(totals) {
  const parts = [
    totals.plaques_due > 0 && `${totals.plaques_released} of ${totals.plaques_due} plaques`,
    totals.certificates_due > 0 && `${totals.certificates_released} of ${totals.certificates_due} certificates`,
  ].filter(Boolean)
  return parts.length > 0 ? `${parts.join(', ')} released` : null
}

// A peso cell in a column of counts.
const peso = (amount) => (amount === null || amount === undefined ? null : { value: amount, format: 'money' })

function exportExcel(report, centerName) {
  const { cycle, totals, budget, awards, awardees } = report
  const generated = new Date().toLocaleString('en-PH')
  const summaryRows = [
    [centerName, null],
    [`PRAISE report, ${cycle.name}`, null],
    [`Generated ${generated}`, null],
    [null, null],
    ['Nominations submitted', totals.submitted],
    ['Disqualified', totals.disqualified],
    ['Closed as duplicates', totals.closed],
    ['Passed validation', totals.validated],
    ['Shortlisted', totals.shortlisted],
    ['Awardees', totals.awarded],
    ['Plaques released', `${totals.plaques_released} of ${totals.plaques_due}`],
    ['Certificates released', `${totals.certificates_released} of ${totals.certificates_due}`],
    [null, null],
    ['Budget (PHP)', peso(budget.allocation) ?? 'Not set'],
    ['Grants released (PHP)', peso(budget.released)],
    ['Awarded, not yet released (PHP)', peso(budget.pending)],
    ['Budget left now (PHP)', peso(budget.remaining) ?? '—'],
    ['Budget left once all are released (PHP)', peso(budget.remaining_after_pending) ?? '—'],
  ]
  downloadWorkbook(`PRAISE report ${cycle.name}.xlsx`, [
    {
      name: 'Summary',
      columns: [
        { header: 'Item', width: 36 },
        { header: 'Value', width: 22, format: 'integer' },
      ],
      rows: summaryRows,
      boldRows: [1, 2],
    },
    {
      name: 'Per award',
      columns: [
        { header: 'Award', width: 40 },
        { header: 'Nominations', width: 13, format: 'integer' },
        { header: 'Disqualified', width: 13, format: 'integer' },
        { header: 'Passed validation', width: 17, format: 'integer' },
        { header: 'Shortlisted', width: 12, format: 'integer' },
        { header: 'Awarded', width: 10, format: 'integer' },
        { header: 'Awardees', width: 40 },
        { header: 'Grants released (PHP)', width: 22, format: 'money' },
        { header: 'Not yet released (PHP)', width: 22, format: 'money' },
      ],
      rows: [
        ...awards.map((award) => [
          award.award_name,
          award.submitted,
          award.disqualified,
          award.validated,
          award.shortlisted,
          award.awarded,
          award.awardees.join(', '),
          award.grants_released,
          award.grants_pending,
        ]),
        [
          'Total',
          totals.submitted,
          totals.disqualified,
          totals.validated,
          totals.shortlisted,
          totals.awarded,
          null,
          totals.grants_released,
          totals.grants_pending,
        ],
      ],
      boldRows: [awards.length + 1],
    },
    {
      name: 'Awardees',
      columns: [
        { header: 'Award', width: 36 },
        { header: 'Awardee', width: 36 },
        { header: 'Position', width: 28 },
        { header: 'Unit', width: 32 },
        { header: 'Conferred', width: 14 },
        { header: 'Plaque or certificate', width: 30 },
        { header: 'Grant (PHP)', width: 16, format: 'money' },
        { header: 'Grant released', width: 16 },
      ],
      rows: awardees.map((awardee) => [
        awardee.award_name,
        awardee.awardee_name,
        awardee.position_title,
        awardee.nominee_type === 'section' ? 'Section or unit' : awardee.unit_name,
        awardee.conferment_date?.slice(0, 10) ?? null,
        itemState(awardee, (date) => `released ${date.slice(0, 10)}`),
        awardee.grant_released_on ? awardee.grant_amount : null,
        !awardee.has_grant ? 'None' : (awardee.grant_released_on?.slice(0, 10) ?? 'Not yet'),
      ]),
    },
  ])
}

export default function Reports() {
  const { cycles, cycleId, setCycleId } = useCycleChoice()
  const branding = useBranding()
  const centerName = branding?.texts?.center_name || brandingDefaults.center_name
  const load = useCallback(() => (cycleId ? getReport(cycleId) : Promise.resolve(null)), [cycleId])
  const { data: report, error, loading } = useApi(load)

  const totalsRow = report && (
    <Table.Summary.Row className="report-total-row">
      <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
      {['submitted', 'disqualified', 'validated', 'shortlisted', 'awarded'].map((key, index) => (
        <Table.Summary.Cell key={key} index={index + 1} align="right">
          {report.totals[key]}
        </Table.Summary.Cell>
      ))}
      <Table.Summary.Cell index={6} />
      <Table.Summary.Cell index={7} align="right">
        {formatMoney(report.totals.grants_released)}
      </Table.Summary.Cell>
      <Table.Summary.Cell index={8} align="right">
        {formatMoney(report.totals.grants_pending)}
      </Table.Summary.Cell>
    </Table.Summary.Row>
  )

  return (
    <div className="report-page">
      <PageHeader
        title="Reports"
        subtitle="Nominations and results per award, and grants released against the cycle budget."
        extra={
          <Flex gap={8} wrap="wrap" className="no-print">
            <CycleSelect cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
            <Button icon={<DownloadOutlined />} disabled={!report} onClick={() => exportExcel(report, centerName)}>
              Download Excel
            </Button>
            <Button icon={<PrinterOutlined />} disabled={!report} onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
          </Flex>
        }
      />

      {error && <Alert type="error" title={error.message} style={{ marginBottom: 16 }} />}
      {loading && !report && <Card loading />}
      {!loading && !report && !error && <Empty description="Select a cycle." />}

      {report && (
        <Flex vertical gap={20}>
          {/* Shown only on paper: who issued the report, for which cycle, and when. */}
          <div className="print-only report-print-heading">
            <Text>{centerName}</Text>
            <Title level={3} style={{ margin: '4px 0' }}>
              PRAISE Report, {report.cycle.name}
            </Title>
            <Text type="secondary">
              Selection period {formatDate(report.cycle.period_start)} to {formatDate(report.cycle.period_end)} · Generated{' '}
              {new Date().toLocaleString('en-PH')}
            </Text>
          </div>

          <div className="report-stats">
            <StatTile label="Nominations" value={report.totals.submitted} detail={`${report.totals.closed} closed as duplicates`} />
            <StatTile label="Passed validation" value={report.totals.validated} detail={`${report.totals.disqualified} disqualified`} />
            <StatTile label="Shortlisted" value={report.totals.shortlisted} />
            <StatTile
              label="Awardees"
              value={report.totals.awarded}
              detail={releasedDetail(report.totals)}
            />
            <StatTile
              label="Grants released"
              value={formatMoney(report.budget.released)}
              detail={report.budget.allocation === null ? 'No budget set' : `of ${formatMoney(report.budget.allocation)} budget`}
            />
          </div>

          <Card size="small" title="Budget used vs. allocation" className="report-card report-keep">
            <BudgetMeter budget={report.budget} />
          </Card>

          <Card size="small" title="Per award" className="report-card" styles={{ body: { padding: 0 } }}>
            <Table
              rowKey="key"
              size="small"
              columns={awardColumns}
              dataSource={report.awards}
              pagination={false}
              scroll={{ x: 1100 }}
              summary={() => <Table.Summary>{totalsRow}</Table.Summary>}
            />
          </Card>

          <Card size="small" title={`Awardees (${report.awardees.length})`} className="report-card" styles={{ body: { padding: 0 } }}>
            <Table
              rowKey="key"
              size="small"
              columns={awardeeColumns}
              dataSource={report.awardees}
              pagination={false}
              scroll={{ x: 900 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No awardees in this cycle yet." /> }}
            />
          </Card>
        </Flex>
      )}
    </div>
  )
}
