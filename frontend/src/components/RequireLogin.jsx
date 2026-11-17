import { Button, Flex, Result, Spin } from 'antd'
import { Navigate } from 'react-router-dom'
import { useAccess } from '../hooks/useAccess'

export default function RequireLogin({ children }) {
  const { session } = useAccess()

  if (session.status === 'loading') {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
        <Spin />
      </Flex>
    )
  }
  if (session.status === 'error') {
    return (
      <Result
        status="500"
        title="Cannot load PRAISE"
        subTitle={session.error.message}
        extra={
          <Button type="primary" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      />
    )
  }
  if (session.status === 'out') return <Navigate to="/login" replace />

  return children
}
