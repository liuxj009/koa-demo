const http = require('node:http');
const {router} = require('./routers/index.js');


const plugins  = [
    router.routes(),
]
const compose =  async (context)=>{
    let index = 0;
    const next = async () => {
        const nextPlugin = plugins[index];
        index++;
        if (nextPlugin) {
            await nextPlugin(context, next);
        }
    }
    await next();
}
const handleRequest = (req,res)=>{
    console.log("req",req.url);
    const context = {
        req,
        res,
    }
    compose(context);
}
const server = http.createServer(handleRequest);
server.listen(3100);
