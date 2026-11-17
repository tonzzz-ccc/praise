import { useState } from 'react'
import { Alert, Button, Col, Form, Input, InputNumber, Modal, Radio, Row, Select, Space, Switch } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { criterionShortLabels } from '../utils/nominations'
import { createCategory, updateCategory } from '../services/api'

const appliesToOptions = [
  { value: 'permanent', label: 'Permanent' },
  { value: 'cos', label: 'Contract of Service' },
  { value: 'both', label: 'Permanent and COS' },
]

const nomineeTypeOptions = [
  { value: 'individual', label: 'Individual' },
  { value: 'section', label: 'Section/Committee' },
]

const statusOptions = [
  { value: true, label: 'Active' },
  { value: false, label: 'Inactive' },
]

const initialValues = {
  applies_to: 'both',
  nominee_type: 'individual',
  is_active: true,
  has_plaque: true,
  has_grant: false,
  is_limit_exempt: false,
  tiers: [{ tier_label: 'Standard' }],
  criteria_weights: { achievements: 20, method: 30, impact: 30, behavioral_indicators: 20 },
}

function normalizeName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function valuesFromCategory(category) {
  return {
    name: category.name,
    description: category.description,
    behavioral_indicators: category.behavioral_indicators.join('\n'),
    applies_to: category.applies_to,
    nominee_type: category.nominee_type,
    has_plaque: Boolean(category.has_plaque),
    has_grant: Boolean(category.has_grant),
    is_limit_exempt: Boolean(category.is_limit_exempt),
    tiers: category.tiers.length > 0 ? category.tiers : initialValues.tiers,
    criteria_weights: category.criteria_weights ?? initialValues.criteria_weights,
  }
}

// How much each criterion counts in the committee's screening score. Must total 100%.
function CriteriaWeights() {
  const weights = Form.useWatch('criteria_weights')
  const total = Object.values(weights ?? {}).reduce((sum, weight) => sum + (Number(weight) || 0), 0)
  return (
    <Form.Item
      label="Screening weights"
      extra={`Total ${total}%. Locked once the committee starts scoring this award.`}
      validateStatus={total === 100 ? undefined : 'error'}
      required
    >
      <Row gutter={8}>
        {Object.entries(criterionShortLabels).map(([key, label]) => (
          <Col xs={12} sm={6} key={key}>
            <Form.Item
              name={['criteria_weights', key]}
              label={label}
              rules={[{ required: true, message: 'Required.' }]}
              style={{ marginBottom: 0 }}
            >
              <InputNumber min={0} max={100} precision={0} suffix="%" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        ))}
      </Row>
    </Form.Item>
  )
}

function GrantLevels({ isSection }) {
  return (
    <Form.List name="tiers">
      {(fields, { add, remove }) => (
        <>
          {fields.map((field, index) => (
            <Row gutter={8} key={field.key} align="top">
              <Col xs={24} sm={isSection ? 12 : 8}>
                <Form.Item name={[field.name, 'id']} hidden>
                  <Input />
                </Form.Item>
                <Form.Item
                  name={[field.name, 'tier_label']}
                  label="Level name"
                  rules={[{ required: true, whitespace: true, message: 'Enter the level name.' }]}
                >
                  <Input maxLength={50} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={isSection ? 12 : 6}>
                <Form.Item
                  name={[field.name, 'max_amount']}
                  label="Maximum grant"
                  rules={[{ required: true, message: 'Enter the amount.' }]}
                >
                  <InputNumber prefix="₱" min={1} max={99999999} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              {!isSection && (
                <>
                  <Col xs={10} sm={4}>
                    <Form.Item name={[field.name, 'salary_grade_min']} label="From SG">
                      <InputNumber min={1} max={33} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={10} sm={4}>
                    <Form.Item name={[field.name, 'salary_grade_max']} label="To SG">
                      <InputNumber min={1} max={33} precision={0} placeholder="Up" style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={4} sm={2}>
                    <Form.Item label=" " colon={false}>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label={`Remove level ${index + 1}`}
                        disabled={fields.length === 1}
                        onClick={() => remove(field.name)}
                      />
                    </Form.Item>
                  </Col>
                </>
              )}
            </Row>
          ))}
          {!isSection && (
            <Form.Item
              extra="With several levels, each needs a salary grade range. The level is then set from the nominee's salary grade."
            >
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ tier_label: '' })}>
                Add level
              </Button>
            </Form.Item>
          )}
        </>
      )}
    </Form.List>
  )
}

