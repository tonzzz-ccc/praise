import { Alert, Result, Spin } from 'antd'
import { useAccess } from '../hooks/useAccess'

export default function RequireAccess({ permission, children }) {
  const { can, error, isReady } = useAccess()

  if (!isReady) return error ? <Alert type="error" title={error.message} /> : <Spin />
  if (!can(permission)) {
    return <Result status="403" title="No access" subTitle="You don't have access to this page." />
  }
  return children
}
