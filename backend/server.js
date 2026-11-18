const cookieParser = require('cookie-parser')
const express = require('express')
const multer = require('multer')
const { db } = require('./config/db')
const { cors } = require('./middleware/cors')
const apiRoutes = require('./routes/api')
const realtime = require('./services/realtime')

const app = express()
const PORT = process.env.PORT || 5050
// Listen on this PC only by default (safer). Set HOST=0.0.0.0 to accept direct connections from
// other PCs on the LAN. Not needed when the frontend reaches the backend through the Vite proxy.
const HOST = process.env.HOST || '127.0.0.1'

app.use(cors)
app.use(express.json())
app.use(cookieParser())
app.use('/api', apiRoutes)

app.use((req, res) => {
  res.status(404).json({ message: 'Not found.' })
})

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  if (error.status) return res.status(error.status).json({ ...error.details, message: error.message })
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      message: error.code === 'LIMIT_FILE_SIZE'
          ? (req.path.includes('/system-settings/logos/') ? 'The image must be 5 MB or smaller.' : 'Files must be 15 MB or smaller.')
          : error.message,
    })
  }

  console.error(error)
  return res.status(500).json({ message: 'Something went wrong on the server.' })
})

const server = app.listen(PORT, HOST, async () => {
  console.log(`PRAISE API running on http://${HOST}:${PORT}`)
  try {
    await db.query('SELECT 1')
    console.log('MySQL connected')
  } catch (error) {
    console.error('MySQL connection failed:', error.message)
  }
})

// Live notification updates (WebSocket at /api/ws) share the API's port.
realtime.attach(server)
