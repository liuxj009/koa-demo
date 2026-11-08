const { authService } = require('../services/authService.js');
const { getKeys, decryptWithPrivateKey } = require('../utils/cryptoUtils.js');
class AuthController {
    constructor() {
        this.encryptWithPublicKey = encryptWithPublicKey;
    }
    static async register(ctx){
        try {
            const { username, encryptedPassword } = ctx.request.body;
            const password = CryptoUtils.decryptWithRSA(encryptedPassword);
            const user = await AuthService.register(username, password);
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