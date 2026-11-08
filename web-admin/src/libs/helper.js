/**
 * 使用浏览器原生 Web Crypto API（crypto.subtle）做 RSA-OAEP 加密
 *
 * 与服务端 utils/index.js:31-39 的参数严格对齐：
 *   padding  : RSA_PKCS1_OAEP_PADDING  ←→  { name: 'RSA-OAEP' }
 *   oaepHash : 'sha256'                ←→  hash: 'SHA-256'
 *   key 格式 : spki (publicKeyEncoding.type) ←→ importKey 的 'spki'
 */

const PEM_BLOCK_RE = /-----BEGIN [^-]+-----|-----END [^-]+-----/g;
const PEM_PKCS1_RE = /-----BEGIN RSA PUBLIC KEY-----/;

/**
 * PEM 转 ArrayBuffer（去掉头尾和换行后做 base64 解码）
 * @param {string} pem
 * @returns {ArrayBuffer}
 */
function pemToArrayBuffer(pem) {
    const body = pem.replace(PEM_BLOCK_RE, '').replace(/\s+/g, '');

    if (!body) {
        throw new Error('公钥为空或格式非法，请先点击「获取公钥」');
    }

    let binary;
    try {
        binary = atob(body);
    } catch (e) {
        throw new Error('公钥不是合法的 PEM / base64 内容');
    }

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * ArrayBuffer 转 base64（逐字节拼接，避免大数组 spread 爆栈）
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * 使用公钥加密数据（RSA-OAEP + SHA-256）
 * @param {string} publicKey - PEM 格式公钥
 * @param {string} data - 待加密明文
 * @returns {Promise<string>} base64 编码的密文
 */
async function encryptWithPublicKey(publicKey, data) {
    debugger
    if (typeof publicKey !== 'string' || !publicKey.trim()) {
        throw new Error('公钥未设置，请先点击「获取公钥」');
    }

    // crypto.subtle 仅在 HTTPS 或 localhost 下可用（Secure Context 要求）
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle) {
        throw new Error('crypto.subtle 不可用：请通过 https 或 localhost 访问');
    }

    const format = PEM_PKCS1_RE.test(publicKey) ? 'pkcs1' : 'spki';

    const key = await subtle.importKey(
        format,
        pemToArrayBuffer(publicKey),
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
    );

    const encrypted = await subtle.encrypt(
        { name: 'RSA-OAEP' },
        key,
        new TextEncoder().encode(String(data))
    );

    return bufToBase64(encrypted);
}

export { encryptWithPublicKey };
