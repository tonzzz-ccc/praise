// Live notification updates over a WebSocket at /api/ws. The notification rows stay the record
// (services/notifications.js); this only tells a signed-in user's open tabs that their unread count
// changed, so the bell updates at once instead of waiting for the next check.
//
// The browser cannot set an Authorization header on a WebSocket, so it sends its sign-in token as
// the second subprotocol: new WebSocket(url, ['praise', token]). The server answers with 'praise'.
const { WebSocketServer } = require('ws')
const { db } = require('../config/db')
const { getSessionUser } = require('./auth')

const PATH = '/api/ws'
const PROTOCOL = 'praise'
const HEARTBEAT_MS = 30 * 1000
// Every 10th heartbeat (about 5 minutes) each connection's session is checked again, so a signed-out
// or deactivated account stops receiving updates.
const RECHECK_EVERY = 10

// user id -> the open sockets of that user (one per tab).
const clients = new Map()

async function unreadCount(userId) {
  const [[{ unread }]] = await db.query('SELECT COUNT(*) AS unread FROM praise_notifications WHERE recipient_id = ? AND is_read = 0', [
    userId,
  ])
  return Number(unread)
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload))
}

function track(socket) {
  let sockets = clients.get(socket.userId)
  if (!sockets) clients.set(socket.userId, (sockets = new Set()))
  sockets.add(socket)
  socket.on('close', () => {
    sockets.delete(socket)
    if (sockets.size === 0 && clients.get(socket.userId) === sockets) clients.delete(socket.userId)
  })
}

// Sends each listed user still connected their current unread count. Never throws: a missed push
// is caught up by the bell's fallback check or the next push.
async function pushUnread(userIds) {
  const connected = [...new Set(userIds)].filter((id) => clients.has(id))
  await Promise.all(
    connected.map(async (id) => {
      try {
        const count = await unreadCount(id)
        for (const socket of clients.get(id) ?? []) send(socket, { type: 'unread', count })
      } catch (error) {
        console.error('Could not push the unread count:', error.message)
      }
    }),
  )
}

// Closes the live connections opened with this sign-in token (used on sign-out).
function closeSession(token) {
  if (!token) return
  for (const sockets of clients.values()) {
    for (const socket of sockets) if (socket.token === token) socket.close(4001, 'Signed out')
  }
}

function reject(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  socket.destroy()
}

function attach(server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024,
    handleProtocols: (protocols) => (protocols.has(PROTOCOL) ? PROTOCOL : false),
  })

  server.on('upgrade', async (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost')
    if (pathname !== PATH) return reject(socket, 404, 'Not Found')

    const offered = (req.headers['sec-websocket-protocol'] ?? '').split(',').map((value) => value.trim())
    const token = offered.find((value) => value !== PROTOCOL)
    let user = null
    try {
      user = offered.includes(PROTOCOL) ? await getSessionUser(token) : null
    } catch (error) {
      console.error('WebSocket sign-in check failed:', error.message)
    }
    if (!user) return reject(socket, 401, 'Unauthorized')

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = user.id
      ws.token = token
      ws.isAlive = true
      ws.beats = 0
      ws.on('pong', () => {
        ws.isAlive = true
      })
      // The browser only listens; anything it sends is ignored.
      ws.on('error', () => ws.terminate())
      track(ws)
      void pushUnread([user.id])
    })
  })

  // Drops connections that stopped answering (a closed laptop, a lost network) and re-checks sessions.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate()
        continue
      }
      ws.isAlive = false
      ws.ping()
      ws.beats += 1
      if (ws.beats % RECHECK_EVERY === 0) {
        getSessionUser(ws.token)
          .then((user) => {
            if (!user || user.id !== ws.userId) ws.close(4001, 'Signed out')
          })
          .catch(() => {})
      }
    }
  }, HEARTBEAT_MS)
  heartbeat.unref()
  wss.on('close', () => clearInterval(heartbeat))

  return wss
}

module.exports = { attach, closeSession, pushUnread }
