const crypto = require('crypto');

let publicKey = "";
let privateKey = "";

const getKeys = async () => {
    if(publicKey && privateKey){
        return { publicKey, privateKey };
    }
    const { publicKey: publicKeyStr, privateKey: privateKeyStr } = crypto.generateKeyPairSync('rsa', {
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
    publicKey = publicKeyStr;
    privateKey = privateKeyStr;
    return { publicKey, privateKey };
}
const decryptWithPrivateKey = (encryptedData) => {
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
const init = async () => {
    if(publicKey && privateKey){
        return;
    }
    const { publicKey, privateKey } = await getKeys();
    publicKey = publicKey;
    privateKey = privateKey;
}

module.exports = { getKeys, publicKey, decryptWithPrivateKey, init };
