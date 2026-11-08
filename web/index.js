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

encryptEl.addEventListener("click",()=>{
    axios.post(`http://localhost:${port}/encrypt`,{
        token: encryptWithPublicKey(publicKey, "123456"),
    }).then(res=>{
        console.log(res.data);
    })
})
