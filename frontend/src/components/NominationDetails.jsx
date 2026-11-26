import { useCallback } from 'react'
import { Alert, Descriptions, Drawer, Flex, Spin, Tag, Typography } from 'antd'
import { useResponsiveDrawerSize } from '../hooks/useResponsiveDrawerSize'
import { useApi } from '../hooks/useApi'
import { documentUrl, getNomination } from '../services/api'
import { formatDate } from '../utils/format'
import {
  disqualificationReasonLabels,
  getStatus,
  nominationCriteria,
  nominatorTypeOptions,
} from '../utils/nominations'

const checkStatusLabels = { passed: 'Met', failed: 'Not met', unverified: 'Needs checking' }

function NotProvided() {
  return <Typography.Text type="secondary">Not provided</Typography.Text>
}

// Groups documents under their criterion; any not tied to a criterion go under "Other documents".
function documentGroups(documents) {
  const groups = nominationCriteria.map((criterion) => ({
    key: criterion.key,
    label: criterion.label,
    documents: documents.filter((document) => document.criterion === criterion.key),
  }))
  const other = documents.filter(
    (document) => !nominationCriteria.some((criterion) => criterion.key === document.criterion),
  )
  if (other.length > 0) groups.push({ key: 'other', label: 'Other documents', documents: other })
  return groups.filter((group) => group.documents.length > 0)
}

function eligibilityTitle(snapshot) {
  if (!snapshot.is_eligible) return 'Not eligible'
  return snapshot.needs_review ? 'Eligible, needs checking' : 'Eligible'
}

function eligibilityItems(snapshot) {
  if (snapshot.checks) {
    return snapshot.checks.map((check) => ({
      key: check.key,
      label: check.label,
      children: checkStatusLabels[check.status],
    }))
  }
  // Group nominations saved before members became eligible as a whole stored only member counts.
  return [
    { key: 'members', label: 'Qualified members', children: `${snapshot.qualified_member_count} of ${snapshot.member_count}` },
  ]
}

// showDocuments is off when the page shows documents its own way, like the validation checklist.
export function NominationSummary({ nomination, showDocuments = true }) {
  const status = getStatus(nomination.status)
  const nominatorType = nominatorTypeOptions.find((type) => type.value === nomination.nominator_type)
  const snapshot = nomination.eligibility_snapshot

  return (
    <Flex vertical gap={24}>
      {nomination.disqualification_reason && (
        <Alert
          type="error"
          title={`Disqualified: ${disqualificationReasonLabels[nomination.disqualification_reason]}`}
        />
      )}

      <Descriptions
        size="small"
        column={1}
        bordered
        items={[
          { key: 'status', label: 'Status', children: <Tag color={status.color}>{status.label}</Tag> },
          { key: 'award', label: 'Award', children: nomination.award_name },
          { key: 'nominee', label: 'Nominee', children: nomination.nominee_name },
          { key: 'cycle', label: 'Cycle', children: nomination.cycle_name },
          { key: 'nominator', label: 'Nominator', children: nomination.nominator_display_name ?? <NotProvided /> },
          { key: 'nominator_type', label: 'Nominated by', children: nominatorType?.label ?? <NotProvided /> },
          { key: 'submitted', label: 'Submitted', children: nomination.submitted_at ? formatDate(nomination.submitted_at) : 'Not yet submitted' },
          ...(nomination.validated_at
            ? [{ key: 'reviewed', label: 'Reviewed by', children: `${nomination.validated_by_name} on ${formatDate(nomination.validated_at)}` }]
            : []),
          ...(nomination.remarks ? [{ key: 'remarks', label: 'Remarks', children: nomination.remarks }] : []),
        ]}
      />

      <div>
        <Typography.Title level={5}>Criteria</Typography.Title>
        <Descriptions
          size="small"
          column={1}
          bordered
          layout="vertical"
          items={nominationCriteria.flatMap((criterion) => {
            const response = nomination.form_responses[criterion.key]
            return [
              { key: `${criterion.key}-justification`, label: `${criterion.label} - Justifications`, children: response?.justification || <NotProvided /> },
              // Evidence text is no longer collected; still shown for older nominations that have it.
              ...(response?.evidence
                ? [{ key: `${criterion.key}-evidence`, label: `${criterion.label} - Evidences`, children: response.evidence }]
                : []),
            ]
          })}
        />
      </div>

      <div>
        <Typography.Title level={5}>
          Eligibility on {formatDate(snapshot.checked_at)}: {eligibilityTitle(snapshot)}
        </Typography.Title>
        <Descriptions size="small" column={1} bordered items={eligibilityItems(snapshot)} />
      </div>

      {nomination.members.length > 0 && (
        <div>
          <Typography.Title level={5}>Members</Typography.Title>
          <ul>
            {nomination.members.map((member) => (
              <li key={member.id}>
                {member.name}
                {/* Older group nominations could exclude members; current ones include everyone. */}
                {member.is_excluded ? ' (excluded from the grant)' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showDocuments && (
        <div>
          <Typography.Title level={5}>Supporting documents</Typography.Title>
          {nomination.documents.length > 0 ? (
            documentGroups(nomination.documents).map((group) => (
              <div key={group.key}>
                <Typography.Text strong>{group.label}</Typography.Text>
                <ul>
                  {group.documents.map((document) => (
                    <li key={document.id}>
                      <a href={documentUrl(document.id)}>{document.file_name}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <NotProvided />
          )}
        </div>
      )}
    </Flex>
  )
}

function Details({ id }) {
  const load = useCallback(() => getNomination(id), [id])
  const { data: nomination, error, loading } = useApi(load)

  if (error) return <Alert type="error" title={error.message} />
  if (loading || !nomination) return <Spin />

  return <NominationSummary nomination={nomination} />
}

export default function NominationDetails({ nominationId, onClose }) {
  const drawerSize = useResponsiveDrawerSize()
  return (
    <Drawer
      open={Boolean(nominationId)}
      onClose={onClose}
      size={drawerSize}
      title={nominationId ? `Nomination No. ${nominationId}` : ''}
    >
      {nominationId && <Details key={nominationId} id={nominationId} />}
    </Drawer>
  )
}
