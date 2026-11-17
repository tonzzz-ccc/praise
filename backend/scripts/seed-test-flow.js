// LOCAL TESTING ONLY. Adds made-up nominations to the open cycle, one award at each stage of the
// PRAISE flow, so every page can be tried: Secretariat Validation, Committee Screening, Endorsement,
// COH Approval (picking winners), Records and Reports.
//
// Nominations are created through the same code as the nomination form (as drafts), so their
// eligibility snapshot and section members are real; then each is moved to its test stage. Every
// nomination is marked in form_responses ($._test_data), and --remove deletes only marked
// nominations with their members, documents (and files), scores and notifications.
// Refuses to run against anything but localhost.
//
// Usage: npm run seed-test-flow              (first set: one award at each stage)
//        npm run seed-test-flow -- --more    (one more nominee for every award, at its stage)
//        npm run seed-test-flow -- --coh     (several endorsed nominees per award for the COH to pick from)
//        npm run seed-test-flow -- --remove  (deletes all test data)
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true })

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1']
const MARKER = '$._test_data'
const FILE_PREFIX = 'TESTDATA-'
// Every test justification starts with this, so a run that stopped before marking still cleans up.
const TEXT_MARK = '[TEST DATA]'

if (!LOCAL_HOSTS.includes(process.env.DB_HOST)) {
  console.error(`Refusing to run: DB_HOST is ${process.env.DB_HOST}, not this computer. Test data is for local testing only.`)
  process.exit(1)
}

const { db } = require('../config/db')
const nominations = require('../services/nominations')
const { listActiveEmployees, listSections } = require('../services/emis')

const UPLOAD_DIR = nominations.UPLOAD_DIR
// Never used as test nominees or nominators: you (349), the Chief of Hospital (001), the built-in
// Admin, and anyone with a committee seat in the cycle (added below).
const KEEP_OUT = new Set(['349', '001', 'builtin-admin'])

async function markedIds() {
  const [rows] = await db.query(
    `SELECT id FROM praise_nominations
     WHERE JSON_EXTRACT(form_responses, ?) = true OR JSON_UNQUOTE(JSON_EXTRACT(form_responses, '$.achievements.justification')) LIKE ?`,
    [MARKER, `${TEXT_MARK}%`],
  )
  return rows.map((row) => row.id)
}

async function remove() {
  const ids = await markedIds()
  if (ids.length === 0) {
    console.log('No test data found.')
    return
  }
  const [documents] = await db.query('SELECT file_path FROM praise_nomination_documents WHERE nomination_id IN (?)', [ids])
  const [notices] = await db.query('DELETE FROM praise_notifications WHERE nomination_id IN (?)', [ids])
  // Members, documents and scores go with their nomination (ON DELETE CASCADE).
  const [deleted] = await db.query('DELETE FROM praise_nominations WHERE id IN (?)', [ids])
  let files = 0
  for (const document of documents) {
    const name = path.basename(document.file_path)
    if (name.startsWith(FILE_PREFIX)) {
      fs.rmSync(path.join(UPLOAD_DIR, name), { force: true })
      files += 1
    }
  }
  console.log(`Removed ${deleted.affectedRows} test nominations (Nos. ${ids.join(', ')}), ${files} document files and ${notices.affectedRows} notifications.`)
}

