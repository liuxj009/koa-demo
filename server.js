const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const { getPublicKey, decryptWithPrivateKey } = require('./utils/index.js');
const cors = require('@koa/cors');


const app = new Koa();

const { publicKey, privateKey } = getPublicKey();

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
const router = new Router();
router.get('/users/:id', async (ctx) => {
    ctx.body = { id: ctx.params.id, q: ctx.query };
});
router.post('/login', async (ctx) => {
    ctx.body = { id: ctx.params.id, q: ctx.query };
});
router.post('/getPublicKey', async (ctx) => {
    ctx.body = { publicKey, publicKey };
});
router.post('/encrypt', async (ctx) => {
    const { token } = ctx.request.body;
    console.log("token", token);
    const decryptData = decryptWithPrivateKey(privateKey, token, "123456");
    ctx.body = { publicKey, decryptData: decryptData.toString('utf-8') };
});

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    headers: ['Content-Type'],
    credentials: true,
}));
app.use(router.routes()).use(router.allowedMethods());

app.listen(3000);
