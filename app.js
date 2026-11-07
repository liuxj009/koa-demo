const http = require('node:http');
const {connection} = require('./database/connectMysql');
const pl1 = async (context,next)=>{
    console.log("pl1");
    await next();
    console.log("pl1 end");
    context.res.end("es pl1 end");
}

const pl2 = async (context,next)=>{
    console.log("pl2");
    await next();
    console.log("pl2 end");

}

const pl3 = async (context,next)=>{
    console.log("pl3");
     connection.query("select * from orders",(err,res)=>{
        if (err){
            console.log("query error",err);
        }
        console.log("query",res);
     });
}
const plugins = [
    pl1,
    pl2,
    pl3
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
    console.log("req",req);
    console.log("res",res);
    const context = {
        req,
        res,
    }
    compose(context);
}
const server = http.createServer(handleRequest);
server.listen(3100);