// A tiny valid PDF, so placeholder documents open in a browser.
function placeholderPdf(title) {
  const text = `PRAISE test document: ${title}`.replace(/[()\\]/g, '')
  const stream = `BT /F1 14 Tf 60 760 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

async function attachDocument(nominationId, docType, criterion, title, uploadedBy) {
  const fileName = `${FILE_PREFIX}${crypto.randomUUID()}.pdf`
  const content = placeholderPdf(title)
  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), content)
  await db.query('INSERT INTO praise_nomination_documents SET ?', {
    nomination_id: nominationId,
    doc_type: docType,
    criterion,
    file_name: `${title}.pdf`,
    file_path: fileName,
    mime_type: 'application/pdf',
    file_size: content.length,
    uploaded_by: uploadedBy,
  })
}

const responses = (nominee, award) =>
  Object.fromEntries(
    nominations.CRITERIA_KEYS.map((key) => [
      key,
      {
        justification: `${TEXT_MARK} Sample ${key.replace('_', ' ')} justification for ${nominee} (${award}).`,
        evidence: `${TEXT_MARK} Sample evidence for ${key.replace('_', ' ')}.`,
      },
    ]),
  )

// The open cycle, its committee, the people free to use as test nominees and nominators, and the
// helpers that create a test nomination and move it to a stage.
async function setup() {
  const [[cycle]] = await db.query("SELECT * FROM praise_award_cycles WHERE status = 'open' ORDER BY period_start DESC LIMIT 1")
  if (!cycle) throw new Error('No cycle is open. Open one in System Settings > General first.')

  const [seats] = await db.query('SELECT id, employee_id, role FROM praise_committee_members WHERE cycle_id = ? AND status = ?', [cycle.id, 'active'])
  seats.forEach((seat) => KEEP_OUT.add(seat.employee_id))
  const secretariat = seats.find((seat) => seat.role === 'secretariat')?.employee_id ?? 'builtin-admin'
  const [taken] = await db.query(
    "SELECT employee_id, nominator_employee_id, created_by FROM praise_nominations WHERE cycle_id = ? AND status <> 'closed'",
    [cycle.id],
  )
  taken.forEach((row) => [row.employee_id, row.nominator_employee_id, row.created_by].forEach((id) => id && KEEP_OUT.add(id)))

  const categories = new Map((await nominations.listCategories()).map((category) => [category.code, category]))
  const pool = (await listActiveEmployees()).filter((employee) => !KEEP_OUT.has(employee.id))
  const used = new Set()
  const take = (test) => {
    const employee = pool.find((candidate) => !used.has(candidate.id) && test(candidate))
    if (employee) used.add(employee.id)
    return employee
  }
  const nominatorFor = () => take(() => true)

  // Creates a draft through the nomination form's code, then marks it as test data.
  async function create(code, nominee) {
    const category = categories.get(code)
    const nominator = nominatorFor()
    const name = nominee.name
    const body = {
      category_id: category.id,
      [category.nominee_type === 'section' ? 'section_id' : 'employee_id']: nominee.id,
      nominator_type: 'co_employee',
      nominator_employee_id: nominator.id,
      form_responses: responses(name, category.name),
      status: 'draft',
    }
    // Acts as the nominator, with the Nominator role's access.
    const actor = { id: nominator.id, name: nominator.name, role_code: 'nominator', is_admin: false, permissions: ['nominations', 'nominations.create'] }
    const saved = await nominations.saveNomination(body, undefined, actor)
    await db.query('UPDATE praise_nominations SET form_responses = JSON_SET(form_responses, ?, true) WHERE id = ?', [MARKER, saved.id])
    return { id: saved.id, name, nominator, category }
  }

  async function moveTo(id, values, submittedDaysAgo = 6) {
    await db.query(
      `UPDATE praise_nominations SET ?, submitted_at = DATE_SUB(NOW(), INTERVAL ? DAY),
         validated_by = IF(? , ?, validated_by), validated_at = IF(?, DATE_SUB(NOW(), INTERVAL 3 DAY), validated_at)
       WHERE id = ?`,
      [values, submittedDaysAgo, values.status !== 'submitted', secretariat, values.status !== 'submitted', id],
    )
  }

  // Ratings 0-4 per criterion from each committee seat. Higher base, higher average.
  async function score(id, base, howMany = seats.length) {
    for (const seat of seats.slice(0, howMany)) {
      const rate = (offset) => Math.max(0, Math.min(4, base + offset))
      await db.query('INSERT INTO praise_screening_scores SET ?', {
        nomination_id: id,
        committee_member_id: seat.id,
        scores: JSON.stringify({
          achievements: rate(0),
          method: rate((seat.id % 3) - 1),
          impact: rate(seat.id % 2),
          behavioral_indicators: rate(-(seat.id % 2)),
        }),
        remarks: `${TEXT_MARK} Sample remarks.`,
      })
    }
  }

  const created = []
  const log = (stage, item) => created.push(`  No. ${item.id}  ${item.category.name}: ${item.name} (${stage})`)

  // Tries sections in order until one can be nominated (a section with no current members cannot).
  async function createForSection(code, sections) {
    for (const section of sections) {
      try {
        return await create(code, section)
      } catch (error) {
        if (!/member/i.test(error.message)) throw error
      }
    }
    throw new Error('No section could be nominated.')
  }

  return { cycle, secretariat, take, create, createForSection, moveTo, score, log, created }
}

const anyStatus = (e) => e.employment_status === 'permanent' || e.employment_status === 'cos'
const dangalLevelOne = (e) => e.employment_status === 'permanent' && e.salary_grade >= 1 && e.salary_grade <= 11
const dangalLevelTwo = (e) => e.employment_status === 'permanent' && e.salary_grade >= 12

async function seed() {
  if ((await markedIds()).length > 0) {
    console.error('Test data is already in the database. Remove it first: npm run seed-test-flow -- --remove')
    process.exit(1)
  }
  const { cycle, secretariat, take, create, createForSection, moveTo, score, log, created } = await setup()

  // 1. Gawad Hiraya: submitted with documents, for Secretariat Validation.
  for (let i = 0; i < 2; i += 1) {
    const item = await create('GAWAD_HIRAYA', take((e) => e.employment_status === 'permanent' || e.employment_status === 'cos'))
    await attachDocument(item.id, 'nomination_form', null, 'Nomination form', item.nominator.id)
    await attachDocument(item.id, 'ipcr', null, 'IPCR', item.nominator.id)
    for (const key of nominations.CRITERIA_KEYS) await attachDocument(item.id, 'other', key, `Evidence - ${key}`, item.nominator.id)
    await moveTo(item.id, { status: 'submitted', validated_by: null, validated_at: null }, 2)
    log('submitted, waiting for validation', item)
  }

  // 2. Agap Serbisyo (COS): validated, two partly scored and one not scored, for Committee Screening.
  for (let i = 0; i < 3; i += 1) {
    const item = await create('AGAP_SERBISYO', take((e) => e.employment_status === 'cos'))
    await moveTo(item.id, { status: 'validated' })
    if (i < 2) await score(item.id, 3 - i, 5)
    log(i < 2 ? 'validated, scored by 5 of the committee' : 'validated, not scored yet', item)
  }

  // 3. Dangal Level I and II: screened; the top scorer endorsed to the COH, the rest not selected.
  const dangal = [
    ['DANGAL', 3, (e) => e.employment_status === 'permanent' && e.salary_grade >= 1 && e.salary_grade <= 11],
    ['DANGAL_NG_MTRC_AWARD_LEVEL_II', 2, (e) => e.employment_status === 'permanent' && e.salary_grade >= 12],
  ]
  for (const [code, count, test] of dangal) {
    for (let i = 0; i < count; i += 1) {
      const nominee = take(test)
      if (!nominee) break
      const item = await create(code, nominee)
      await score(item.id, 3 - i)
      const endorsed = i === 0
      await moveTo(item.id, {
        status: endorsed ? 'endorsed' : 'not_selected',
        endorsed_by: endorsed ? secretariat : null,
        endorsed_at: endorsed ? new Date() : null,
      })
      log(endorsed ? 'ENDORSED to the COH, ready to pick' : 'screened, not selected', item)
    }
  }

  // 4. Excellence in Customer Service (sections): decided, for Records (plaque and grant) and Reports.
  const sections = (await listSections()).slice(0, 12)
  let decided = 0
  for (const section of sections) {
    if (decided === 2) break
    try {
      const item = await create('CUSTOMER_SVC', section)
      await score(item.id, 3 - decided)
      const won = decided === 0
      await moveTo(item.id, {
        status: won ? 'awarded' : 'not_selected',
        endorsed_by: secretariat,
        endorsed_at: new Date(),
        coh_decided_by: '001',
        coh_decided_at: new Date(),
      })
      log(won ? 'WINNER, record the conferment and releases' : 'endorsed, not picked', item)
      decided += 1
    } catch (error) {
      // A section with no current members cannot be nominated; try the next one.
      if (!/member/i.test(error.message)) throw error
    }
  }

  console.log(`Added ${created.length} test nominations to ${cycle.name}:`)
  console.log(created.join('\n'))
  console.log('Remove them later with: npm run seed-test-flow -- --remove')
}

// One more test nominee for every award, each at the stage its award is already at, so the flow
// stays consistent: screened awards get a lower-scored "not selected" nominee, the rest join the
// queue they are in. Can be run on top of the first seed, and more than once.
async function more() {
  const { cycle, secretariat, take, create, createForSection, moveTo, score, log, created } = await setup()
  const [usedSections] = await db.query('SELECT section_id FROM praise_nominations WHERE cycle_id = ? AND section_id IS NOT NULL', [cycle.id])
  const sectionTaken = new Set(usedSections.map((row) => row.section_id))
  const freeSections = (await listSections()).filter((section) => !sectionTaken.has(section.id))
  const screened = { status: 'not_selected', endorsed_by: null, endorsed_at: null }

  // Gawad Hiraya: another submission waiting for validation, with documents.
  const hiraya = await create('GAWAD_HIRAYA', take(anyStatus))
  await attachDocument(hiraya.id, 'nomination_form', null, 'Nomination form', hiraya.nominator.id)
  await attachDocument(hiraya.id, 'ipcr', null, 'IPCR', hiraya.nominator.id)
  for (const key of nominations.CRITERIA_KEYS) await attachDocument(hiraya.id, 'other', key, `Evidence - ${key}`, hiraya.nominator.id)
  await moveTo(hiraya.id, { status: 'submitted', validated_by: null, validated_at: null }, 1)
  log('submitted, waiting for validation', hiraya)

  // Agap Serbisyo: another validated nominee for the Committee to score.
  const agap = await create('AGAP_SERBISYO', take((e) => e.employment_status === 'cos'))
  await moveTo(agap.id, { status: 'validated' })
  log('validated, not scored yet', agap)

  // Dangal Level I and II, and Sulong Kalinangan: screened, scored below the shortlisted nominee.
  for (const [code, test] of [
    ['DANGAL', dangalLevelOne],
    ['DANGAL_NG_MTRC_AWARD_LEVEL_II', dangalLevelTwo],
    ['SULONG_KALINANGAN', anyStatus],
  ]) {
    const nominee = take(test)
    if (!nominee) continue
    const item = await create(code, nominee)
    await score(item.id, 1)
    await moveTo(item.id, screened)
    log('screened, not selected', item)
  }

  // Excellence in Customer Service: another section endorsed to the COH but not picked.
  const section = await createForSection('CUSTOMER_SVC', freeSections)
  await score(section.id, 1)
  await moveTo(section.id, { status: 'not_selected', endorsed_by: secretariat, endorsed_at: new Date(), coh_decided_by: '001', coh_decided_at: new Date() })
  log('endorsed, not picked', section)

  console.log(`Added ${created.length} more test nominations to ${cycle.name}:`)
  console.log(created.join('\n'))
  console.log('Remove all test data later with: npm run seed-test-flow -- --remove')
}

// Puts several test nominees in front of the Chief of Hospital per award, so picking a winner is a
// real choice: one more endorsed nominee for Dangal Level I and II, two endorsed test nominees for
// Sulong Kalinangan, and Excellence in Customer Service set back to undecided. This goes beyond
// the real rule (screening shortlists one nominee per award and level) and is for testing only.
// Only test nominations change; real ones (like Sulong Kalinangan No. 1) are left as they are.
async function cohChoices() {
  const { cycle, secretariat, take, create, moveTo, score, log, created } = await setup()
  const ids = await markedIds()
  const endorsed = () => ({ status: 'endorsed', endorsed_by: secretariat, endorsed_at: new Date() })

  for (const [code, test] of [
    ['DANGAL', dangalLevelOne],
    ['DANGAL_NG_MTRC_AWARD_LEVEL_II', dangalLevelTwo],
    ['SULONG_KALINANGAN', anyStatus],
  ]) {
    const nominee = take(test)
    if (!nominee) continue
    const item = await create(code, nominee)
    await score(item.id, 3)
    await moveTo(item.id, endorsed())
    log('ENDORSED to the COH, ready to pick', item)
  }

  // Sulong Kalinangan's earlier test nominee joins the new one in front of the COH.
  const [sulong] = await db.query(
    `SELECT n.id FROM praise_nominations n JOIN praise_award_categories c ON c.id = n.category_id
     WHERE n.id IN (?) AND c.code = 'SULONG_KALINANGAN' AND n.status = 'not_selected'`,
    [ids],
  )
  for (const row of sulong) {
    await moveTo(row.id, endorsed())
    created.push(`  No. ${row.id}  Sulong Kalinangan: moved to ENDORSED to the COH, ready to pick`)
  }

  // Excellence in Customer Service: every test section back to endorsed and undecided, with the
  // winner's conferment and releases cleared.
  const [excellence] = await db.query(
    `SELECT n.id FROM praise_nominations n JOIN praise_award_categories c ON c.id = n.category_id
     WHERE n.id IN (?) AND c.code = 'CUSTOMER_SVC' AND n.endorsed_at IS NOT NULL`,
    [ids],
  )
  for (const row of excellence) {
    await db.query(
      `UPDATE praise_nominations SET status = 'endorsed', coh_decided_by = NULL, coh_decided_at = NULL,
         conferment_date = NULL, conferment_recorded_by = NULL, plaque_released_on = NULL, grant_amount = NULL,
         grant_released_on = NULL, release_recorded_by = NULL
       WHERE id = ?`,
      [row.id],
    )
    created.push(`  No. ${row.id}  Excellence in Customer Service Award: back to ENDORSED, undecided`)
  }

  console.log(`Test nominees waiting for the COH in ${cycle.name}:`)
  console.log(created.join('\n'))
  console.log('Remove all test data later with: npm run seed-test-flow -- --remove')
}

const run = process.argv.includes('--remove')
  ? remove
  : process.argv.includes('--more')
    ? more
    : process.argv.includes('--coh')
      ? cohChoices
      : seed
run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
