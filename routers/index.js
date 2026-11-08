const Router = require('@koa/router');   
const authRouter = require('./authRouter');

const router = new Router();

router.use(authRouter.routes());


module.exports = router;
