const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const static = require('koa-static');
const mainRouter = require('./routers/index.js');


const app = new Koa();

app.silent = false;

// 1. 错误兜底（必须最前）
app.use(async (ctx, next) => {
    try {
        await next();
        if (ctx.status === 404 && !ctx.body) ctx.body = { code: 404, msg: 'Not Found' };
    } catch (e) {
        ctx.status = e.status || 500;
        ctx.body = { code: ctx.status, msg: e.expose ? e.message : 'Internal Error' };
        if (ctx.status >= 500) ctx.app.emit('error', e, ctx);
    }
});

// 2. 计时 / 请求 id
app.use(async (ctx, next) => {
    const start = Date.now();
    ctx.state.rid = crypto.randomUUID();
    await next();
    ctx.set('X-Response-Time', `${Date.now() - start}ms`);
});

// 3. body 解析
app.use(bodyParser());

// 4. 路由
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    headers: ['Content-Type'],
    credentials: true,
}));

app.use(static('./static'));
app.use(static('./static/dist'));
app.use(mainRouter.routes()).use(mainRouter.allowedMethods());

app.listen(3000);
