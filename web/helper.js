
import JSEncrypt from 'jsencrypt';


const encryptor = new JSEncrypt();

/**
 * 使用公钥加密数据
 * @param {string} publicKey - PEM格式的公钥字符串
 * @param {string} data - 待加密的明文数据
 * @returns {string|null} Base64编码的密文，失败返回null
 */
function encryptWithPublicKey(publicKey, data) {
    console.log("publicKey", publicKey);
    console.log("data", data);

    // 设置公钥
    // 注意：公钥格式通常为 -----BEGIN PUBLIC KEY----- ... -----END PUBLIC KEY-----
    encryptor.setPublicKey(publicKey);

    // 执行加密
    const encryptedData = encryptor.encrypt(data);

    if (!encryptedData) {
        console.error('加密失败，请检查公钥格式或数据长度');
        return null;
    }
    console.log("encryptedData", encryptedData);
    

    return encryptedData;
}

export { encryptWithPublicKey }
