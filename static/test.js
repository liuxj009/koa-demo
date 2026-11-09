const nodePath = require('node:path');

console.log('test');
// 当前文件所在目录，__dirname D:\code\koa-demo\static
console.log("__dirname", __dirname);
// 当前‌进程‌启动的工作目录process.cwd() D:\code\koa-demo\services
console.log("process.cwd()", process.cwd());

const pathJoin = nodePath.join(process.cwd(), "../static");
console.log(pathJoin);
