
// 模拟数据库操作，实际项目中可替换为 Mongoose 或 Sequelize
const {pool} = require('../config/db.js');


class User {
    static async findByUsername(username) {
        const [rows] = await pool.query(`SELECT * FROM users WHERE username = ?`, [username]);
        console.log("findByUsername",rows);
        return rows;
    }

    static async create({username, userId=111, password,id}) {
        const res = await pool.execute(`INSERT INTO users (id,username, userId, password) VALUES (?, ?, ?, ?)`, [id,username, userId,password,id]);
        console.log("create",res);
        return res[0];
    }
}

module.exports = User;
