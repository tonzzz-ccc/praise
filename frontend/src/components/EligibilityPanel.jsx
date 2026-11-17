import { Alert, Card, Flex, Typography } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled } from '@ant-design/icons'

const statusIcons = {
  passed: <CheckCircleFilled style={{ color: '#52c41a' }} aria-label="Passed" />,
  failed: <CloseCircleFilled style={{ color: '#ff4d4f' }} aria-label="Failed" />,
  unverified: <ExclamationCircleFilled style={{ color: '#faad14' }} aria-label="Needs checking" />,
}

function CheckRow({ status, children }) {
  return (
    <Flex gap={8} align="baseline">
      {statusIcons[status]}
      <span>{children}</span>
    </Flex>
  )
}

function summaryAlert(eligibility) {
  if (!eligibility.is_eligible) {
    return { type: 'error', title: 'Cannot be submitted because a requirement above is not met.' }
  }
  if (eligibility.needs_review) {
    return { type: 'warning', title: 'Can be submitted. The Secretariat must verify the items marked in yellow.' }
  }
  return { type: 'success', title: 'Can be nominated.' }
}

// embedded: shown inside another section (the nomination form), so no card of its own.
export default function EligibilityPanel({ eligibility, embedded = false }) {
  const content = (
    <Flex vertical gap={8}>
      {eligibility.checks?.map((check) => (
        <CheckRow key={check.key} status={check.status}>
          {check.label}
        </CheckRow>
      ))}

      {eligibility.members && eligibility.members.length > 0 && (
        <div>
          <Typography.Text type="secondary">Current members (for reference):</Typography.Text>
          <Flex vertical gap={4} style={{ marginTop: 4 }}>
            {eligibility.members.map((member) => (
              <CheckRow key={member.employee_id} status="passed">
                {member.name}
              </CheckRow>
            ))}
          </Flex>
        </div>
      )}

      <Alert {...summaryAlert(eligibility)} />
    </Flex>
  )
  if (embedded) return content
  return (
    <Card size="small" title="Eligibility check">
      {content}
    </Card>
  )
}
