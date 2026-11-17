import { useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd'
import dayjs from 'dayjs'
import { createCycle, updateCycle } from '../services/api'

const { RangePicker } = DatePicker

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open for nominations' },
  { value: 'screening', label: 'Screening' },
  { value: 'closed', label: 'Closed' },
]

function toInitialValues(cycle) {
  if (!cycle) return { status: 'draft' }
  return {
    name: cycle.name,
    period: [dayjs(cycle.period_start), dayjs(cycle.period_end)],
    nomination: [dayjs(cycle.nomination_start), dayjs(cycle.nomination_end)],
    ceremony: cycle.ceremony_date ? dayjs(cycle.ceremony_date) : null,
    budget: cycle.budget === null || cycle.budget === undefined ? null : Number(cycle.budget),
    status: cycle.status,
  }
}

// Adds a new award cycle (blank, or filled in from prefill), or edits the one passed in. The
// nomination window set here is what the nomination form uses to decide when nominations can be
// submitted. Only one cycle can be open at a time, so opening one asks to close the other first.
export default function CycleModal({ cycle, prefill, onClose, onSaved }) {
  const [form] = Form.useForm()
  const [modal, modalHolder] = Modal.useModal()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const isEditing = Boolean(cycle)

  // closing: names of the open cycles the user agreed to close, or null.
  const save = async (values, closing = null) => {
    setSaving(true)
    setSaveError(null)
    const payload = {
      name: values.name,
      period_start: values.period[0].format('YYYY-MM-DD'),
      period_end: values.period[1].format('YYYY-MM-DD'),
      nomination_start: values.nomination[0].format('YYYY-MM-DD'),
      nomination_end: values.nomination[1].format('YYYY-MM-DD'),
      ceremony_date: values.ceremony ? values.ceremony.format('YYYY-MM-DD') : null,
      budget: values.budget ?? null,
      status: values.status,
      close_open_cycles: Boolean(closing),
    }
    try {
      const saved = isEditing ? await updateCycle(cycle.id, payload) : await createCycle(payload)
      onSaved(saved, !isEditing, closing ?? [])
    } catch (error) {
      setSaving(false)
      if (error.details?.reason === 'cycle_open') {
        const names = error.details.open_cycles.map((other) => other.name).join(' and ')
        modal.confirm({
          title: `Close ${names}?`,
          content: (
            <>
              <p>
                {names} is still open for nominations, and only one cycle can be open at a time. Saving {values.name} as open will close{' '}
                {names}.
              </p>
              <p style={{ marginBottom: 0 }}>
                Closing it also ends its committee members' access. If {names} is still being screened or awarded, cancel and set it to
                Screening first.
              </p>
            </>
          ),
          okText: `Close ${names} and save`,
          okButtonProps: { danger: true },
          cancelText: 'Cancel',
          onOk: () => save(values, error.details.open_cycles.map((other) => other.name)),
        })
      } else if (error.details?.reason === 'duplicate_name') {
        form.setFields([{ name: 'name', errors: [error.message] }])
      } else {
        setSaveError(error.message)
      }
    }
  }

  return (
    <Modal
      open
      title={isEditing ? 'Edit Award Cycle' : prefill ? 'Start Next Award Cycle' : 'Add Award Cycle'}
      width={560}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={saving}>
          Cancel
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={() => form.submit()}>
          Save
        </Button>,
      ]}
    >
      {modalHolder}
      {prefill && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="Filled in from the latest cycle, one year later. Check the dates and budget before saving."
        />
      )}
      <Form
        form={form}
        layout="vertical"
        requiredMark
        initialValues={toInitialValues(cycle ?? prefill)}
        onFinish={(values) => save(values)}
        onValuesChange={() => setSaveError(null)}
      >
        <Form.Item
          name="name"
          label="Cycle name"
          rules={[{ required: true, whitespace: true, message: 'Enter the cycle name.' }]}
        >
          <Input maxLength={50} placeholder="e.g. CY 2026-2027" />
        </Form.Item>

        <Form.Item
          name="period"
          label="Selection period"
          extra="The award year this cycle covers."
          rules={[{ required: true, message: 'Select the start and end of the selection period.' }]}
        >
          <RangePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="nomination"
          label="Nomination window"
          extra="Nominations can be submitted only during this window."
          rules={[{ required: true, message: 'Select the start and end of the nomination window.' }]}
        >
          <RangePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="ceremony"
          label="Awarding ceremony date"
          extra="Optional. Shown on the Dashboard once set."
          dependencies={['nomination']}
          rules={[
            ({ getFieldValue }) => ({
              validator(_, value) {
                const end = getFieldValue('nomination')?.[1]
                if (!value || !end || !value.isBefore(end, 'day')) return Promise.resolve()
                return Promise.reject(new Error('The ceremony must be after the nomination window ends.'))
              },
            }),
          ]}
        >
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="budget"
          label="PRAISE budget"
          extra="Optional. The cycle's allocation (at least 5% of HRD funds). Reports compare grants released against it."
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            max={9999999999.99}
            precision={2}
            prefix="₱"
            placeholder="e.g. 150000"
            formatter={(value) => (value === '' || value === undefined ? '' : `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','))}
            parser={(value) => value?.replace(/,/g, '') ?? ''}
          />
        </Form.Item>

        <Form.Item name="status" label="Status" rules={[{ required: true, message: 'Select a status.' }]}>
          <Select options={statusOptions} />
        </Form.Item>

        {saveError && <Alert type="error" title={saveError} />}
      </Form>
    </Modal>
  )
}
