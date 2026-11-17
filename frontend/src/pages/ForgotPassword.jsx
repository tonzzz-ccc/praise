import { Alert, Typography } from 'antd'
import { Link } from 'react-router-dom'
import AuthShell from '../components/AuthShell'

export default function ForgotPassword() {
  return (
    <AuthShell>
      <Typography.Title level={2} className="auth-title">
        Forgot your password?
      </Typography.Title>
      <Typography.Text type="secondary" className="auth-subtitle">
        PRAISE uses your EMIS account, so your password is managed in EMIS.
      </Typography.Text>
      <Alert
        type="info"
        title="Ask an EMIS administrator to set a new password"
        description="They can do this in EMIS under System Settings, Access Management. Then sign in here with the new password."
        style={{ marginBottom: 24 }}
      />
      <Link to="/login">Back to sign in</Link>
    </AuthShell>
  )
}
