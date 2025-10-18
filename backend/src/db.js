const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: parseInt(process.env.MYSQLPORT, 10),
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  debug: true
});

pool.on('connection', (connection) => {
  console.log('Database connection established');
});

pool.on('error', (err) => {
  console.error('Database connection error:', err);
});

module.exports = pool;
