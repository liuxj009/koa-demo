const mysql = require('mysql2');
const connection = mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'liuxj',
    password: '12345678!',
    database: 'test1'
});
connection.connect();



module.exports = {connection};