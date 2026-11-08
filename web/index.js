import axios from 'axios';
import { encryptWithPublicKey } from './helper.js';

const tokenEl = document.getElementById("token");
const publicKeyEl = document.getElementById("publicKey")
const encryptEl = document.getElementById("encrypt")

const port = 3000;

let publicKey = "";


tokenEl.addEventListener("click",()=>{
    axios.get(`http://localhost:${port}/token`,{withCredentials:true}).then(res=>{
        console.log(res.data);
    })
})

publicKeyEl.addEventListener("click",()=>{
    axios.post(`http://localhost:${port}/getPublicKey`,{}).then(res=>{
        console.log(res.data);
        publicKey = res.data.publicKey;
    })
})

encryptEl.addEventListener("click", async ()=>{
    try {
        // encryptWithPublicKey 现在是异步的，必须 await
        // 注意：不要 JSON.stringify，密文会被多包一层双引号导致 base64 解码错位
        const token = await encryptWithPublicKey(publicKey, "123456");
        console.log("encryptedData", token);
        const res = await axios.post(`http://localhost:${port}/encrypt`, { token });
        console.log(res.data);
    } catch (e) {
        console.error(e);
    }
})
