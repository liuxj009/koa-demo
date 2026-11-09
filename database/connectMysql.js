const mysql = require('mysql2');
const connection = mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'liuxj',
    password: '12345678!',
    database: 'test1'
});
connection.connect();

// connection.query('SELECT * FROM orders', (err, results) => {
//     if (err) {
//         console.error('查询失败:', err);
//         return;
//     }
//     console.log('查询结果:', results);
// });
connection.execute("CREATE TABLE IF NOT EXISTS orders2 (id INT AUTO_INCREMENT PRIMARY KEY, userName VARCHAR(255) NOT NULL, encryptedPassword VARCHAR(255) NOT NULL, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, password VARCHAR(255) NOT NULL)");
console.log('创建表成功');

module.exports = {connection};