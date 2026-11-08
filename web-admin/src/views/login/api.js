import axios from 'axios'
import config from '@/config'


let publicKey = ''

export const getPublicKey = async () => {
    if (publicKey) {
        return publicKey
    }
    const res = await axios.post(config.baseURL + `/auth/getPublicKey`,{})
    console.log("getPublicKey", res.data)
    publicKey = res.data
    return publicKey
}


export const login = (params) => {
    return axios.post(config.baseURL + `/auth/login`,params)
}