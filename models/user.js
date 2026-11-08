
// 模拟数据库操作，实际项目中可替换为 Mongoose 或 Sequelize
const {pool} = require('../config/db.js');


class User {
    static async findByUsername(username) {
        const res = await pool.query(`SELECT * FROM users WHERE username = ?`, [username]);
        console.log("findByUsername",res);
        return res[0];
    }

    static async create(username, password) {
        const res = await pool.query(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password]);
        console.log("create",res);
        return res[0];
    }
}

module.exports = User;
