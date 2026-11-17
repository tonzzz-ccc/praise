import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Avatar,
  Button,
  Col,
  Flex,
  Form,
  Input,
  message,
  Popconfirm,
  Progress,
  Radio,
  Result,
  Row,
  Select,
  Spin,
  Steps,
  Tag,
  Typography,
  Upload,
} from 'antd'
import {
  CheckCircleFilled,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleFilled,
  DeleteOutlined,
  InboxOutlined,
  PaperClipOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import EligibilityPanel from '../components/EligibilityPanel'
import PageHeader from '../components/PageHeader'
import { useApi } from '../hooks/useApi'
import {
  checkEligibility,
  createNomination,
  deleteDocument,
  deleteDraft,
  documentUrl,
  getNomination,
  listCategories,
  listCycles,
  listEmployees,
  listSections,
  listSupervisors,
  updateNomination,
  uploadDocument,
} from '../services/api'
import { formatTier, todayString } from '../utils/format'
import { nominationCriteria, nominatorTypeOptions } from '../utils/nominations'
import './NominationForm.css'

const searchByLabel = { optionFilterProp: 'label' }

// Supporting documents: same types and size the backend accepts.
const MAX_FILE_MB = 15
const ACCEPT_ATTR = '.pdf,.doc,.docx,.jpg,.jpeg,.png'
const ACCEPTED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]
const ACCEPTED_EXT = /\.(pdf|docx?|jpe?g|png)$/i

