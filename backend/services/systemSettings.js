const { db } = require('../config/db')
const { HttpError } = require('./nominations')

// Branding shared with EMIS: it lives in EMIS's own settings row, emis_agency_setup (id 1), so
// both systems use one database record.
//   agency_name       - EMIS's existing center name ("Malinao Treatment and Rehabilitation Center")
//   agency_short_name - added for PRAISE ("DOH-MTRC")
//   <slot> images     - added for PRAISE (three logos and the login background): the image itself (MEDIUMBLOB), with its MIME type and
//                       the time it last changed
// Anything empty falls back to the built-in default in the frontend.
const SETUP_ID = 1
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const LOGO_SLOTS = {
  sidebar: 'sidebar_logo',
  login_left: 'login_logo_left',
  login_right: 'login_logo_right',
  login_background: 'login_background',
}
const TEXT_FIELDS = {
  agency_name: { column: 'agency_short_name', label: 'Agency name', max: 50 },
  center_name: { column: 'agency_name', label: 'Center name', max: 255 },
}

function logoColumn(slot) {
  const column = LOGO_SLOTS[slot]
  if (!column) throw new HttpError(404, 'Unknown logo.')
  return column
}

// The settings row is created by setup if EMIS has none yet; this guards against it being deleted.
async function ensureRow() {
  await db.query('INSERT IGNORE INTO emis_agency_setup (id) VALUES (?)', [SETUP_ID])
}

// Each logo is given as a version (changes with every upload, so browsers fetch the new image)
// or null when the default is used. Texts are null when the default is used.
async function getBranding() {
  const updatedColumns = Object.values(LOGO_SLOTS).map((column) => `${column}_updated_at`)
  const [[row = {}]] = await db.query('SELECT ??, ?? FROM emis_agency_setup WHERE id = ?', [
    Object.values(TEXT_FIELDS).map(({ column }) => column),
    updatedColumns,
    SETUP_ID,
  ])
  const logos = Object.fromEntries(
    Object.entries(LOGO_SLOTS).map(([slot, column]) => {
      const updatedAt = row[`${column}_updated_at`]
      return [slot, updatedAt ? new Date(updatedAt).getTime() : null]
    }),
  )
  const texts = Object.fromEntries(
    Object.entries(TEXT_FIELDS).map(([name, { column }]) => [name, row[column]?.trim() || null]),
  )
  return { logos, texts }
}

async function getLogo(slot) {
  const column = logoColumn(slot)
  const [[row]] = await db.query('SELECT ?? AS data, ?? AS mime FROM emis_agency_setup WHERE id = ?', [
    column,
    `${column}_mime`,
    SETUP_ID,
  ])
  if (!row?.data) throw new HttpError(404, 'No logo is set.')
  return { data: row.data, mime: row.mime }
}

// file comes from multer's memory storage: { buffer, mimetype }.
async function setLogo(slot, file) {
  const column = logoColumn(slot)
  await ensureRow()
  await db.query('UPDATE emis_agency_setup SET ?? = ?, ?? = ?, ?? = NOW() WHERE id = ?', [
    column,
    file.buffer,
    `${column}_mime`,
    file.mimetype,
    `${column}_updated_at`,
    SETUP_ID,
  ])
  return getBranding()
}

async function clearLogo(slot) {
  const column = logoColumn(slot)
  await db.query('UPDATE emis_agency_setup SET ?? = NULL, ?? = NULL, ?? = NULL WHERE id = ?', [
    column,
    `${column}_mime`,
    `${column}_updated_at`,
    SETUP_ID,
  ])
  return getBranding()
}

// Saves the texts given; an empty value goes back to the default.
async function setTexts(body) {
  const values = {}
  for (const [name, { column, label, max }] of Object.entries(TEXT_FIELDS)) {
    if (!(name in (body ?? {}))) continue
    const value = String(body[name] ?? '').trim().replace(/\s+/g, ' ')
    if (value.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer.`)
    values[column] = value || null
  }
  if (Object.keys(values).length > 0) {
    await ensureRow()
    await db.query('UPDATE emis_agency_setup SET ? WHERE id = ?', [values, SETUP_ID])
  }
  return getBranding()
}

module.exports = { LOGO_SLOTS, LOGO_TYPES, clearLogo, getBranding, getLogo, setLogo, setTexts }
