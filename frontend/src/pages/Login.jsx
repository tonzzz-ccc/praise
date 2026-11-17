import { useRef, useState } from 'react'
import { Alert, Button, Checkbox, Flex, Form, Input, Spin, Typography } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { Link, Navigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { useAccess } from '../hooks/useAccess'
import { playFireworks } from '../utils/fireworks'

export default function Login() {
  const { session, signIn } = useAccess()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const submitButton = useRef(null)

  if (session.status === 'loading') {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
        <Spin />
      </Flex>
    )
  }
  if (session.status === 'in') return <Navigate to="/" replace />

  const submit = async (values) => {
    setSubmitting(true)
    setError(null)
    // Measured now because a successful sign-in removes this page.
    const button = submitButton.current?.getBoundingClientRect()
    try {
      await signIn({ username: values.username, password: values.password, remember: Boolean(values.remember) })
      if (button) playFireworks({ x: button.left + button.width / 2, y: button.top + button.height / 2 })
    } catch (failure) {
      setError(failure.message)
      setSubmitting(false)
    }
  }

  return (
    <AuthShell>
      <Typography.Title level={2} className="auth-title">
        Sign in
      </Typography.Title>
      <Typography.Text type="secondary" className="auth-subtitle">
        Use your EMIS account.
      </Typography.Text>

      {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}

      <Form
        layout="vertical"
        requiredMark={false}
        size="large"
        onFinish={submit}
        onValuesChange={() => setError(null)}
      >
        <Form.Item
          name="username"
          label="Username or email"
          rules={[{ required: true, whitespace: true, message: 'Enter your username or email.' }]}
        >
          <Input prefix={<UserOutlined />} autoComplete="username" autoFocus />
        </Form.Item>

        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: 'Enter your password.' }]}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
        </Form.Item>

        <div className="auth-options">
          <Form.Item name="remember" valuePropName="checked" noStyle>
            <Checkbox>Remember me</Checkbox>
          </Form.Item>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>

        <Button ref={submitButton} type="primary" htmlType="submit" block loading={submitting}>
          Sign In
        </Button>
      </Form>
    </AuthShell>
  )
}
