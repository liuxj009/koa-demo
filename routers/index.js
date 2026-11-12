const Router = require('@koa/router');   
const authRouter = require('./authRouter');
const commonRouter = require('./commonRouter');


const router = new Router();

router.use(authRouter.routes());
router.use(commonRouter.routes());

module.exports = router;
