const mysql = require('mysql2/promise');
const env = require('dotenv');

env.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});


// 测试连接
const connection = pool.getConnection()
connection.then(connection => {
    console.log('MySQL Connected successfully');
    connection.release();
})
.catch(err => {
    console.error('MySQL Connection Error:', err.message);
});


module.exports = {pool};