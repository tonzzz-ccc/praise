import { Flex, Typography } from 'antd'

// One consistent header for every page: a title, an optional muted subtitle, and an optional
// right-aligned action (e.g. a primary button). Styling only.
export default function PageHeader({ title, subtitle, extra }) {
  return (
    <Flex className="page-header" justify="space-between" align="flex-start" gap={16} wrap="wrap" style={{ marginBottom: 20 }}>
      <div style={{ minWidth: 0 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {extra}
    </Flex>
  )
}
