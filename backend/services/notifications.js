// In-app notifications. Each event below works out who should hear about it (named people, or
// everyone holding a permission) and stores one row per recipient. Sending never fails the action
// that caused it: a problem here is logged and the action still succeeds.
const { db } = require('../config/db')
const { getEmployeeNames, listSections } = require('./emis')
const { HttpError } = require('./nominations')

const BUILT_IN_ADMIN_ID = 'builtin-admin'
const PAGE_SIZE = 30
const KEEP_READ_DAYS = 180

// Required when used, not at the top: access.js and nominations.js require each other.
const access = () => require('./access')
const nominations = () => require('./nominations')

const clip = (text, length) => (text.length > length ? `${text.slice(0, length - 1)}…` : text)

// The built-in Admin has every permission, so it hears whatever a permission-based audience hears.
function builtInAdminIsOn() {
  return Boolean(process.env.ADMIN_USERNAME?.trim() && process.env.ADMIN_PASSWORD)
}

async function resolveRecipients({ recipients = [], permissions = [], actor }) {
  const ids = new Set(recipients.filter(Boolean))
  if (permissions.length > 0) {
    for (const id of await access().listUsersWithPermission(permissions)) ids.add(id)
    if (builtInAdminIsOn()) ids.add(BUILT_IN_ADMIN_ID)
  }
  // People are not told about their own actions.
  if (actor) ids.delete(actor.id)
  return [...ids]
}

async function notify({ recipients, permissions, actor, type, title, message, link = null, nominationId = null }) {
  try {
    const ids = await resolveRecipients({ recipients, permissions, actor })
    if (ids.length === 0) return
    const rows = ids.map((id) => [
      id,
      type,
      clip(title, 150),
      clip(message, 500),
      link,
      nominationId,
      actor?.id ?? null,
      actor?.name ? clip(actor.name, 150) : null,
    ])
    await db.query(
      'INSERT INTO praise_notifications (recipient_id, type, title, message, link, nomination_id, actor_id, actor_name) VALUES ?',
      [rows],
    )
  } catch (error) {
    console.error(`Could not send the "${type}" notification:`, error)
  }
}

