const mysql = require('mysql2/promise')
require('dotenv').config({ quiet: true })

// PRAISE and EMIS share one database. PRAISE's own tables are the praise_* tables; the employee,
// section and PDS tables belong to EMIS and are read, never written, by services/emis.js.
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || process.env.EMIS_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
})

module.exports = { db }
