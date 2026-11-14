const User = require('../models/user.js');
class AuthService {
    constructor() {
        this.encryptWithPublicKey = encryptWithPublicKey;
    }
    static async register({ username, userId, password}){
        const existUser = await User.findByUsername(username);
        if(existUser.length > 0){
            throw new Error("用户名已存在");
        }
        await User.create({ id:1111,username, userId, password});
    }
    login(userName, password){
        console.log("@@service login", userName, password);
    }
    static async getUser(userName){
        return await User.findByUsername(userName);
    }
}

module.exports = { AuthService };