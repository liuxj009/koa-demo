const Router = require('@koa/router');
const { GandController } = require('../controllers/gandController');

const router = new Router({ prefix: '/auth' });

router.post("/login", AuthController.login)

router.post("/getPublicKey", AuthController.getPublickKey)
router.post("/register", AuthController.register)



module.exports = router;
