import { useState } from 'react'
import { Alert, Button, Card, Flex, Form, Input, Popconfirm, Typography, Upload, message as antdMessage } from 'antd'
import { DeleteOutlined, TrophyOutlined, UploadOutlined } from '@ant-design/icons'
import { brandingDefaults, brandingLogo, setBranding, useBranding } from '../hooks/useBranding'
import { removeLogo, saveBrandingTexts, uploadLogo } from '../services/api'

const ACCEPT = 'image/png,image/jpeg,image/webp'
const MAX_BYTES = 5 * 1024 * 1024

const logoSlots = [
  {
    slot: 'sidebar',
    title: 'Sidebar logo',
    help: 'Top of the sidebar for everyone. Without one, the trophy icon is shown.',
    dark: true,
  },
  { slot: 'login_left', title: 'Login page logo (left)', help: 'First logo on the login page. Default: DOH logo.' },
  { slot: 'login_right', title: 'Login page logo (right)', help: 'Second logo on the login page. Default: MTRC logo.' },
  {
    slot: 'login_background',
    title: 'Login page background',
    help: 'Photo behind the blue panel of the login page, under a blue tint. Use a wide image, at least 1600 pixels across. Default: the bundled photo.',
    wide: true,
  },
]

function LogoRow({ slot, title, help, dark, wide, branding, onChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const isCustom = Boolean(branding?.logos?.[slot])
  const src = brandingLogo(branding, slot)

  const run = async (action, success) => {
    setBusy(true)
    setError(null)
    try {
      onChange(await action(), success)
    } catch (actionError) {
      setError(actionError.message)
    } finally {
      setBusy(false)
    }
  }

  const beforeUpload = (file) => {
    if (!ACCEPT.split(',').includes(file.type)) setError('Upload a PNG, JPG or WebP image.')
    else if (file.size > MAX_BYTES) setError('The image must be 5 MB or smaller.')
    else run(() => uploadLogo(slot, file), `${title} updated.`)
    return Upload.LIST_IGNORE
  }

  return (
    <Flex gap={20} align="center" wrap className="system-settings-logo-row">
      <div className={`system-settings-logo-preview${dark ? '' : ' is-light'}${wide ? ' is-wide' : ''}`}>
        {src ? (
          <img src={src} alt={title} />
        ) : (
          <span className="praise-sider-brand-icon" aria-hidden>
            <TrophyOutlined />
          </span>
        )}
      </div>
      <Flex vertical gap={8} style={{ flex: 1, minWidth: 220 }}>
        <Typography.Text strong>
          {title}
          {!isCustom && <Typography.Text type="secondary"> · Default</Typography.Text>}
        </Typography.Text>
        <Typography.Text type="secondary">{help}</Typography.Text>
        <Flex gap={8} wrap>
          <Upload accept={ACCEPT} showUploadList={false} beforeUpload={beforeUpload} disabled={busy}>
            <Button icon={<UploadOutlined />} loading={busy}>
              {isCustom ? 'Replace' : 'Upload'}
            </Button>
          </Upload>
          {isCustom && (
            <Popconfirm
              title="Remove this image?"
              description="The default will be shown again."
              okText="Remove"
              okButtonProps={{ danger: true }}
              onConfirm={() => run(() => removeLogo(slot), `${title} removed.`)}
            >
              <Button icon={<DeleteOutlined />} disabled={busy}>
                Remove
              </Button>
            </Popconfirm>
          )}
        </Flex>
        {error && <Alert type="error" title={error} />}
      </Flex>
    </Flex>
  )
}

// Settings > System Settings: branding shared with EMIS (its emis_agency_setup record).
export default function SystemSettings() {
  const [message, messageHolder] = antdMessage.useMessage()
  const branding = useBranding()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const handleChange = (next, success) => {
    setBranding(next)
    message.success(success)
  }

  const saveTexts = async (values) => {
    setSaving(true)
    setSaveError(null)
    try {
      handleChange(await saveBrandingTexts(values), 'Names saved.')
    } catch (error) {
      setSaveError(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Flex vertical gap={16} style={{ maxWidth: 720 }}>
      {messageHolder}
      <Alert
        type="info"
        showIcon
        title="These settings are shared with EMIS. The center name is EMIS's agency name, so changing it here also changes it in EMIS."
      />

      <Card title="Agency Names">
        {branding && (
          <Form
            form={form}
            layout="vertical"
            initialValues={{ agency_name: branding.texts.agency_name ?? '', center_name: branding.texts.center_name ?? '' }}
            onFinish={saveTexts}
            onValuesChange={() => setSaveError(null)}
          >
            <Form.Item
              name="agency_name"
              label="Agency name"
              extra={`Shown above PRAISE on the login page and in its footer. Leave empty for "${brandingDefaults.agency_name}".`}
            >
              <Input maxLength={50} placeholder={brandingDefaults.agency_name} />
            </Form.Item>
            <Form.Item
              name="center_name"
              label="Center name"
              extra={`Shown at the bottom of the login page's blue panel. Leave empty for "${brandingDefaults.center_name}".`}
            >
              <Input maxLength={255} placeholder={brandingDefaults.center_name} />
            </Form.Item>
            {saveError && <Alert type="error" title={saveError} style={{ marginBottom: 16 }} />}
            <Button type="primary" htmlType="submit" loading={saving}>
              Save Names
            </Button>
          </Form>
        )}
      </Card>

      <Card title="Logos and Background" extra={<Typography.Text type="secondary">PNG, JPG or WebP · up to 5 MB</Typography.Text>}>
        <Flex vertical gap={20}>
          {logoSlots.map((item) => (
            <LogoRow key={item.slot} {...item} branding={branding} onChange={handleChange} />
          ))}
        </Flex>
      </Card>
    </Flex>
  )
}