// Runs an event without letting a lookup error reach the caller.
function safely(event) {
  return async (...args) => {
    try {
      await event(...args)
    } catch (error) {
      console.error(`Could not prepare the ${event.name} notification:`, error)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Reading notifications
// ---------------------------------------------------------------------------------------------

async function listForUser(user, { before } = {}) {
  await db.query('DELETE FROM praise_notifications WHERE recipient_id = ? AND is_read = 1 AND created_at < NOW() - INTERVAL ? DAY', [
    user.id,
    KEEP_READ_DAYS,
  ])
  const beforeId = Number(before)
  const [rows] = await db.query(
    `SELECT id, type, title, message, link, nomination_id, actor_name, is_read, created_at FROM praise_notifications
     WHERE recipient_id = ? ${Number.isInteger(beforeId) && beforeId > 0 ? 'AND id < ?' : ''}
     ORDER BY id DESC LIMIT ?`,
    Number.isInteger(beforeId) && beforeId > 0 ? [user.id, beforeId, PAGE_SIZE + 1] : [user.id, PAGE_SIZE + 1],
  )
  return {
    items: rows.slice(0, PAGE_SIZE).map((row) => ({ ...row, is_read: Boolean(row.is_read) })),
    has_more: rows.length > PAGE_SIZE,
    unread: await countUnread(user),
  }
}

async function countUnread(user) {
  const [[{ unread }]] = await db.query('SELECT COUNT(*) AS unread FROM praise_notifications WHERE recipient_id = ? AND is_read = 0', [user.id])
  return Number(unread)
}

async function markRead(id, user) {
  const [result] = await db.query(
    'UPDATE praise_notifications SET is_read = 1, read_at = COALESCE(read_at, NOW()) WHERE id = ? AND recipient_id = ?',
    [id, user.id],
  )
  if (result.affectedRows === 0) throw new HttpError(404, 'Notification not found.')
  return { unread: await countUnread(user) }
}

async function markAllRead(user) {
  await db.query('UPDATE praise_notifications SET is_read = 1, read_at = NOW() WHERE recipient_id = ? AND is_read = 0', [user.id])
  return { unread: 0 }
}

async function remove(id, user) {
  const [result] = await db.query('DELETE FROM praise_notifications WHERE id = ? AND recipient_id = ?', [id, user.id])
  if (result.affectedRows === 0) throw new HttpError(404, 'Notification not found.')
  return { unread: await countUnread(user) }
}

// ---------------------------------------------------------------------------------------------
// Lookups used to word the messages
// ---------------------------------------------------------------------------------------------

async function describeNomination(nominationId) {
  return nominations().getNomination(nominationId)
}

// The employee nominated, or every included member of a nominated section.
async function awardeesOf(nomination) {
  if (nomination.employee_id) return [nomination.employee_id]
  const [rows] = await db.query('SELECT employee_id FROM praise_nomination_members WHERE nomination_id = ? AND is_excluded = 0', [nomination.id])
  return rows.map((row) => row.employee_id)
}

async function categoryName(categoryId) {
  const [[category]] = await db.query('SELECT name FROM praise_award_categories WHERE id = ?', [categoryId])
  return category?.name ?? 'an award'
}

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------

const nominationSubmitted = safely(async function nominationSubmitted(nominationId, actor) {
  const nomination = await describeNomination(nominationId)
  if (nomination.status !== 'submitted') return
  await notify({
    permissions: ['validation.review'],
    actor,
    type: 'nomination_submitted',
    title: 'New nomination submitted',
    message: `${actor.name} nominated ${nomination.nominee_name} for ${nomination.award_name}. It is waiting for validation.`,
    link: '/validation',
    nominationId,
  })
})

const nominationValidated = safely(async function nominationValidated(nominationId, actor) {
  const nomination = await describeNomination(nominationId)
  await notify({
    recipients: [nomination.created_by],
    actor,
    type: 'nomination_validated',
    title: 'Your nomination was validated',
    message: `Your nomination of ${nomination.nominee_name} for ${nomination.award_name} passed validation and goes to the PRAISE Committee for screening.`,
    link: '/nominations',
    nominationId,
  })
  await notify({
    permissions: ['screening'],
    actor,
    type: 'screening_ready',
    title: 'Nominee ready for screening',
    message: `${nomination.nominee_name} (${nomination.award_name}) is ready to be scored.`,
    link: '/screening',
    nominationId,
  })
})

const nominationDisqualified = safely(async function nominationDisqualified(nominationId, actor) {
  const nomination = await describeNomination(nominationId)
  const remarks = nomination.remarks ? ` Remarks: ${nomination.remarks}` : ''
  await notify({
    recipients: [nomination.created_by],
    actor,
    type: 'nomination_disqualified',
    title: 'Your nomination was disqualified',
    message: `Your nomination of ${nomination.nominee_name} for ${nomination.award_name} was disqualified. Reason: ${nomination.disqualification_reason}.${remarks}`,
    link: '/nominations',
    nominationId,
  })
})

// rows: the duplicate nominations that were closed, each with id and created_by.
const duplicatesClosed = safely(async function duplicatesClosed(rows, validated) {
  for (const row of rows) {
    await notify({
      recipients: [row.created_by],
      type: 'nomination_closed',
      title: 'Your nomination was closed',
      message: `Another nomination of the same nominee for the same award (No. ${validated.id}) was validated, so your nomination No. ${row.id} was closed. No action is needed.`,
      link: '/nominations',
      nominationId: row.id,
    })
  }
})

// group: the finalized nominations from the screening list, with status and names.
const screeningFinalized = safely(async function screeningFinalized(group, actor) {
  const shortlisted = group.find((nomination) => nomination.status === 'shortlisted')
  if (!shortlisted) return
  await notify({
    permissions: ['endorsement.manage', 'screening'],
    actor,
    type: 'screening_finalized',
    title: 'Screening finalized',
    message: `Screening for ${shortlisted.award_name} is finished. ${shortlisted.nominee_name} is shortlisted for endorsement to the Chief of Hospital.`,
    link: '/endorsement',
    nominationId: shortlisted.id,
  })
})

const awardEndorsed = safely(async function awardEndorsed({ category_id: categoryId }, actor) {
  const award = await categoryName(Number(categoryId))
  await notify({
    permissions: ['coh_approval.decide', 'endorsement.manage'],
    actor,
    type: 'award_endorsed',
    title: 'Award endorsed to the Chief of Hospital',
    message: `The shortlist for ${award} has been endorsed to the Chief of Hospital, who picks the winner.`,
    link: '/coh-approval',
  })
})

const endorsementWithdrawn = safely(async function endorsementWithdrawn({ category_id: categoryId }, actor) {
  const award = await categoryName(Number(categoryId))
  await notify({
    permissions: ['coh_approval.decide', 'endorsement.manage'],
    actor,
    type: 'endorsement_withdrawn',
    title: 'Endorsement withdrawn',
    message: `The Secretariat took back the endorsement of ${award}. It no longer needs a decision from the Chief of Hospital.`,
    link: '/coh-approval',
  })
})

const winnerSelected = safely(async function winnerSelected(nominationId, actor) {
  const nomination = await describeNomination(nominationId)
  await notify({
    permissions: ['endorsement.manage'],
    actor,
    type: 'winner_selected',
    title: 'Award winner picked',
    message: `The Chief of Hospital picked ${nomination.nominee_name} as the winner of ${nomination.award_name}. Set the conferment date when it is scheduled.`,
    link: '/endorsement',
    nominationId,
  })
  await notify({
    recipients: [nomination.created_by],
    actor,
    type: 'nominee_won',
    title: 'Your nominee won',
    message: `${nomination.nominee_name}, whom you nominated, was picked as the winner of ${nomination.award_name}.`,
    link: '/nominations',
    nominationId,
  })
  await notify({
    recipients: await awardeesOf(nomination),
    actor,
    type: 'award_won',
    title: 'Congratulations, you won a PRAISE award',
    message: nomination.section_id
      ? `Your section, ${nomination.nominee_name}, was chosen for ${nomination.award_name}. The Secretariat will announce the conferment date.`
      : `You were chosen for ${nomination.award_name}. The Secretariat will announce the conferment date.`,
    nominationId,
  })
})

const cohChoiceMade = safely(async function cohChoiceMade({ cycle_id: cycleId, choice_type: type }, actor) {
  const [[choice]] = await db.query('SELECT * FROM praise_coh_choices WHERE cycle_id = ? AND choice_type = ?', [Number(cycleId), type])
  if (!choice) return
  const name =
    type === 'section'
      ? (await listSections()).find((section) => section.id === choice.section_id)?.name
      : (await getEmployeeNames()).get(choice.employee_id)
  await notify({
    permissions: ['endorsement.manage'],
    actor,
    type: 'coh_choice',
    title: 'COH Choice awardee chosen',
    message: `The Chief of Hospital chose ${name ?? 'an awardee'} for the COH Choice ${type} award.`,
    link: '/endorsement',
  })
  if (type === 'employee') {
    await notify({
      recipients: [choice.employee_id],
      actor,
      type: 'award_won',
      title: 'Congratulations, you won a PRAISE award',
      message: 'The Chief of Hospital chose you for the COH Choice award. The Secretariat will announce the conferment date.',
    })
  } else {
    const [members] = await db.query("SELECT user_id FROM users WHERE section_id = ? AND is_active = 1 AND type = 'Employee'", [choice.section_id])
    await notify({
      recipients: members.map((member) => member.user_id),
      actor,
      type: 'award_won',
      title: 'Congratulations, your section won a PRAISE award',
      message: `The Chief of Hospital chose your section, ${name}, for the COH Choice award. The Secretariat will announce the conferment date.`,
    })
  }
})

const confermentRecorded = safely(async function confermentRecorded(body, actor) {
  if (!body?.conferment_date) return
  const date = new Date(`${body.conferment_date}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  let recipients = []
  let award = 'your PRAISE award'
  let nominationId = null
  if (body.kind === 'nomination') {
    const nomination = await describeNomination(Number(body.id))
    recipients = await awardeesOf(nomination)
    award = nomination.award_name
    nominationId = nomination.id
  } else if (body.kind === 'coh_choice') {
    const [[choice]] = await db.query('SELECT * FROM praise_coh_choices WHERE id = ?', [Number(body.id)])
    if (!choice) return
    award = 'the COH Choice award'
    if (choice.employee_id) {
      recipients = [choice.employee_id]
    } else {
      const [members] = await db.query("SELECT user_id FROM users WHERE section_id = ? AND is_active = 1 AND type = 'Employee'", [choice.section_id])
      recipients = members.map((member) => member.user_id)
    }
  }
  await notify({
    recipients,
    actor,
    type: 'conferment_scheduled',
    title: 'Award conferment date set',
    message: `The conferment of ${award} is set for ${date}.`,
    nominationId,
  })
})

// result: what records.recordRelease returns. Tells the awardee(s) about a newly released plaque
// or grant; corrections to a release already recorded are not announced again.
const releaseRecorded = safely(async function releaseRecorded({ newly, awardee, values }, actor) {
  if (!newly.plaque && !newly.certificate && !newly.grant) return
  let recipients
  if (awardee.kind === 'nomination') {
    recipients = await awardeesOf(await describeNomination(awardee.id))
  } else {
    const [[choice]] = await db.query('SELECT * FROM praise_coh_choices WHERE id = ?', [awardee.id])
    if (choice.employee_id) {
      recipients = [choice.employee_id]
    } else {
      const [members] = await db.query("SELECT user_id FROM users WHERE section_id = ? AND is_active = 1 AND type = 'Employee'", [choice.section_id])
      recipients = members.map((member) => member.user_id)
    }
  }
  const parts = []
  if (newly.plaque) parts.push('your plaque')
  if (newly.certificate) parts.push('your certificate')
  if (newly.grant) parts.push(`your cash grant of ₱${Number(values.grant_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`)
  await notify({
    recipients,
    actor,
    type: 'release_recorded',
    title: newly.grant ? 'Your award grant was released' : `Your award ${newly.plaque ? 'plaque' : 'certificate'} was released`,
    message: `The Secretariat recorded the release of ${parts.join(' and ')} for ${awardee.award_name}.`,
    nominationId: awardee.kind === 'nomination' ? awardee.id : null,
  })
})

const ROLE_NAMES = { chair: 'Chairperson', secretariat: 'Secretariat member', member: 'Member' }

const committeeMemberAdded = safely(async function committeeMemberAdded(member, actor) {
  const [[cycle]] = await db.query('SELECT name FROM praise_award_cycles WHERE id = ?', [member.cycle_id])
  await notify({
    recipients: [member.employee_id],
    actor,
    type: 'committee_added',
    title: 'You were added to the PRAISE Committee',
    message: `You are now ${ROLE_NAMES[member.role] ?? 'a member'} of the PRAISE Committee for ${cycle?.name ?? 'this cycle'}.`,
    link: member.role === 'secretariat' ? '/validation' : '/screening',
  })
})

const committeeMemberRelieved = safely(async function committeeMemberRelieved(member, actor) {
  await notify({
    recipients: [member.employee_id],
    actor,
    type: 'committee_relieved',
    title: 'You were relieved from the PRAISE Committee',
    message: `You were relieved from the PRAISE Committee. Reason: ${member.relieved_reason}`,
  })
})

const accessChanged = safely(async function accessChanged(employeeId, actor) {
  await notify({
    recipients: [employeeId],
    actor,
    type: 'access_changed',
    title: 'Your PRAISE access changed',
    message: `${actor.name} updated what you can do in PRAISE. Pages you can open may have changed.`,
  })
})

module.exports = {
  listForUser,
  countUnread,
  markRead,
  markAllRead,
  remove,
  nominationSubmitted,
  nominationValidated,
  nominationDisqualified,
  duplicatesClosed,
  screeningFinalized,
  awardEndorsed,
  endorsementWithdrawn,
  winnerSelected,
  cohChoiceMade,
  confermentRecorded,
  releaseRecorded,
  committeeMemberAdded,
  committeeMemberRelieved,
  accessChanged,
}
