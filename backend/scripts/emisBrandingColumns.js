// Columns PRAISE adds to EMIS's settings table, emis_agency_setup, so the login and sidebar
// branding is shared with EMIS in one database record. EMIS's own columns are left untouched;
// its existing agency_name is used as the center name.
const logoColumns = (name, after) => [
  { name, definition: `MEDIUMBLOB NULL AFTER ${after}` },
  { name: `${name}_mime`, definition: `VARCHAR(50) NULL AFTER ${name}` },
  { name: `${name}_updated_at`, definition: `DATETIME NULL AFTER ${name}_mime` },
]

const emisBrandingColumns = [
  { name: 'agency_short_name', definition: 'VARCHAR(50) NULL AFTER agency_name' },
  ...logoColumns('sidebar_logo', 'agency_logo'),
  ...logoColumns('login_logo_left', 'sidebar_logo_updated_at'),
  ...logoColumns('login_logo_right', 'login_logo_left_updated_at'),
  ...logoColumns('login_background', 'login_logo_right_updated_at'),
]

module.exports = { emisBrandingColumns }
