const mysql = require('mysql2/promise');
  const dotenv = require('dotenv');
  dotenv.config();

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'tic_mysql', 
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'tictactoe',
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