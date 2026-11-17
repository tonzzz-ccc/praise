import { useCallback, useState } from 'react'
import { Alert, Button, Checkbox, Drawer, Flex, Form, Input, Modal, Popconfirm, Select, Spin, Table, Typography } from 'antd'
import { useResponsiveDrawerSize } from '../hooks/useResponsiveDrawerSize'
import { NominationSummary } from './NominationDetails'
import { useAccess } from '../hooks/useAccess'
import { useApi } from '../hooks/useApi'
import {
  disqualifyNomination,
  documentUrl,
  getNomination,
  reviewDocument,
  validateNomination,
} from '../services/api'
import { disqualificationReasonLabels, documentTypeOptions, getStatus, nominationCriteria } from '../utils/nominations'

const reasonOptions = Object.entries(disqualificationReasonLabels).map(([value, label]) => ({ value, label }))

function criterionLabel(key) {
  return nominationCriteria.find((criterion) => criterion.key === key)?.label ?? 'Other'
}

// Each employee can receive only one award. When the nominee also has live nominations for other
// awards this cycle, the Secretariat decides which to keep and disqualifies the rest. Same-award
// duplicates close automatically once one is validated.
function OtherNominationsAlert({ nominations }) {
  if (nominations.length === 0) return null
  const otherAwards = nominations.filter((item) => !item.is_same_award)
  const sameAward = nominations.filter((item) => item.is_same_award)
  const describe = (item) => `${item.award_name} (No. ${item.id}, ${getStatus(item.status)?.label ?? item.status})`

  return (
    <Alert
      type={otherAwards.length > 0 ? 'warning' : 'info'}
      showIcon
      title={
        otherAwards.length > 0
          ? 'This nominee is also nominated for another award this cycle'
          : 'This nominee has another nomination for the same award'
      }
      description={
        <Flex vertical gap={4}>
          {otherAwards.length > 0 && (
            <span>
              Also nominated for: {otherAwards.map(describe).join('; ')}. Each employee can receive only one award, so keep
              one and disqualify the other.
            </span>
          )}
          {sameAward.length > 0 && (
            <span>
              Same award: {sameAward.map((item) => `No. ${item.id} (${getStatus(item.status)?.label ?? item.status})`).join(', ')}.
              These close automatically when one is validated.
            </span>
          )}
        </Flex>
      }
    />
  )
}

function DisqualifyModal({ open, onCancel, onConfirm }) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  async function submit(values) {
    setSaving(true)
    await onConfirm(values)
    setSaving(false)
  }

  return (
    <Modal
      open={open}
      title="Disqualify this nomination?"
      okText="Disqualify"
      okButtonProps={{ danger: true, loading: saving }}
      onOk={() => form.submit()}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Typography.Paragraph>This ends the nomination. It cannot be undone from this screen.</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Select a reason.' }]}>
          <Select placeholder="Select a reason" options={reasonOptions} />
        </Form.Item>
        <Form.Item name="remarks" label="Remarks (optional)">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

function Review({ id, onDecided }) {
  const { can } = useAccess()
  const load = useCallback(() => getNomination(id), [id])
  const { data: nomination, error: loadError, reload } = useApi(load)
  const [actionError, setActionError] = useState(null)
  const [isDisqualifying, setIsDisqualifying] = useState(false)
  const [isValidating, setIsValidating] = useState(false)

  if (loadError && !nomination) return <Alert type="error" title={loadError.message} />
  if (!nomination) return <Spin />

  const isAwaitingReview = nomination.status === 'submitted'
  const canReview = isAwaitingReview && can('validation.review') && !nomination.is_own_nomination
  const isMissingDocuments = nomination.missing_documents.length > 0
  const allVerified = nomination.documents.every((document) => document.is_verified)
  const canValidate = !isMissingDocuments && allVerified

  async function updateDocument(documentId, changes) {
    setActionError(null)
    try {
      await reviewDocument(id, documentId, changes)
    } catch (error) {
      setActionError(error.message)
    }
    reload()
  }

  async function validate() {
    setActionError(null)
    setIsValidating(true)
    try {
      await validateNomination(id)
      onDecided()
    } catch (error) {
      setActionError(error.message)
      setIsValidating(false)
    }
  }

  async function disqualify(values) {
    setActionError(null)
    try {
      await disqualifyNomination(id, values)
      onDecided()
    } catch (error) {
      setActionError(error.message)
      setIsDisqualifying(false)
    }
  }

  const columns = [
    {
      title: 'Document',
      key: 'document',
      render: (_, document) => (
        <>
          <a href={documentUrl(document.id)}>{document.file_name}</a>
          <br />
          <Typography.Text type="secondary">{criterionLabel(document.criterion)}</Typography.Text>
        </>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'doc_type',
      width: 190,
      render: (docType, document) => (
        <Select
          aria-label={`Type of ${document.file_name}`}
          style={{ width: '100%' }}
          value={docType}
          disabled={!canReview}
          options={documentTypeOptions}
          onChange={(value) => updateDocument(document.id, { doc_type: value })}
        />
      ),
    },
    {
      title: 'Verified',
      dataIndex: 'is_verified',
      width: 80,
      align: 'center',
      render: (isVerified, document) => (
        <Checkbox
          aria-label={`${document.file_name} verified`}
          checked={Boolean(isVerified)}
          disabled={!canReview}
          onChange={(event) => updateDocument(document.id, { is_verified: event.target.checked })}
        />
      ),
    },
  ]

  return (
    <Flex vertical gap={24}>
      {isAwaitingReview && nomination.is_own_nomination && (
        <Alert type="warning" title="You are part of this nomination, so another Secretariat member must review it." />
      )}

      <OtherNominationsAlert nominations={nomination.other_nominations ?? []} />

      <NominationSummary nomination={nomination} showDocuments={false} />

      <div>
        <Typography.Title level={5}>Document checklist</Typography.Title>
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={nomination.documents}
          pagination={false}
          scroll={{ x: 520 }}
        />
      </div>

      {actionError && <Alert type="error" title={actionError} />}

      {canReview && (
        <Flex vertical gap={8}>
          {isMissingDocuments && (
            <Typography.Text type="secondary">
              Required documents not yet in the checklist: {nomination.missing_documents.join(', ')}. Set each document's type, or disqualify if one was not submitted.
            </Typography.Text>
          )}
          {!allVerified && (
            <Typography.Text type="secondary">Verify every document to validate this nomination.</Typography.Text>
          )}
          <Flex gap={8} justify="flex-end" wrap="wrap">
            <Button danger onClick={() => setIsDisqualifying(true)}>
              Disqualify
            </Button>
            <Popconfirm
              title="Validate this nomination?"
              description="It moves on to Committee screening."
              okText="Validate"
              onConfirm={validate}
              disabled={!canValidate}
            >
              <Button type="primary" disabled={!canValidate} loading={isValidating}>
                Validate
              </Button>
            </Popconfirm>
          </Flex>
        </Flex>
      )}

      <DisqualifyModal open={isDisqualifying} onCancel={() => setIsDisqualifying(false)} onConfirm={disqualify} />
    </Flex>
  )
}

export default function ValidationDrawer({ nominationId, onClose, onDecided }) {
  const drawerSize = useResponsiveDrawerSize()
  return (
    <Drawer
      open={Boolean(nominationId)}
      onClose={onClose}
      size={drawerSize}
      title={nominationId ? `Review Nomination No. ${nominationId}` : ''}
    >
      {nominationId && <Review key={nominationId} id={nominationId} onDecided={onDecided} />}
    </Drawer>
  )
}