// Adds a category, or edits the one passed in. The system generates the code, so it is only
// ever shown read-only, and the Active switch on the page changes the status of a saved category.
export default function CategoryModal({ category, categories, onClose, onSaved }) {
  const [form] = Form.useForm()
  const isEditing = Boolean(category)
  const otherCategories = categories.filter((item) => item.id !== category?.id)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const hasGrant = Form.useWatch('has_grant', form)
  const nomineeType = Form.useWatch('nominee_type', form)
  const isSection = nomineeType === 'section'

  const handleValuesChange = (changed) => {
    setSaveError(null)
    if (changed.nominee_type === 'section') {
      const [first] = form.getFieldValue('tiers') ?? []
      form.setFieldsValue({ tiers: [{ id: first?.id, tier_label: first?.tier_label, max_amount: first?.max_amount }] })
    }
  }

  const save = async (values) => {
    setSaving(true)
    setSaveError(null)
    try {
      const data = {
        ...values,
        behavioral_indicators: values.behavioral_indicators.split('\n'),
        tiers: values.has_grant ? values.tiers : [],
      }
      onSaved(isEditing ? await updateCategory(category.id, data) : await createCategory(data))
    } catch (error) {
      if (error.status === 409 && error.message.includes('name')) form.setFields([{ name: 'name', errors: [error.message] }])
      else setSaveError(error.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={isEditing ? 'Edit Award Category' : 'Add Award Category'}
      width={720}
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
      <Form
        form={form}
        layout="vertical"
        requiredMark
        preserve
        initialValues={isEditing ? valuesFromCategory(category) : initialValues}
        onFinish={save}
        onValuesChange={handleValuesChange}
      >
        {isEditing && (
          <Form.Item label="Code" htmlFor="category-code" extra="Generated by the system. It cannot be changed.">
            <Input id="category-code" value={category.code} readOnly variant="filled" />
          </Form.Item>
        )}

        <Form.Item
          name="name"
          label="Category name"
          rules={[
            { required: true, whitespace: true, message: 'Enter the category name.' },
            {
              validator: (_, value) =>
                otherCategories.some((item) => normalizeName(item.name) === normalizeName(value)) && normalizeName(value)
                  ? Promise.reject(new Error('An award category with this name already exists.'))
                  : Promise.resolve(),
            },
          ]}
        >
          <Input maxLength={150} />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
          rules={[{ required: true, whitespace: true, message: 'Enter a description.' }]}
        >
          <Input.TextArea rows={3} />
        </Form.Item>

        <Form.Item
          name="behavioral_indicators"
          label="Behavioral indicators"
          extra="One per line. These appear on the nomination form."
          rules={[{ required: true, whitespace: true, message: 'Enter at least one behavioral indicator.' }]}
        >
          <Input.TextArea rows={4} />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="applies_to" label="Applies to" rules={[{ required: true, message: 'Select who can receive this award.' }]}>
              <Select options={appliesToOptions} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="nominee_type" label="Nominee" rules={[{ required: true, message: 'Select who gets nominated.' }]}>
              <Select options={nomineeTypeOptions} />
            </Form.Item>
          </Col>
        </Row>

        {!isEditing && (
          <Form.Item name="is_active" label="Status">
            <Radio.Group options={statusOptions} />
          </Form.Item>
        )}

        <Space size="large" wrap style={{ marginBottom: 16 }}>
          <Space>
            <Form.Item name="has_plaque" valuePropName="checked" noStyle>
              <Switch aria-label="Plaque" />
            </Form.Item>
            Plaque
          </Space>
          <Space>
            <Form.Item name="has_grant" valuePropName="checked" noStyle>
              <Switch aria-label="Grant" />
            </Form.Item>
            Grant
          </Space>
        </Space>

        {hasGrant && <GrantLevels isSection={isSection} />}

        <CriteriaWeights />

        {saveError && <Alert type="error" title={saveError} />}
      </Form>
    </Modal>
  )
}
