const Router = require('@koa/router');   
const router = new Router();
const { connection } = require('../database/connectMysql');

const crypto = require('crypto');

router.post("/token",async (context,next)=>{
    console.log("token");
    const res = await connection.query("select * from orders", (err, res) => {
        if (err) {
            console.log("query error", err);
        }
        console.log("query", res);
    });
    console.log("res",res);
    await next();
})

router.post("/getPublicKey", async (context, next) => {
    console.log("getPublicKey");
    await next();
})



module.exports = {router};