function formatBytes(size) {
  if (!size && size !== 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function employeeOption(employee) {
  return {
    value: employee.id,
    label: `${employee.last_name}, ${employee.first_name} (${employee.employee_no})`,
  }
}

// Whether a salary grade falls in one of the award's grant levels. Awards whose levels go by
// salary grade (e.g. Dangal Level I: SG 1-11, Level II: SG 12 and up) only list employees in range.
function fitsGrantLevel(employee, category) {
  const graded = (category.tiers ?? []).filter((tier) => tier.salary_grade_min !== null)
  if (graded.length === 0) return true
  const grade = employee.salary_grade
  if (grade === null || grade === undefined) return false
  return graded.some(
    (tier) => grade >= tier.salary_grade_min && (tier.salary_grade_max === null || grade <= tier.salary_grade_max),
  )
}

function canReceiveAward(employee, category) {
  if (!category) return false
  const statusOk =
    category.applies_to === 'both'
      ? ['permanent', 'cos'].includes(employee.employment_status)
      : employee.employment_status === category.applies_to
  return statusOk && fitsGrantLevel(employee, category)
}

// Groups a draft's saved documents into one file list per criterion, so each criterion's upload
// shows its own files. Documents with no (or an unknown) criterion go under the first criterion.
function groupSavedDocuments(draft) {
  const byCriterion = Object.fromEntries(nominationCriteria.map((criterion) => [criterion.key, []]))
  for (const document of draft?.documents ?? []) {
    const key = nominationCriteria.some((criterion) => criterion.key === document.criterion)
      ? document.criterion
      : nominationCriteria[0].key
    byCriterion[key].push({
      uid: String(document.id),
      documentId: document.id,
      name: document.file_name,
      size: document.file_size,
      status: 'done',
      url: documentUrl(document.id),
    })
  }
  return byCriterion
}

function CriterionLabel({ criterion, category }) {
  return (
    <>
      <Typography.Text strong>{criterion.label}</Typography.Text>
      {criterion.key === 'behavioral_indicators' && category && (
        <Flex vertical gap={4} style={{ marginTop: 8 }}>
          {category.behavioral_indicators.map((indicator) => (
            <Flex key={indicator} gap={8} align="baseline">
              <CheckOutlined aria-hidden />
              <span>{indicator}</span>
            </Flex>
          ))}
        </Flex>
      )}
    </>
  )
}

function NominationFields({ draft, categories: activeList, cycles, employees, sections }) {
  const navigate = useNavigate()
  // A draft keeps its award even after that award is deactivated, when the list no longer has it.
  const categories = draft?.category && !activeList.some((item) => item.id === draft.category_id)
    ? [...activeList, draft.category]
    : activeList
  const [form] = Form.useForm()
  const [filesByCriterion, setFilesByCriterion] = useState(() => groupSavedDocuments(draft))
  const [saved, setSaved] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [showDocumentErrors, setShowDocumentErrors] = useState(false)
  const [messageApi, messageHolder] = message.useMessage()

  // Checks each file's type and size, shows a clear error, and keeps valid files in the list
  // without uploading yet (they are uploaded with the nomination on save).
  const beforeUpload = (file) => {
    const typeOk = ACCEPTED_MIME.includes(file.type) || ACCEPTED_EXT.test(file.name)
    const sizeOk = file.size <= MAX_FILE_MB * 1024 * 1024
    if (!typeOk) {
      messageApi.error(`${file.name}: only PDF, Word, JPG or PNG files can be attached.`)
      return Upload.LIST_IGNORE
    }
    if (!sizeOk) {
      messageApi.error(`${file.name} is larger than ${MAX_FILE_MB} MB.`)
      return Upload.LIST_IGNORE
    }
    return false
  }

  const renderFileItem = (_, file, __, { remove }) => (
    <Flex
      align="center"
      justify="space-between"
      gap={8}
      style={{ marginTop: 8, padding: '6px 10px', border: '1px solid #f0f0f0', borderRadius: 6 }}
    >
      <Flex align="center" gap={8} style={{ minWidth: 0 }}>
        <PaperClipOutlined aria-hidden />
        {file.url ? (
          <a href={file.url} target="_blank" rel="noreferrer">
            {file.name}
          </a>
        ) : (
          <Typography.Text ellipsis={{ tooltip: file.name }}>{file.name}</Typography.Text>
        )}
        {file.size ? <Typography.Text type="secondary">{formatBytes(file.size)}</Typography.Text> : null}
      </Flex>
      <Button
        type="text"
        size="small"
        danger
        icon={<DeleteOutlined />}
        aria-label={`Remove ${file.name}`}
        onClick={remove}
      />
    </Flex>
  )

  const categoryId = Form.useWatch('category_id', form)
  const employeeId = Form.useWatch('employee_id', form)
  const sectionId = Form.useWatch('section_id', form)
  const nominatorType = Form.useWatch('nominator_type', form)
  const nominatorName = Form.useWatch('nominator_name', form)
  const nominatorEmployeeId = Form.useWatch('nominator_employee_id', form)
  const responses = Form.useWatch('form_responses', form)

  const today = todayString()
  const title = draft ? `Edit Draft No. ${draft.id}` : 'New Nomination'
  const cycle = cycles.find((item) => (draft ? item.id === draft.cycle_id : item.status === 'open'))
  const category = categories.find((item) => item.id === categoryId)
  const employee = employees.find((item) => item.id === employeeId)
  const section = sections.find((item) => item.id === sectionId)
  const isSectionAward = category?.nominee_type === 'section'
  const activeCategories = categories.filter((item) => item.is_active || item.id === draft?.category_id)
  const nomineeOptions = employees.filter((item) => canReceiveAward(item, category)).map(employeeOption)
  const windowOpen = cycle && today >= cycle.nomination_start && today <= cycle.nomination_end
  const hasNominee = category && (isSectionAward ? sectionId : employeeId)

  const loadEligibility = useCallback(() => {
    if (!hasNominee) return Promise.resolve(null)
    return checkEligibility({
      category_id: categoryId,
      employee_id: isSectionAward ? undefined : employeeId,
      section_id: isSectionAward ? sectionId : undefined,
      nomination_id: draft?.id,
    })
  }, [hasNominee, categoryId, employeeId, sectionId, isSectionAward, draft?.id])
  const { data: eligibilityData, error: eligibilityError, loading: eligibilityLoading } = useApi(loadEligibility)

  // "Supervisor" nominators are limited to the nominee's immediate supervisor(s) in EMIS.
  const isSupervisorNominator = nominatorType === 'supervisor'
  const loadSupervisors = useCallback(() => {
    if (!isSupervisorNominator || !hasNominee) return Promise.resolve(null)
    return listSupervisors(isSectionAward ? { sectionId } : { employeeId })
  }, [isSupervisorNominator, hasNominee, isSectionAward, sectionId, employeeId])
  const { data: supervisors, loading: supervisorsLoading } = useApi(loadSupervisors)
  // EMIS may not have a head on record yet; then any employee can be chosen.
  const hasSupervisorRecord = Boolean(supervisors?.length)

  // Fill in the supervisor when there is exactly one, and clear a choice that is no longer one of
  // the nominee's supervisors (e.g. after changing the nominee).
  useEffect(() => {
    if (!isSupervisorNominator || !supervisors || supervisors.length === 0) return
    const current = form.getFieldValue('nominator_employee_id')
    if (supervisors.some((supervisor) => supervisor.id === current)) return
    form.setFieldsValue({ nominator_employee_id: supervisors.length === 1 ? supervisors[0].id : undefined })
  }, [isSupervisorNominator, supervisors, form])

  const nominatorOptions =
    isSupervisorNominator && hasSupervisorRecord ? supervisors.map(employeeOption) : employees.map(employeeOption)
  const eligibility = eligibilityLoading || eligibilityError ? null : eligibilityData

  const handleValuesChange = (changed) => {
    if ('category_id' in changed) {
      form.setFieldsValue({ employee_id: undefined, section_id: undefined })
    }
    if ('nominator_type' in changed) {
      form.setFieldsValue({ nominator_employee_id: undefined, nominator_name: undefined })
    }
  }

  const setCriterionFiles = (key) => ({ fileList }) =>
    setFilesByCriterion((previous) => ({ ...previous, [key]: fileList }))

  const saveDocuments = async (nominationId) => {
    const allFiles = nominationCriteria.flatMap((criterion) =>
      (filesByCriterion[criterion.key] ?? []).map((file) => ({ file, criterion: criterion.key })),
    )
    const keptIds = allFiles.map(({ file }) => file.documentId).filter(Boolean)
    const removed = (draft?.documents ?? []).filter((document) => !keptIds.includes(document.id))

    for (const document of removed) await deleteDocument(nominationId, document.id)
    for (const { file, criterion } of allFiles) {
      if (file.originFileObj) await uploadDocument(nominationId, file.originFileObj, criterion)
    }
  }

  const save = async (status) => {
    const values = form.getFieldsValue(true)
    const payload = {
      status: 'draft',
      category_id: values.category_id,
      employee_id: values.employee_id,
      section_id: values.section_id,
      nominator_type: values.nominator_type,
      nominator_employee_id: values.nominator_employee_id,
      nominator_name: values.nominator_name,
      // Only justification is collected now; evidence text is no longer part of the form.
      form_responses: Object.fromEntries(
        nominationCriteria.map((criterion) => [
          criterion.key,
          { justification: values.form_responses?.[criterion.key]?.justification },
        ]),
      ),
    }

    setSaving(true)
    setSaveError(null)
    try {
      // Documents can only change on a draft, so attach them before submitting.
      let nomination = draft ? await updateNomination(draft.id, payload) : await createNomination(payload)
      await saveDocuments(nomination.id)
      if (status === 'submitted') {
        nomination = await updateNomination(nomination.id, { ...payload, status })
      }
      setSaved(nomination)
    } catch (error) {
      setSaveError(error.message)
    } finally {
      setSaving(false)
    }
  }

  // The form shows validation errors next to each field.
  const validateAndSave = async (status, fields) => {
    try {
      await form.validateFields(fields)
    } catch {
      return
    }
    save(status)
  }

  const saveDraft = () => validateAndSave('draft', ['category_id', 'employee_id', 'section_id'])

  const removeDraft = async () => {
    setSaving(true)
    try {
      await deleteDraft(draft.id)
      // The list page shows the confirmation, since this page closes right away.
      navigate('/nominations', { state: { deletedDraft: draft.id } })
    } catch (deleteError) {
      setSaveError(deleteError.message)
      setSaving(false)
    }
  }

  const submit = async () => {
    // Each criterion needs at least one document to submit; drafts can still be saved without any.
    const missing = nominationCriteria.filter((criterion) => (filesByCriterion[criterion.key] ?? []).length === 0)
    setShowDocumentErrors(true)
    if (missing.length > 0) {
      messageApi.error(`Attach at least one supporting document to: ${missing.map((criterion) => criterion.label).join(', ')}.`)
    }

    // Checks the fields even when documents are missing, so every problem shows at once.
    try {
      await form.validateFields()
    } catch (error) {
      const firstInvalid = error.errorFields?.[0]?.name
      if (firstInvalid) form.scrollToField(firstInvalid, { block: 'center' })
      return
    }
    if (missing.length > 0) {
      document.getElementById(`documents-${missing[0].key}`)?.scrollIntoView({ block: 'center' })
      return
    }
    save('submitted')
  }

  const startAnother = () => {
    form.resetFields()
    setFilesByCriterion(groupSavedDocuments(null))
    setShowDocumentErrors(false)
    setSaved(null)
    navigate('/nominations/new')
  }

  if (saved) {
    return (
      <Result
        status="success"
        title={saved.status === 'submitted' ? 'Nomination submitted' : 'Draft saved'}
        subTitle={`Nomination no. ${saved.id} for ${saved.cycle_name}.`}
        extra={[
          <Button key="list" type="primary" onClick={() => navigate('/nominations')}>
            View nominations
          </Button>,
          <Button key="another" onClick={startAnother}>
            Start another nomination
          </Button>,
        ]}
      />
    )
  }

  if (!cycle) {
    return (
      <>
        <Typography.Title level={3}>{title}</Typography.Title>
        <Alert type="warning" title="No award cycle is open for nominations." />
      </>
    )
  }

  const windowClosed = today > cycle.nomination_end
  const extendWindowHint = 'An administrator can extend the nomination window in System Settings > General.'
  // The backend rejects a nominee whose salary grade matches no grant level of the award.
  const noGrantLevel = eligibility && category?.tiers?.length > 0 && !eligibility.tier
  const canSubmit = windowOpen && eligibility?.is_eligible && !noGrantLevel

  // Why the Submit button is disabled, shown right above it. Missing fields and documents do not
  // disable it: clicking Submit marks each one on the form.
  const submitBlockers = [
    !windowOpen &&
      (windowClosed
        ? `The nomination window closed on ${cycle.nomination_end}. ${extendWindowHint}`
        : `The nomination window opens on ${cycle.nomination_start}.`),
    !hasNominee && (isSectionAward ? 'Select a section, committee or unit.' : 'Select an award and a nominee.'),
    eligibilityError && 'The eligibility check could not be completed. Reload the page and try again.',
    eligibility && !eligibility.is_eligible && 'The nominee does not meet a requirement in the eligibility check.',
    noGrantLevel && "The nominee's salary grade does not match a grant level of this award.",
  ].filter(Boolean)

  // Completion checklist for the summary rail. It mirrors what Submit checks.
  const justified = nominationCriteria.filter((criterion) => responses?.[criterion.key]?.justification?.trim()).length
  const documented = nominationCriteria.filter((criterion) => (filesByCriterion[criterion.key] ?? []).length > 0).length
  const nominatorSet = nominatorType && (nominatorType === 'external' ? nominatorName?.trim() : nominatorEmployeeId)
  const totalCriteria = nominationCriteria.length
  const checklist = [
    { key: 'nominee', label: 'Award and nominee selected', done: Boolean(hasNominee), target: 'section-nominee' },
    {
      key: 'eligible',
      label: eligibility && !eligibility.is_eligible ? 'Not eligible' : 'Nominee is eligible',
      done: Boolean(eligibility?.is_eligible) && !noGrantLevel,
      failed: Boolean(eligibility && (!eligibility.is_eligible || noGrantLevel)),
      target: 'section-eligibility',
    },
    { key: 'justifications', label: `${justified} of ${totalCriteria} justifications`, done: justified === totalCriteria, target: 'section-criteria' },
    { key: 'documents', label: `${documented} of ${totalCriteria} criteria documented`, done: documented === totalCriteria, target: 'section-criteria' },
    { key: 'nominator', label: 'Nominator set', done: Boolean(nominatorSet), target: 'section-nominator' },
  ]
  const doneCount = checklist.filter((item) => item.done).length
  const steps = [
    { title: 'Award & nominee', target: 'section-nominee', done: Boolean(hasNominee) },
    { title: 'Eligibility', target: 'section-eligibility', done: Boolean(eligibility?.is_eligible) && !noGrantLevel },
    { title: 'Criteria', target: 'section-criteria', done: justified === totalCriteria && documented === totalCriteria },
    { title: 'Nominator', target: 'section-nominator', done: Boolean(nominatorSet) },
  ]
  const currentStep = Math.max(0, steps.findIndex((step) => !step.done))
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const actions = (
    <Flex gap={8} wrap="wrap" className="nf-actions">
      {draft?.id && (
        <Popconfirm
          title="Delete this draft?"
          description="The draft and its attached files are removed for good."
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={removeDraft}
        >
          <Button danger icon={<DeleteOutlined />} disabled={saving}>
            Delete draft
          </Button>
        </Popconfirm>
      )}
      <Button onClick={saveDraft} loading={saving}>
        Save draft
      </Button>
      <Button type="primary" onClick={submit} loading={saving} disabled={!canSubmit}>
        Submit to Secretariat
      </Button>
    </Flex>
  )

  return (
    <>
      {messageHolder}
      <PageHeader title={title} subtitle="Complete each section and attach documents per criterion, then submit to the Secretariat." />

      <Form form={form} layout="vertical" requiredMark initialValues={draft ?? undefined} onValuesChange={handleValuesChange}>
        <div className="nf-layout">
          <div className="nf-main">
            <Steps
              size="small"
              className="nf-steps"
              current={currentStep}
              onChange={(index) => scrollTo(steps[index].target)}
              items={steps.map((step) => ({ title: step.title, status: step.done ? 'finish' : undefined }))}
            />

            {!windowOpen && (
              <Alert
                type="info"
                title={
                  windowClosed
                    ? `${cycle.name} nominations closed on ${cycle.nomination_end}.`
                    : `${cycle.name} nominations open ${cycle.nomination_start} to ${cycle.nomination_end}.`
                }
                description={
                  windowClosed
                    ? `You can still save a draft. ${extendWindowHint}`
                    : 'You can save a draft now and submit it during that period.'
                }
              />
            )}

            <FormSection id="section-nominee" number={1} title="Award and nominee" help="Choose the award, then who you are nominating.">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="category_id" label="Award" rules={[{ required: true, message: 'Select an award.' }]}>
                    <Select
                      placeholder="Select an award"
                      options={activeCategories.map((item) => ({ value: item.id, label: item.name }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} md={12}>
                  {isSectionAward ? (
                    <Form.Item
                      name="section_id"
                      label="Section/Committee/Unit"
                      rules={[{ required: true, message: 'Select a section, committee or unit.' }]}
                    >
                      <Select
                        showSearch={searchByLabel}
                        placeholder="Search by name"
                        options={sections.map((item) => ({ value: item.id, label: item.name }))}
                      />
                    </Form.Item>
                  ) : (
                    <Form.Item name="employee_id" label="Name of nominee" rules={[{ required: true, message: 'Select a nominee.' }]}>
                      <Select
                        showSearch={searchByLabel}
                        disabled={!category}
                        placeholder={category ? 'Search by name or employee number' : 'Select an award first'}
                        options={nomineeOptions}
                      />
                    </Form.Item>
                  )}
                </Col>
              </Row>

              {category && <Typography.Paragraph type="secondary">{category.description}</Typography.Paragraph>}

              {hasNominee && (
                <div className="nf-profile">
                  <Avatar size={44} icon={isSectionAward ? <TeamOutlined /> : <UserOutlined />} className="nf-profile-avatar" />
                  <div className="nf-profile-text">
                    <strong>
                      {isSectionAward ? section?.name : employee ? `${employee.first_name} ${employee.last_name}` : ''}
                    </strong>
                    <span>
                      {isSectionAward
                        ? `Division: ${section?.division_name ?? 'Not set'}`
                        : employee?.position_title
                          ? `${employee.position_title} · SG ${employee.salary_grade ?? 'not set'}`
                          : 'Position not set'}
                    </span>
                    {!isSectionAward && employee && (
                      <span>
                        {employee.section_name ?? 'Section not set'} / {employee.division_name ?? 'Division not set'}
                      </span>
                    )}
                  </div>
                  <div className="nf-profile-side">
                    {eligibility?.tier && <span className="nf-grant">Max grant · {formatTier(eligibility.tier)}</span>}
                    <span className="nf-date">Date: {today}</span>
                  </div>
                </div>
              )}
            </FormSection>

            <FormSection id="section-eligibility" number={2} title="Eligibility" help="Checked automatically from EMIS records once a nominee is chosen.">
              {eligibilityError && <Alert type="error" title={eligibilityError.message} />}
              {hasNominee && eligibilityLoading && <Spin />}
              {eligibility ? (
                <EligibilityPanel eligibility={eligibility} embedded />
              ) : (
                !eligibilityLoading && !eligibilityError && <Typography.Text type="secondary">Select an award and nominee to run the check.</Typography.Text>
              )}
            </FormSection>

            <FormSection id="section-criteria" number={3} title="Criteria" help="Write a justification and attach at least one supporting document for each criterion.">
              <Flex vertical gap={16}>
                {nominationCriteria.map((criterion, index) => {
                  const files = filesByCriterion[criterion.key] ?? []
                  const hasText = Boolean(responses?.[criterion.key]?.justification?.trim())
                  const complete = hasText && files.length > 0
                  return (
                    <div key={criterion.key} className="nf-criterion">
                      <div className="nf-criterion-head">
                        <span className="nf-criterion-number">{index + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <CriterionLabel criterion={criterion} category={category} />
                        </div>
                        <Tag color={complete ? 'success' : files.length === 0 ? 'warning' : 'default'} style={{ margin: 0 }}>
                          {complete ? 'Complete' : files.length === 0 ? 'Needs documents' : 'Needs justification'}
                        </Tag>
                      </div>
                      <Row gutter={16}>
                        <Col xs={24} lg={12}>
                          <Form.Item
                            name={['form_responses', criterion.key, 'justification']}
                            label="Justification"
                            rules={[{ required: true, whitespace: true, message: 'Enter the justification.' }]}
                          >
                            <Input.TextArea showCount style={{ height: 150, resize: 'vertical' }} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} lg={12} className="nomination-docs-col" id={`documents-${criterion.key}`}>
                          <Form.Item
                            className="nomination-docs-item"
                            label="Supporting documents"
                            required
                            {...(showDocumentErrors && files.length === 0
                              ? { validateStatus: 'error', help: 'Attach at least one supporting document.' }
                              : {})}
                            extra={`PDF, Word, JPG or PNG, up to ${MAX_FILE_MB} MB each. One required to submit.`}
                          >
                            <Upload.Dragger
                              multiple
                              fileList={files}
                              accept={ACCEPT_ATTR}
                              beforeUpload={beforeUpload}
                              onChange={setCriterionFiles(criterion.key)}
                              itemRender={renderFileItem}
                            >
                              <div className="nomination-docs-dropzone">
                                <InboxOutlined />
                                <span className="nomination-docs-text">Click or drag files here to attach</span>
                              </div>
                            </Upload.Dragger>
                          </Form.Item>
                        </Col>
                      </Row>
                    </div>
                  )
                })}
              </Flex>
            </FormSection>

            <FormSection id="section-nominator" number={4} title="Nominator" help="Who is making this nomination.">
              <Form.Item name="nominator_type" label="Nominated by" rules={[{ required: true, message: 'Select who is nominating.' }]}>
                <Radio.Group options={nominatorTypeOptions} optionType="button" buttonStyle="solid" />
              </Form.Item>

              {nominatorType === 'external' && (
                <Form.Item
                  name="nominator_name"
                  label="Printed name"
                  rules={[{ required: true, whitespace: true, message: 'Enter the name of the nominator.' }]}
                >
                  <Input />
                </Form.Item>
              )}

              {nominatorType && nominatorType !== 'external' && (
                <Form.Item
                  name="nominator_employee_id"
                  label="Printed name"
                  dependencies={['employee_id']}
                  rules={[
                    { required: true, message: 'Select the nominator.' },
                    {
                      validator: (_, value) =>
                        value && value === form.getFieldValue('employee_id')
                          ? Promise.reject(new Error('Nominees cannot nominate themselves.'))
                          : Promise.resolve(),
                    },
                  ]}
                >
                  <Select
                    showSearch={searchByLabel}
                    loading={isSupervisorNominator && supervisorsLoading}
                    disabled={isSupervisorNominator && !hasNominee}
                    placeholder={
                      isSupervisorNominator && !hasNominee ? 'Select the nominee first' : 'Search by name or employee number'
                    }
                    options={nominatorOptions}
                  />
                </Form.Item>
              )}

              {isSupervisorNominator && hasNominee && supervisors && (
                <Typography.Text type="secondary" className="nf-hint">
                  {hasSupervisorRecord
                    ? `Only the nominee's immediate supervisor${supervisors.length > 1 ? 's' : ''} in EMIS can be chosen.`
                    : 'EMIS has no immediate supervisor on record for this nominee, so any employee can be chosen.'}
                </Typography.Text>
              )}
            </FormSection>
          </div>

          {/* Summary rail: sticky beside the form on wide screens, below it on smaller ones. */}
          <aside className="nf-rail" aria-label="Nomination summary">
            <div className="nf-summary">
              <div className="nf-summary-head">
                <span>Nomination summary</span>
                <span className="nf-summary-count">
                  {doneCount}/{checklist.length}
                </span>
              </div>
              <Progress percent={Math.round((doneCount / checklist.length) * 100)} showInfo={false} size="small" />

              <dl className="nf-summary-facts">
                <dt>Award</dt>
                <dd>{category?.name ?? 'Not selected'}</dd>
                <dt>Nominee</dt>
                <dd>
                  {isSectionAward ? (section?.name ?? 'Not selected') : employee ? `${employee.first_name} ${employee.last_name}` : 'Not selected'}
                </dd>
                {eligibility?.tier && (
                  <>
                    <dt>Max grant</dt>
                    <dd>{formatTier(eligibility.tier)}</dd>
                  </>
                )}
              </dl>

              <ul className="nf-checklist">
                {checklist.map((item) => (
                  <li key={item.key} className={item.done ? 'is-done' : item.failed ? 'is-failed' : undefined}>
                    <button type="button" onClick={() => scrollTo(item.target)}>
                      {item.done ? <CheckCircleFilled /> : item.failed ? <CloseCircleFilled /> : <ClockCircleOutlined />}
                      <span>{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>

              {saveError && <Alert type="error" title={saveError} />}
              {submitBlockers.length > 0 && (
                <Alert
                  type="info"
                  title="Submit is not available yet"
                  description={
                    <Flex vertical gap={4}>
                      {submitBlockers.map((blocker) => (
                        <span key={blocker}>{blocker}</span>
                      ))}
                    </Flex>
                  }
                />
              )}
              {actions}
            </div>
          </aside>
        </div>

        {/* Phones: the actions stay reachable at the bottom of the screen. */}
        <div className="nf-mobile-bar">
          <span>
            {doneCount}/{checklist.length} complete
          </span>
          {actions}
        </div>
      </Form>
    </>
  )
}

// A numbered section card of the form.
function FormSection({ id, number, title, help, children }) {
  return (
    <section id={id} className="nf-section">
      <header className="nf-section-head">
        <span className="nf-section-number">{number}</span>
        <div>
          <h3>{title}</h3>
          {help && <p>{help}</p>}
        </div>
      </header>
      <div className="nf-section-body">{children}</div>
    </section>
  )
}

function loadFormOptions() {
  return Promise.all([listCategories(), listCycles(), listEmployees(), listSections()]).then(
    ([categories, cycles, employees, sections]) => ({ categories, cycles, employees, sections }),
  )
}

export default function NominationForm() {
  const { id } = useParams()
  const loadDraft = useCallback(() => (id ? getNomination(id) : Promise.resolve(null)), [id])
  const { data: options, error: optionsError, loading: optionsLoading } = useApi(loadFormOptions)
  const { data: draft, error: draftError, loading: draftLoading } = useApi(loadDraft)
  const notEditable = (id && draftError) || (id && draft && draft.status !== 'draft')

  if (notEditable) {
    return (
      <>
        <Typography.Title level={3}>Edit Draft</Typography.Title>
        <Alert
          type="warning"
          title="This nomination cannot be edited because it is not a saved draft."
          description={<Link to="/nominations">Back to nominations</Link>}
        />
      </>
    )
  }

  if (optionsError) return <Alert type="error" title={optionsError.message} />
  if (optionsLoading || draftLoading || !options) return <Spin />

  return <NominationFields draft={draft} {...options} />
}
