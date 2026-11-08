const http = require('node:http');

const compose = ()=>{
    
}
class Koa {
    constructor(){
        this.plugins = [];
        this.ctx = {};
    }

    use(plugin){
        this.plugins.push(plugin);
    }
    callback(req,res){
        console.log("req",req);
        console.log("res",res);
        const context = {
            req,
            res,
        }
        compose(context);
    }

    listen(port){
        const server = http.createServer(this.callback);
        server.listen(port);
        console.log("listen port",port);
    }
}