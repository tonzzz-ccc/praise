# Components

The app uses Ant Design primitives directly (Button, Card, Table, Form, Input, Select, Upload, Modal, Tag, Statistic, Descriptions, Alert, Flex, Row/Col, Typography) rather than a custom primitives library. Shared app components:

- **CategoryModal** — frontend/src/components/CategoryModal.jsx — antd Modal + Form to add/edit an award category (name, description, behavioral indicators, applies_to, nominee type, status, plaque/grant switches, grant levels Form.List). Read-only generated code when editing.
- **EligibilityPanel** — frontend/src/components/EligibilityPanel.jsx — antd Card listing eligibility checks with pass/fail/unverified icons, group members for reference, and a summary Alert.
- **NominationDetails** — frontend/src/components/NominationDetails.jsx — antd Drawer showing a nomination: status Tag, Descriptions, criteria (justifications + legacy evidence), supporting documents grouped by criterion.
- **AccessProvider / RequireLogin / RequireAccess** — auth + permission gates (logic only, minimal UI: Spin / Result 403/500).

Page-level patterns:
- Page header: `<Flex justify="space-between" align="center" wrap><Typography.Title level={3} style={{margin:0}}>Title</Typography.Title><Button type="primary" icon=.../></Flex>` (AwardCategories, Nominations). Dashboard/placeholder use a bare `Typography.Title level={3}`.
- Tables: antd `Table` with `scroll={{ x }}`, status `Tag` colors, filters via `Select`.
- Forms: antd `Form` layout="vertical", Cards per section, Upload.Dragger for documents.
