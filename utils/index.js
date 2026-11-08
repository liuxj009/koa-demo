const crypto = require('crypto');


const getPublicKey = () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa',{
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
        },
        privateKeyEncoding: {
            type: "pkcs1",      // PKCS#1格式，适合解密/签名
            format: 'pem',
            cipher: 'aes-256-cbc', // 可选：对私钥文件本身进行加密保护
            passphrase: '123456' // 私钥保护密码
        }
    });
    return { publicKey, privateKey };
}

/**
 * 使用私钥解密数据
 * @param {string} privateKey - PEM格式的私钥
 * @param {string} encryptedData - Base64编码的密文
 * @param {string} passphrase - 私钥保护密码（如果生成时设置了）
 * @returns {string} 解密后的明文
 */
function decryptWithPrivateKey(privateKey, encryptedData, passphrase) {
    const buffer = Buffer.from(encryptedData, 'base64');

    const decrypted = crypto.privateDecrypt(
        {
            key: privateKey,
            passphrase: "123456", // 如果私钥有密码，必须提供
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        buffer
    );

    return decrypted.toString('utf-8');
}
module.exports = { getPublicKey, decryptWithPrivateKey };
