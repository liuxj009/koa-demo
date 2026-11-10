const http = require('node:http');


class Koa {
    middleware = [];
    ctx = {};
    constructor() {
        this.app = [];
    }
    use(fn) {
        this.middleware.push(fn);
    }
    compose(_middleware){
        const _this = this;
        return ()=>{
            dispatch(0);
            function dispatch(i){
                if (i >= _middleware.length){
                    return Promise.resolve();
                }
                return Promise.resolve(_middleware[i](_this.ctx,()=>dispatch(i+1)));
            }
        }
    }
    callback() {
        const fn = this.compose(this.middleware);
        return (req,res)=>{
            const ctx = {
                req,
                res,
            };
            this.ctx = ctx;
            fn();
        }
    }
    listen(port) {
        const server = http.createServer(this.callback());
        server.listen(port, () => {
            console.log(`listen port ${port}`);
        });
    }
}




module.exports = Koa;
