const Router = require('@koa/router');   
const authRouter = require('./authRouter');
const commonRouter = require('./commonRouter');
const util = require('util');


const router = new Router();

router.get('/testMysql',async (ctx) => {
    ctx.body = 'test';
});


router.use(authRouter.routes());
router.use(commonRouter.routes());

module.exports = router;
