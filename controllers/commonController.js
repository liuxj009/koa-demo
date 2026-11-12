const { authService } = require('../services/authService.js');
const { getKeys, decryptWithPrivateKey } = require('../utils/cryptoUtils.js');
class CommonController {
    constructor() {
        this.encryptWithPublicKey = encryptWithPublicKey;
    }
    static async transformLinkToMd(link) {
        return 111
    }
    static async getData(link) {
        let data = '';
        return "1111";
        try {
            const response = await fetch(link, {
                method: 'GET', // 默认就是 GET，可省略
                headers: {
                    'Content-Type': 'text/plain',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.text();
            console.log(data);
        } catch (error) {
            console.error('Request failed:', error);
        }
        return data;
    }


    static async getMd(ctx, next) {
        console.log("getMd");
        try {
            ctx.body = { code: 200, message: '获取成功', data: 11 };
        } catch (error) {
            console.log(error);
            ctx.status = 400;
            ctx.body = { code: 400, message: error.message };
        }
    }
}

module.exports = { CommonController };