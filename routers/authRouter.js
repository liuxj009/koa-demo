const Router = require('@koa/router');   
const { AuthController } = require('../controllers/authController');

const router = new Router({prefix: '/auth'});

router.post("/login", AuthController.login)

router.post("/getPublicKey", AuthController.getPublickKey)
router.post("/register", AuthController.register)



module.exports = router;
