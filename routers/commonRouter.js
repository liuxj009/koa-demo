const Router = require('@koa/router');
const { CommonController } = require('../controllers/commonController');

const router = new Router({ prefix: '/common' });
router.post("/getMd", CommonController.getMd)
module.exports = router;