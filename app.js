const Koa = require('./myKoa/index.js');
const url = require('node:url');

const app = new Koa();
app.use(async (ctx, next) => {
    try {
        console.log('start 0');
        await next();
        console.log('end 0');
    } catch (error) {
        console.log(error);
        ctx.res.end("网络异常");
    }
});
app.use(async (ctx, next) => {
    console.log('start 1');
    // await next();
    ctx.res.end('hello world');
    console.log('end 1');
});
app.use(async (ctx, next) => {
    console.log('start 2');
    await next();
    console.log('end 2');
});
app.listen(9999);