import { Empty } from 'antd'
import PageHeader from '../components/PageHeader'

export default function Placeholder({ title }) {
  return (
    <>
      <PageHeader title={title} />
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Nothing to show here yet."
        style={{ padding: '56px 0' }}
      />
    </>
  )
}
