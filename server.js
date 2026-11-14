const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const static = require('koa-static');
const mainRouter = require('./routers/index.js');
const compress = require('koa-compress');

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
app.use(bodyParser({
    enableTypes: ['json', 'form', 'text'],
    jsonLimit: '1mb',
    formLimit: '56kb',
    parsedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'], // 默认只有 POST/PUT/PATCH
    includeUnparsed: true,                            // 需要原始 body 时打开
}));

// 4. 路由
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    headers: ['Content-Type'],
}));
app.use(compress({
    threshold: 1024,                                   // <1KB 不压，省得越压越大
    filter: (type) => /text|javascript|json|css|svg|xml/i.test(type), // 图片/字体跳过
    br: false,                                         // 只需 gzip 时关掉 brotli，省 CPU
}))
app.use(static('./dist'));
app.use(static('./static'));
app.use(mainRouter.routes()).use(mainRouter.allowedMethods());

app.listen(3002);
