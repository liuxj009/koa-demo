const User = require('../models/user.js');
class AuthService {
    constructor() {
        this.encryptWithPublicKey = encryptWithPublicKey;
    }
    async register(userName, password){
        const existUser = await User.findOne({userName});
        if(existUser){
            throw new Error("用户名已存在");
        }
        const user = new User({userName, password});
    }
    login(userName, password){
        console.log("@@service login", userName, password);
    }
}