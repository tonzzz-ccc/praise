import {
  AuditOutlined,
  BarChartOutlined,
  CrownOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FormOutlined,
  OrderedListOutlined,
  SendOutlined,
  SettingOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons'

// The one place sidebar categories and items are defined. Access Management builds its
// permission list from this too: an item's key is its permission, and a feature's key
// is "<item key>.<feature>".
export const navigation = [
  {
    key: 'overview',
    label: 'Overview',
    items: [{ key: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: DashboardOutlined, description: 'Home page with the current cycle and nominee counts per award category.' }],
  },
  {
    key: 'awards',
    label: 'Awards and Nominations',
    items: [
      {
        key: 'award_categories',
        path: '/award-categories',
        label: 'Award Categories',
        icon: TrophyOutlined,
        description: 'View the award categories open for nomination and their criteria.',
        features: [
          { key: 'award_categories.edit', label: 'Edit and deactivate awards', description: "Change an award's details and criteria, or take it out of use." },
          { key: 'award_categories.create', label: 'Add award categories', secretariatOnly: true, description: 'Create new award categories.' },
          { key: 'award_categories.manage_inactive', label: 'See and reactivate inactive awards', secretariatOnly: true, description: 'List deactivated awards and bring them back into use.' },
        ],
      },
      {
        key: 'nominations',
        path: '/nominations',
        label: 'Nominations',
        icon: FormOutlined,
        description: 'View nominations and their details, eligibility checks and attached documents.',
        features: [{ key: 'nominations.create', label: 'Create and edit nominations', description: 'Nominate employees, fill in criteria and upload supporting documents.' }],
      },
      {
        key: 'validation',
        path: '/validation',
        label: 'Secretariat Validation',
        icon: AuditOutlined,
        description: 'Open the validation queue of submitted nominations.',
        features: [{ key: 'validation.review', label: 'Verify documents, validate and disqualify', secretariatOnly: true, description: 'Accept or reject each document, then pass a nomination to screening or disqualify it.' }],
      },
      {
        key: 'screening',
        path: '/screening',
        label: 'Committee Screening',
        icon: OrderedListOutlined,
        description: 'Score validated nominees as a committee member.',
        features: [{ key: 'screening.results', label: 'See all scores and finalize the shortlist', secretariatOnly: true, description: "See every member's scores and lock in the shortlist for the cycle." }],
      },
      {
        key: 'endorsement',
        path: '/endorsement',
        label: 'Endorsement and Conferment',
        icon: SendOutlined,
        description: "See each award's shortlist, what the Chief of Hospital decided, and conferment dates.",
        features: [{ key: 'endorsement.manage', label: 'Endorse to the COH and record conferment dates', secretariatOnly: true, description: "Send each award's shortlist to the Chief of Hospital and record when each award was conferred." }],
      },
      {
        key: 'coh_approval',
        path: '/coh-approval',
        label: 'COH Approval',
        icon: CrownOutlined,
        description: 'Review the nominees endorsed to the Chief of Hospital, with their full nomination details.',
        features: [{ key: 'coh_approval.decide', label: 'Pick award winners and COH Choice', cohOnly: true, description: 'Pick one winner for each endorsed award, and the COH Choice section and employee.' }],
      },
      {
        key: 'committee',
        path: '/committee',
        label: 'Committee',
        icon: TeamOutlined,
        description: 'View the selection committee members for each cycle.',
        features: [{ key: 'committee.manage', label: 'Add, relieve and remove members', description: 'Change who sits on the committee for a cycle.' }],
      },
    ],
  },
  {
    key: 'records_reports',
    label: 'Records and Reports',
    items: [
      {
        key: 'records',
        path: '/records',
        label: 'Records',
        icon: FileTextOutlined,
        description: "Each cycle's awardees, their plaque and grant releases, and every nomination.",
        features: [{ key: 'records.manage', label: 'Record plaque and grant releases', secretariatOnly: true, description: 'Record when each awardee received their plaque and cash grant.' }],
      },
      { key: 'reports', path: '/reports', label: 'Reports', icon: BarChartOutlined, description: 'Nominations and results per award, and grants released against the cycle budget, with Excel and PDF export.' },
    ],
  },
  {
    key: 'settings_group',
    label: 'System Settings',
    icon: SettingOutlined,
    collapsible: true,
    items: [
      { key: 'settings', path: '/settings', label: 'General', description: 'System-wide settings such as award cycles.' },
      { key: 'access_management', path: '/settings/access-management', label: 'Access Management', description: 'Assign roles and choose what each role and person can use.' },
    ],
  },
]

export const allPermissionKeys = navigation.flatMap((category) =>
  category.items.flatMap((item) => [item.key, ...(item.features ?? []).map((feature) => feature.key)]),
)

export const secretariatOnlyKeys = navigation.flatMap((category) =>
  category.items.flatMap((item) =>
    (item.features ?? []).filter((feature) => feature.secretariatOnly).map((feature) => feature.key),
  ),
)

export const cohOnlyKeys = navigation.flatMap((category) =>
  category.items.flatMap((item) => (item.features ?? []).filter((feature) => feature.cohOnly).map((feature) => feature.key)),
)

export function visibleNavigation(can) {
  return navigation
    .map((category) => ({ ...category, items: category.items.filter((item) => can(item.key)) }))
    .filter((category) => category.items.length > 0)
}

export function findActivePath(items, pathname) {
  return items
    .map((item) => item.path)
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0]
}
