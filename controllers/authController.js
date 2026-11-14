const { AuthService } = require('../services/authService.js');
const { getKeys, decryptWithPrivateKey } = require('../utils/cryptoUtils.js');
class AuthController {
    constructor() {
        this.encryptWithPublicKey = encryptWithPublicKey;
    }
    static async getUser(ctx){
        const { userName } = ctx.request.query;
        const user = await AuthService.getUser(userName);
        ctx.body = { code: 200, message: '查询成功', data: user };
    }

    static async register(ctx){
        debugger

        try {
            const { username, userId, password } = ctx.request.body;
            // const password = decryptWithPrivateKey(encryptedPassword);
            const user = await AuthService.register({ username, userId, password });
            ctx.body = { code: 200, message: '注册成功', data: user };
        } catch (error) {
            ctx.status = 400;
            ctx.body = { code: 400, message: error.message };
        }
    }
    static async login(ctx) {
        const { userName, encryptedPassword } = ctx.request.body;
        const password = decryptWithPrivateKey(encryptedPassword);
        ctx.body = { message: '登录成功', password };
    }
    static async getPublickKey(ctx){
        const { publicKey } = await getKeys();
        ctx.body = { publicKey };
    }
}   

module.exports = { AuthController};