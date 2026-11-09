# Node.js 学习笔记（核心模块与核心 API）

> 参考文档：[Node.js v8.x 中文文档](https://www.nodeapp.cn/)（nodeapp.cn）
> 整理日期：2026-11-09
> 适用工程：本仓库 `koa-demo`（Koa + Sequelize + MySQL）

---

## 目录

- [一、Node.js 概览](#一nodejs-概览)
- [二、模块索引](#二模块索引)
- [三、事件循环与异步模型](#三事件循环与异步模型)
- [四、核心模块详解](#四核心模块详解)
- [五、模块速查表](#五模块速查表)
- [六、在本项目 koa-demo 中的落地](#六在本项目-koa-demo-中的落地)
- [七、学习路线建议](#七学习路线建议)

---

## 一、Node.js 概览

Node.js 是一个基于 **Chrome V8** 引擎的 JavaScript 运行时环境，使用 **事件驱动、非阻塞 I/O** 模型。

核心特征：

| 特性 | 说明 | 踩坑提示 |
| --- | --- | --- |
| 单线程 + 事件循环 | JS 主线程只跑一个，I/O 交给 libuv 线程池 | CPU 密集任务（加密/压缩/大 JSON）必须丢到 `child_process` / `worker_threads` |
| 非阻塞 I/O | `fs.readFile` 等 API 立即返回，结果通过回调/事件送达 | 忘记 `await` / 忘记处理回调异常 → 进程静默挂起 |
| 事件驱动 | 一切皆 EventEmitter：`http.Server`、`net.Socket`、`fs.ReadStream` 都继承它 | `error` 事件不监听会直接抛未捕获异常 |
| 模块系统 | CommonJS（`require`/`module.exports`）为主，ESM（`import`）并行 | 同名文件 `a.js` 与 `a/` 同名目录的加载优先级要小心 |
| npm 生态 | 全球最大的开源库生态 | 生产环境锁定版本，务必提交 `package-lock.json` / `pnpm-lock.yaml` |

### 环境与版本

```bash
node -v            # 查看 Node 版本
npm -v             # 查看 npm 版本
npx nodemon app.js # 开发时热重启
```

> 本文档基于 **Node.js v8.x** 中文文档整理，v8 之后新增的 API（如 `fs.promises`、`util.promisify`、`worker_threads`）会在正文中单独标注。

---

## 二、模块索引

Node.js 内置模块按用途可分为五类：

| 分类 | 模块 | 用途 |
| --- | --- | --- |
| 基础工具 | `path` `os` `util` `url` `querystring` `string_decoder` `punycode` `console` | 路径拼接、系统信息、格式化、URL 解析、控制台输出 |
| 文件与流 | `fs` `buffer` `stream` `zlib` | 文件读写、二进制处理、流式管道、压缩 |
| 运行时 | `events` `timers` `process` `globals` `assert` `module` `v8` `perf_hooks` | 事件、定时器、进程信息、全局变量、断言、模块加载、性能观测 |
| 网络 | `http` `https` `http2` `net` `dns` `dgram` | HTTP 服务/客户端、TCP、UDP、DNS 解析 |
| 进阶 | `crypto` `child_process` `cluster` `readline` `tty` `vm` `async_hooks` | 加解密、子进程、集群、命令行交互、代码沙箱、异步钩子 |

Node.js 中模块的引入方式（CommonJS）：

```js
// 1. 引入整个模块
const fs = require('fs');

// 2. 引入模块中的某个 API
const { readFile, writeFile } = require('fs/promises'); // Node 10+

// 3. 重命名 / 明确内置模块前缀
const path = require('path');
const nodePath = require('node:path'); // Node 14.18+ 推荐写法
```

---

## 三、事件循环与异步模型

理解 Node 的关键：**代码执行顺序 ≠ 回调执行顺序**。

```js
const fs = require('fs');

console.log('1 同步代码');

setTimeout(() => console.log('5 setTimeout 宏任务'), 0);
setImmediate(() => console.log('4 setImmediate 宏任务'));
process.nextTick(() => console.log('3 nextTick 微任务（优先级最高）'));
Promise.resolve().then(() => console.log('2 Promise 微任务'));

fs.readFile(__filename, () => console.log('6 I/O 回调'));
```

**输出顺序（几乎总是）**：

```
1 同步代码
3 nextTick 微任务（优先级最高）
2 Promise 微任务
5 setTimeout 宏任务
4 setImmediate 宏任务
6 I/O 回调
```

阶段顺序（每次循环）：

1. **timers** 阶段 → 执行到期的 `setTimeout` / `setInterval`
2. **pending callbacks** 阶段 → 上一次的 I/O 回调
3. **idle / prepare** 阶段
4. **poll** 阶段 → 检索新的 I/O 事件；没有定时器到期时在此阻塞等待
5. **check** 阶段 → 执行 `setImmediate` 回调
6. **close callbacks** 阶段 → 关闭事件（如 `socket` 的 `close`）

**关键规则**：

- `process.nextTick` 队列在**每个宏任务之间**被清空，优先级高于 Promise。
- 微任务（Promise、async/await 后的 `then`）在当前宏任务执行完后立刻清空。
- `setTimeout(fn, 0)` 会被最小化到 1ms，且不保证精确；耗时任务不要用定时器做调度。

### 回调地狱与 Promise 化

```js
const fs = require('fs');
const { promisify } = require('util');

// 1. 手动 Promise 化
function readFileAsync(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, data) => (err ? reject(err) : resolve(data)));
  });
}

// 2. 使用 util.promisify（Node 8+）
const readFile = promisify(fs.readFile);

async function main() {
  try {
    const content = await readFile(__filename, 'utf8');
    console.log(content.length);
  } catch (err) {
    console.error('读取失败:', err.message);
  }
}
main();
```

> ⚠️ Node 8 中 `util.promisify` 需要自定义解析器才能处理多参数回调（如 `fs.read`），Node 10+ 可直接用 `fs.promises`。

---

## 四、核心模块详解

**基础工具模块：path / os / util / url / querystring / string_decoder / punycode / console**

### path（路径）

`path` 模块提供处理文件与目录路径的工具函数，其行为会随运行平台（Windows / POSIX）自动变化。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `path.join(...paths)` | 路径片段序列（`<string>`） | 用平台分隔符连接并规范化后的路径；全为空则返回 `'.'` |
| `path.resolve(...paths)` | 路径或路径片段序列 | 解析出的绝对路径；从右往左处理，未构成绝对路径时使用当前工作目录 |
| `path.basename(path[, ext])` | `path`：`<string>`；`ext`：可选扩展名 | 路径的最后一部分；`ext` 给出时会被剥离 |
| `path.dirname(path)` | `path`：`<string>` | 路径的目录名 |
| `path.extname(path)` | `path`：`<string>` | 扩展名（含 `.`）；无扩展名或以 `.` 开头时返回空字符串 |
| `path.parse(path)` | `path`：`<string>` | 含 `root`/`dir`/`base`/`name`/`ext` 的对象 |
| `path.format(pathObject)` | `pathObject`：`<Object>` | 由对象拼回的路径字符串（`parse` 的逆操作） |
| `path.isAbsolute(path)` | `path`：`<string>` | 是否为绝对路径的布尔值；空字符串返回 `false` |
| `path.normalize(path)` | `path`：`<string>` | 规范化后的路径，解析 `.` 与 `..`；空字符串返回 `'.'` |
| `path.relative(from, to)` | `from`/`to`：`<string>` | 从 `from` 到 `to` 的相对路径 |
| `path.sep` | 无 | 平台特定的路径分隔符（Windows 为 `\`，POSIX 为 `/`） |
| `path.delimiter` | 无 | 平台特定的路径分隔符（Windows 为 `;`，POSIX 为 `:`） |
| `path.win32` | 无 | 针对 Windows 风格的 path 方法实现（`<Object>`） |
| `path.posix` | 无 | 针对 POSIX 风格的 path 方法实现（`<Object>`） |

精确签名：

```
path.basename(path[, ext])            // <string>
path.delimiter                         // <string>
path.dirname(path)                     // <string>
path.extname(path)                     // <string>
path.format(pathObject)                // <string>
path.isAbsolute(path)                  // <boolean>
path.join([...paths])                  // <string>
path.normalize(path)                   // <string>
path.parse(path)                       // <Object>
path.posix                             // <Object>
path.relative(from, to)                // <string>
path.resolve([...paths])               // <string>
path.sep                               // <string>
path.win32                             // <Object>
```

#### Demo

```js
const path = require('path');

// 1) 拼接与解析
const full = path.join('/foo', 'bar', 'baz/asdf', 'quux', '..');
console.log(full);                       // /foo/bar/baz/asdf

const info = path.parse('/home/user/dir/file.txt');
console.log(info);
// { root: '/', dir: '/home/user/dir', base: 'file.txt', ext: '.txt', name: 'file' }

// 2) 由对象反推路径（parse 的逆操作）
console.log(path.format({ dir: '/home/user/dir', base: 'file.txt' }));
// /home/user/dir/file.txt

// 3) 绝对化与相对化
console.log(path.resolve('/foo/bar', './baz'));                 // /foo/bar/baz
console.log(path.relative('/data/orandea/test/aaa', '/data/orandea/impl/bbb'));
// ../../impl/bbb

// 4) 扩展名与是否绝对路径
console.log(path.extname('index.coffee.md')); // .md
console.log(path.isAbsolute('/foo/bar'));     // true
console.log(path.isAbsolute('qux/'));          // false

// 5) 跨平台一致性：用 path.win32 / path.posix 固定风格
console.log(path.win32.basename('C:\\temp\\myfile.html')); // myfile.html
console.log(path.posix.basename('/tmp/myfile.html'));      // myfile.html
console.log(path.sep === '\\' ? 'Windows 分隔符' : 'POSIX 分隔符');
```

#### 注意事项

- `path` 的默认行为跟随运行平台：在 POSIX 上 `path.basename('C:\\temp\\myfile.html')` 返回整串 `C:\temp\myfile.html`，只有在 Windows 上才返回 `myfile.html`。要得到一致结果请显式使用 `path.win32` 或 `path.posix`。
- 自 v6.0.0 起，`path` 的多数方法传入非字符串参数会直接抛出 `TypeError`（如 `path.join('foo', {}, 'bar')` 抛 `TypeError: Path must be a string.`）。
- Windows 上 `path.sep` 是 `\`，但 `/` 与 `\` 都能作为分隔符被识别；不过 path 的方法**只会输出反斜杠**。
- `path.join()` 与 `path.resolve()` 不同：`join` 不基于当前工作目录，`resolve` 会；`resolve` 得到的路径是规范化的且末尾斜杠被删除（除非解析为根目录）。
- `path.format()` 中属性有优先级：提供了 `dir` 则忽略 `root`；提供了 `base` 则忽略 `ext` 和 `name`。
- Windows 上 Node.js 遵循“单驱动器工作目录”，`fs.readdirSync('c:\\')` 与 `fs.readdirSync('c:')` 结果可能不同。
- `path.delimiter` 用于拆分环境变量 `PATH`，Windows 为 `;`，POSIX 为 `:`。

### os（操作系统）

`os` 模块提供一组与操作系统相关的实用方法，可获取系统信息、资源负载与网络接口等。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `os.EOL` | 无 | 行末标志常量（POSIX 为 `\n`，Windows 为 `\r\n`） |
| `os.arch()` | 无 | 二进制编译所用的 CPU 架构字符串，如 `'x64'`、`'arm64'`（等价于 `process.arch`） |
| `os.platform()` | 无 | 编译时的操作系统平台，如 `'linux'`、`'darwin'`、`'win32'`（等价于 `process.platform`） |
| `os.type()` | 无 | 操作系统名字，如 `'Linux'`、`'Darwin'`、`'Windows_NT'` |
| `os.release()` | 无 | 操作系统发行版字符串 |
| `os.hostname()` | 无 | 主机名字符串 |
| `os.endianness()` | 无 | 字节序：`'BE'` 大端 / `'LE'` 小端 |
| `os.cpus()` | 无 | 每个逻辑 CPU 核心信息的对象数组（`model`/`speed`/`times`） |
| `os.totalmem()` | 无 | 全部系统内存的字节数（整数） |
| `os.freemem()` | 无 | 空闲系统内存的字节数（整数） |
| `os.uptime()` | 无 | 系统上线秒数（整数） |
| `os.loadavg()` | 无 | 1、5、15 分钟平均负载数组；Windows 上恒为 `[0, 0, 0]` |
| `os.homedir()` | 无 | 当前用户的 home 目录字符串 |
| `os.tmpdir()` | 无 | 操作系统默认临时目录字符串 |
| `os.userInfo([options])` | `options.encoding`：结果字符串编码，默认 `'utf8'` | 含 `username`/`uid`/`gid`/`shell`/`homedir` 的对象；Windows 上 `uid`/`gid` 为 `-1`、`shell` 为 `null` |
| `os.networkInterfaces()` | 无 | 以网络接口名为键、地址数组为值的对象 |
| `os.constants` | 无 | 包含错误码、信号等操作系统特定常量的对象（`<Object>`） |

精确签名：

```
os.EOL                                  // <string>
os.arch()                               // <string>
os.constants                            // <Object>
os.cpus()                               // <Array>
os.endianness()                         // <string>
os.freemem()                            // <integer>
os.homedir()                            // <string>
os.hostname()                           // <string>
os.loadavg()                            // <Array>
os.networkInterfaces()                  // <Object>
os.platform()                           // <string>
os.release()                            // <string>
os.tmpdir()                             // <string>
os.totalmem()                           // <integer>
os.type()                               // <string>
os.uptime()                             // <integer>
os.userInfo([options])                  // <Object>
```

#### Demo

```js
const os = require('os');

console.log('平台:', os.platform(), '| 架构:', os.arch());
console.log('系统类型:', os.type(), '| 发行版:', os.release());
console.log('主机名:', os.hostname(), '| 字节序:', os.endianness());
console.log('行末符:', JSON.stringify(os.EOL));
console.log('用户:', os.userInfo().username, '| home:', os.homedir());
console.log('临时目录:', os.tmpdir());

// 内存与运行时间
const mb = 1024 * 1024;
console.log('总内存:', (os.totalmem() / mb).toFixed(0), 'MB');
console.log('空闲内存:', (os.freemem() / mb).toFixed(0), 'MB');
console.log('已运行:', Math.floor(os.uptime()), '秒');
console.log('平均负载:', os.loadavg());

// CPU 信息
os.cpus().forEach((cpu, i) => {
  console.log(`CPU#${i}: ${cpu.model} @ ${cpu.speed}MHz`);
});

// 网络接口
const nets = os.networkInterfaces();
Object.keys(nets).forEach((name) => {
  nets[name].forEach((addr) => {
    if (!addr.internal) {
      console.log(`${name} -> ${addr.address} (${addr.family})`);
    }
  });
});
```

#### 注意事项

- `os.platform()` / `os.arch()` 描述的是 **Node.js 二进制编译时的**平台与架构，不完全等于当前运行时环境；若在 Android 上构建，可能返回 `'android'`（文档标注为实验特性）。
- `os.cpus()` 中每个 CPU 对象的 `times` 包含 `user`/`nice`/`sys`/`idle`/`irq`（毫秒）。`nice` 是 UNIX 相关概念，在 Windows 上所有处理器的 `nice` 恒为 `0`。
- `os.loadavg()` 是 UNIX 概念，Windows 上返回值总是 `[0, 0, 0]`，不能用它判断 Windows 负载。
- `os.uptime()` 在 Windows 上返回的秒值**包含小数**，需要 `Math.floor()` 取整。
- `os.userInfo().homedir` 与 `os.homedir()` 来源不同：前者由操作系统直接提供，后者是 `os.userInfo()` 在请求环境变量之前先向操作系统索取 home 目录，二者结果可能不同。
- `os.constants` 中的常量并非在每个操作系统上都可用；信号常量在 `os.constants.signals`，POSIX 错误常量在 `os.constants.errno`，Windows 特有错误常量如 `WSAEACCES` 等也在其中。
- `os.tmpdir()` 自 v2.0.0 起跨平台统一，不再返回带尾部斜杠的路径。

### util（实用工具）

`util` 模块为 Node.js 内部 API 提供支撑，其中的格式化、检查与 Promise 转换工具也常被应用程序直接使用。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `util.format(format[, ...args])` | 第一个参数为类 printf 格式字符串 | 格式化后的字符串；占位符 `%s` `%d` `%i` `%f` `%j` `%o` `%O` `%%` |
| `util.inspect(object[, options])` | `object`：任意值；`options`：见下 | 对象的字符串表示，用于调试 |
| `util.promisify(original)` | `original`：`<Function>`（回调在最后一个参数） | 返回 Promise 的函数 |
| `util.callbackify(original)` | `original`：`<Function>`（async 函数或返回 Promise 的函数） | 异常优先（`(err, value) => ...`）回调风格函数 |
| `util.deprecate(function, string)` | `function`：待包装函数；`string`：废弃提示 | 包装后的函数，调用时触发 `DeprecationWarning` |
| `util.debuglog(section)` | `section`：`<string>` 段名 | 条件写 stderr 的日志函数，受 `NODE_DEBUG` 控制 |
| `util.inherits(constructor, superConstructor)` | 两个构造函数 | 继承原型方法；**官方不建议使用**，请改用 ES6 `class`/`extends` |
| `util.inspect.custom` | 无 | 用于声明自定义查看函数的 `Symbol` |
| `util.inspect.defaultOptions` | 无 | 用于修改 `util.inspect` 默认选项的对象 |
| `util.promisify.custom` | 无 | 用于声明自定义 promisify 变体的 `Symbol` |
| `new util.TextDecoder([encoding[, options]])` | `encoding` 默认 `'utf-8'`；`options.fatal`、`options.ignoreBOM` | WHATWG `TextDecoder` 实例 |
| `new util.TextEncoder()` | 无 | WHATWG `TextEncoder` 实例，仅支持 UTF-8 |

精确签名：

```
util.callbackify(original)                  // <Function>
util.debuglog(section)                      // <Function>
util.deprecate(function, string)            // <Function>
util.format(format[, ...args])              // <string>
util.inherits(constructor, superConstructor)
util.inspect(object[, options])             // <string>
util.inspect.custom                         // <Symbol>
util.inspect.defaultOptions                 // <Object>
util.promisify(original)                    // <Function>
util.promisify.custom                       // <symbol>
new util.TextDecoder([encoding[, options]])
textDecoder.decode([input[, options]])      // <string>
new util.TextEncoder()
textEncoder.encode([input])                 // <Uint8Array>
```

#### Demo

```js
const util = require('util');
const fs = require('fs');

// 1) 格式化
console.log(util.format('%s:%s', 'foo'));        // foo:%s
console.log(util.format('%s:%s', 'foo', 'bar', 'baz')); // foo:bar baz
console.log(util.format(1, 2, 3));               // '1 2 3'

// 2) 检查对象（options 可控深度、颜色、数组截断）
console.log(util.inspect({ a: 1, b: { c: { d: { e: 1 } } } }, { depth: 3 }));
util.inspect.defaultOptions.maxArrayLength = null; // 之后不再截断长数组

// 3) 回调 -> Promise
const stat = util.promisify(fs.stat);
stat('.').then((stats) => console.log('uid:', stats.uid));

// 4) Promise -> 回调
async function hello() { return 'hello world'; }
util.callbackify(hello)((err, ret) => {
  if (err) throw err;
  console.log(ret);   // hello world
});

// 5) 标记废弃 API
exports.puts = util.deprecate(function () {
  for (let i = 0, len = arguments.length; i < len; ++i) {
    process.stdout.write(arguments[i] + '\n');
  }
}, 'util.puts: 使用 console.log 代替');

// 6) 调试日志：NODE_DEBUG=foo node demo.js 时才会输出
const debuglog = util.debuglog('foo');
debuglog('hello from foo [%d]', 123);
```

#### 注意事项

- `util.format()` 只在**第一个参数是字符串**时才做占位符替换；若第一个参数不是字符串，所有参数都会经 `util.inspect()` 后用空格拼接。占位符没有对应参数时不被替换（`util.format('%s:%s', 'foo')` 得到 `'foo:%s'`）。
- `%o` 相当于 `util.inspect(obj, { showHidden: true, depth: 4, showProxy: true })`（含不可枚举属性）；`%O` 相当于不带 options 的 `util.inspect()`。这两个占位符自 v8.4.0 起才支持。
- `util.deprecate()` **默认只在首次调用时**打印一次警告到 stderr（通过 `process.on('warning')` 触发 `DeprecationWarning`）。`--no-deprecation` / `--no-warnings` / `process.noDeprecation` 可完全禁用；`--trace-deprecation` 会附带堆栈；`--throw-deprecation` 会直接抛异常，且优先级高于 `--trace-deprecation`。
- `util.inherits()` 已被官方标注为**不建议使用**，且与 ES6 `class`/`extends` **语义不兼容**（`util.inherits` 不会调用父构造函数）。请优先使用 ES6 class。
- `util.promisify()` 假定原函数最后一个参数是回调；若不是，返回函数的返回值为 `undefined`。若 `original[util.promisify.custom]` 存在，`promisify` 直接返回它；若该属性不是函数，`promisify()` 会抛错。
- `util.callbackify()` 的回调是**异步执行**的；若回调中抛出异常且未被捕获，会触发 `uncaughtException` 并使进程退出。当 Promise 以 `null` reject 时，错误会被包装为 `Error`，原值在 `err.reason` 上。
- `util.inspect()` 的 `depth` 默认是 `2`，`maxArrayLength` 默认 `100`（长数组会被截断），`breakLength` 默认 `60`；设为 `null` 表示不限制。对象可实现 `[util.inspect.custom](depth, opts)` 来自定义显示。
- `util` 中有一批已废弃 API：`util.isArray` / `isBoolean` / `isBuffer` / `isDate` / `isError` / `isFunction` / `isNull` / `isNullOrUndefined` / `isNumber` / `isObject` / `isPrimitive` / `isRegExp` / `isString` / `isSymbol` / `isUndefined`（v4.0.0 废弃）、`util._extend`（用 `Object.assign()` 代替）、`util.debug` / `util.error`（用 `console.error()` 代替）、`util.log`（用第三方模块）、`util.print` / `util.puts`（用 `console.log()` 代替）。
- `util.TextDecoder` / `util.TextEncoder` 为 WHATWG 标准实现，仅在 v8.3.0 之后提供；`TextEncoder` 只支持 UTF-8，而 `TextDecoder` 的可用编码集取决于 Node.js 是否编译时启用 ICU（无 ICU 时仅支持 `utf-8` 与 `utf-16le`）。

### url（URL）

`url` 模块提供 URL 处理与解析工具，包含遗留 API 与符合 WHATWG 标准的 API 两套。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `new URL(input[, base])` | `input`：`<string>`；`base`：`<string>`\|`<URL>`，相对 URL 的基准 | 新的 `URL` 对象；无效 URL 抛 `TypeError` |
| `url.hash` | 可读写 `<string>` | URL 的 hash 部分（含 `#`） |
| `url.host` | 可读写 `<string>` | 主机名 + 端口 |
| `url.hostname` | 可读写 `<string>` | 主机名（不含端口） |
| `url.href` | 可读写 `<string>` | 序列化后的完整 URL；赋无效值抛 `TypeError` |
| `url.origin` | 只读 `<string>` | origin（protocol + host，不含用户名密码） |
| `url.username` / `url.password` | 可读写 `<string>` | 用户名 / 密码部分 |
| `url.pathname` | 可读写 `<string>` | 路径部分 |
| `url.port` | 可读写 `<string>` | 端口部分；默认端口会变为空字符串 |
| `url.protocol` | 可读写 `<string>` | 协议部分（含 `:`） |
| `url.search` | 可读写 `<string>` | 序列化的查询部分（含 `?`） |
| `url.searchParams` | 只读 `<URLSearchParams>` | 查询参数对象 |
| `url.toString()` / `url.toJSON()` | 无 | 序列化 URL，与 `url.href` 相同 |
| `url.format(URL[, options])` | `options`：`auth`/`fragment`/`search`/`unicode` | 可定制序列化的 URL 字符串 |
| `url.domainToASCII(domain)` / `url.domainToUnicode(domain)` | `domain`：`<string>` | Punycode ASCII / Unicode 形式；无效域名返回空字符串 |
| `url.parse(urlString[, parseQueryString[, slashesDenoteHost]])` | 三个可选参数 | 遗留的 urlObject |
| `url.format(urlObject)` | urlObject 或字符串 | 由对象拼回的 URL 字符串 |
| `url.resolve(from, to)` | `from`：基础 URL；`to`：目标 URL | 解析后的绝对 URL 字符串 |

精确签名：

```
new URL(input[, base])
url.hash; url.host; url.hostname; url.href; url.origin
url.username; url.password; url.pathname; url.port
url.protocol; url.search; url.searchParams
url.toString()                            // <string>
url.toJSON()                              // <string>
url.domainToASCII(domain)                 // <string>
url.domainToUnicode(domain)               // <string>
url.format(URL[, options])                // <string>
url.format(urlObject)                     // <string>
url.parse(urlString[, parseQueryString[, slashesDenoteHost]])
url.resolve(from, to)                     // <string>
```

#### Demo

```js
const { URL, URLSearchParams } = require('url');

// 1) WHATWG API 解析
const myURL = new URL('https://user:pass@sub.host.com:8080/p/a/t/h?query=string#hash');
console.log(myURL.protocol);   // https:
console.log(myURL.hostname);   // sub.host.com
console.log(myURL.port);       // 8080
console.log(myURL.pathname);   // /p/a/t/h
console.log(myURL.search);     // ?query=string
console.log(myURL.hash);       // #hash
console.log(myURL.origin);     // https://sub.host.com

// 2) 相对 URL + base
console.log(new URL('/foo', 'https://example.org/').href); // https://example.org/foo

// 3) 修改属性
myURL.pathname = '/abcdef';
myURL.hash = 'baz';
console.log(myURL.href);        // https://user:pass@sub.host.com:8080/abcdef?query=string#baz

// 4) 查询参数
myURL.searchParams.append('abc', 'xyz');
console.log(myURL.searchParams.get('abc')); // xyz
myURL.searchParams.set('a', 'b');
console.log(myURL.href);

// 5) 国际化域名（需编译时启用 ICU）
console.log(new URL('https://你好你好').hostname); // xn--6qqa088eba

// 6) 遗留 API
const url = require('url');
const legacy = url.parse('http://user:pass@sub.host.com:8080/p/a/t/h?query=string#hash');
console.log(legacy.host, legacy.pathname, legacy.hash);
console.log(url.resolve('/one/two/three', 'four')); // /one/two/four
```

#### 注意事项

- `url` 提供两套 API：遗留的 `url.parse()` / `url.format(urlObject)` 与 WHATWG 的 `URL` / `URLSearchParams`。遗留 API **并未被废弃**，保留只是为了向后兼容，新代码应使用 WHATWG API。
- 遗留 API 与 WHATWG API 的属性结构不同：WHATWG 的 `origin` 只含 protocol 与 host，**不含** username/password；遗留的 `urlObject.query` 默认是未解码字符串，只有传入 `parseQueryString = true` 才会通过 `querystring.parse()` 生成对象（此时键值都解码）。
- `URL` 对象的所有属性都是原型上的 getter/setter，用 `delete myURL.protocol` **没有任何效果**，但仍返回 `true`。
- `url.searchParams` 是只读的；要整体替换查询串请给 `url.search` 赋值。
- 设置 `url.port` 时：默认端口（https 为 443）会被转成空字符串；完全无效的字符串被忽略；以数字开头的字符串会取开头数字部分；非整数被截取；超出范围（0~65535）的数字被忽略。
- 设置 `url.host` / `url.hostname` / `url.protocol` 时若值无效，该值会被**静默忽略**；而设置 `url.href` 为无效 URL 会抛 `TypeError`。
- `url.toString()` 与 `url.href` **不允许自定义**序列化过程，需要更灵活的输出请用 `url.format(URL[, options])`。
- 两套 API 的百分号编码规则不同：遗留 API 会自动转义空格及 `< > " \` \r \n \t { } | \ ^ '`；WHATWG API 使用三个“百分比编码集”（C0 control / path / userinfo），规则更精细，因此同样输入在两套 API 下得到的编码结果可能不同。
- 主机名中的非 ASCII 字符会经 Punycode 编码，但主机名可能同时包含 Punycode 与百分号编码字符（如 `https://%CF%80.com/foo` 的 `href` 为 `https://xn--1xa.com/foo`，而 `origin` 为 `https://π.com`）。
- 国际化域名的 Punycode 转换**仅在 Node.js 编译时启用 ICU**才生效，否则域名原样透传。
- `URLSearchParams` 与 `querystring` 目的相似，但 `querystring` 更通用（可自定义 `&` 和 `=` 分隔符），而 `URLSearchParams` 专为 URL 查询字符串设计；此外 `new URLSearchParams(obj)` **不允许重复键**，数组值会用 `array.toString()` 用逗号连接（`query=first%2Csecond`），而用 iterable 构造则允许重复键。
- `url.resolve(from, to)` 是遗留 API 中做相对链接解析的入口，等价于 WHATWG 的 `new URL(to, from)`。

### querystring（查询字符串）

`querystring` 模块提供解析与格式化 URL 查询字符串的实用函数。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `querystring.parse(str[, sep[, eq[, options]]])` | `str`：`<string>`；`sep` 默认 `'&'`；`eq` 默认 `'='`；`options.decodeURIComponent`、`options.maxKeys`（默认 1000，0 表示不限制） | 键值对对象；同名键的值为数组 |
| `querystring.stringify(obj[, sep[, eq[, options]]])` | `obj`：`<Object>`；`sep` 默认 `'&'`；`eq` 默认 `'='`；`options.encodeURIComponent` | 序列化后的查询字符串 |
| `querystring.escape(str)` | `str`：`<string>` | URL 编码后的字符串（供 `stringify` 使用，可被重写） |
| `querystring.unescape(str)` | `str`：`<string>` | 解码后的字符串（供 `parse` 使用，可被重写） |

精确签名：

```
querystring.escape(str)                              // <string>
querystring.parse(str[, sep[, eq[, options]]])       // <Object>
querystring.stringify(obj[, sep[, eq[, options]]])   // <string>
querystring.unescape(str)                            // <string>
```

#### Demo

```js
const querystring = require('querystring');

// 1) 解析
const parsed = querystring.parse('foo=bar&abc=xyz&abc=123');
console.log(parsed);
// { foo: 'bar', abc: [ 'xyz', '123' ] }
console.log(parsed.foo);   // bar
console.log(parsed.abc);   // [ 'xyz', '123' ]

// 2) 序列化
console.log(querystring.stringify({ foo: 'bar', baz: ['qux', 'quux'], corge: '' }));
// 'foo=bar&baz=qux&baz=quux&corge='

// 3) 自定义分隔符
console.log(querystring.stringify({ foo: 'bar', baz: 'qux' }, ';', ':'));
// 'foo:bar;baz:qux'
console.log(querystring.parse('foo:bar;baz:qux', ';', ':'));
// { foo: 'bar', baz: 'qux' }

// 4) 手动编解码
console.log(querystring.escape('a b&c'));   // 'a%20b%26c'
console.log(querystring.unescape('a%20b%26c')); // 'a b&c'

// 5) 限制解析的键数量（默认 1000，0 表示不限制）
console.log(querystring.parse('a=1&b=2', '&', '=', { maxKeys: 1 })); // { a: '1' }
```

#### 注意事项

- `querystring.parse()` 返回的对象**不继承自 `Object.prototype`**（自 v6.0.0 起），因此 `obj.toString()`、`obj.hasOwnProperty()` 等方法不可用，做类型判断时不要直接调用。
- 默认按 UTF-8 编码解析；若使用其他编码（如 GBK），需通过 `options.decodeURIComponent` 指定解码函数；`stringify` 同理可用 `options.encodeURIComponent`。
- `querystring.parse()` 的 `maxKeys` 默认为 `1000`，指定为 `0` 表示不限制；超出的键会被丢弃。
- `querystring.stringify()` 只序列化值为 `string` / `number` / `boolean` 或其数组的属性，其他类型的值会被**强制转换为空字符串**。
- `escape()` / `unescape()` 开放出来主要是为了允许用户**重写编码/解码实现**（给 `querystring.escape` 赋一个自定义函数），通常不直接调用。
- 自 v8.0.0 起，多个空条目（如 `&=&=`）能被正确解析；`eq` 参数自 v6.0.0 起可有多于一个字符。
- `querystring` 与 `URLSearchParams` 用途相近但定位不同：`querystring` 更通用（可自定义分隔符），`URLSearchParams` 专用于 URL 查询字符串；选用时注意 `querystring.parse` 返回的是**无原型对象**。

### string_decoder（字符串解码器）

`string_decoder` 模块把 Buffer 解码成字符串，同时保留被截断的多字节 UTF-8 / UTF-16 字符。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `new StringDecoder([encoding])` | `encoding`：`<string>`，默认 `'utf8'` | 新的 StringDecoder 实例 |
| `stringDecoder.write(buffer)` | `buffer`：`<Buffer>` | 解码后的字符串；末尾残缺的多字节字符被缓存到内部 buffer |
| `stringDecoder.end([buffer])` | `buffer`：可选的 `<Buffer>` | 内部 buffer 中剩余字节解码出的字符串；给定 `buffer` 时会先再执行一次 `write()` |

精确签名：

```
new StringDecoder([encoding])       // encoding 默认 'utf8'
stringDecoder.write(buffer)         // <string>
stringDecoder.end([buffer])         // <string>
```

#### Demo

```js
const { StringDecoder } = require('string_decoder');

// 1) 基本用法：分多次写入完整的多字节字符
const decoder = new StringDecoder('utf8');

const cent = Buffer.from([0xC2, 0xA2]);
console.log(decoder.write(cent));    // ¢

const euro = Buffer.from([0xE2, 0x82, 0xAC]);
console.log(decoder.write(euro));    // €

// 2) 欧元符号的 3 个 UTF-8 字节被拆成三次写入
const d2 = new StringDecoder('utf8');
d2.write(Buffer.from([0xE2]));      // 输出 ''（残缺字节被缓存）
d2.write(Buffer.from([0x82]));      // 输出 ''（仍不完整）
console.log(d2.end(Buffer.from([0xAC])));  // €

// 3) 在 TCP 分片场景中配合 net 使用，避免出现乱码
const net = require('net');
const server = net.createServer((socket) => {
  const sd = new StringDecoder('utf8');
  socket.on('data', (chunk) => {
    const text = sd.write(chunk);   // 一定是完整的 UTF-8 字符
    if (text) process.stdout.write(text);
  });
  socket.on('end', () => process.stdout.write(sd.end()));
});
```

#### 注意事项

- 直接使用 `buffer.toString('utf8')` 在多字节字符被切断时会产生乱码（`�`）；`StringDecoder` 内部用 buffer 缓存残缺字节，直到下一次 `write()` 或 `end()` 才吐出。
- `stringDecoder.write()` 返回的字符串**一定不包含残缺的多字节字符**；`stringDecoder.end()` 返回内部 buffer 中剩余字节的解码结果，残缺的 UTF-8 / UTF-16 字节会被替换成符合字符编码的替换字符。
- `end(buffer)` 若传入了 `buffer`，会**先执行一次 `write()`** 再返回剩余字节，因此常用于“最后一段数据 + 收尾”的写法。
- 自 v8.0.0 起，每个非法字符只被替换为**一个**替换字符，而不再是对每个字节各替换一次。
- 默认编码是 `'utf8'`；`new StringDecoder()` 不传参数即为 UTF-8。
- `StringDecoder` 是流式分片处理的工具，不能用它去解码一段本身就不完整的字节序列并期望得到原文——那部分内容永远只能得到替换字符。

### punycode（Punycode）

`punycode` 模块是 RFC 3492 Punycode 标准的简单实现，用于在国际化域名（IDN）与 ASCII 之间转换；该模块自 v7.0.0 起已被标记废弃。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `punycode.encode(string)` | `string`：Unicode 码点组成的字符串 | 纯 ASCII 的 Punycode 字符串 |
| `punycode.decode(string)` | `string`：纯 ASCII 的 Punycode 字符串 | 等价的 Unicode 码点字符串 |
| `punycode.toASCII(domain)` | `domain`：`<string>` | Punycode 形式的域名，只转换非 ASCII 部分 |
| `punycode.toUnicode(domain)` | `domain`：`<string>` | Unicode 形式的域名，只转换 Punycode 部分 |
| `punycode.ucs2.decode(string)` | `string`：`<string>` | 各 Unicode 符号的数值码点数组 |
| `punycode.ucs2.encode(codePoints)` | `codePoints`：`<Array>` 数值码点数组 | 由码点数组生成的字符串 |
| `punycode.version` | 无 | 当前 Punycode.js 版本号字符串 |

精确签名：

```
punycode.decode(string)            // <string>
punycode.encode(string)            // <string>
punycode.toASCII(domain)           // <string>
punycode.toUnicode(domain)         // <string>
punycode.ucs2                      // <Object>
punycode.ucs2.decode(string)       // <Array>
punycode.ucs2.encode(codePoints)   // <string>
punycode.version                   // <string>
```

#### Demo

```js
const punycode = require('punycode');

// 1) 字符串级编解码
console.log(punycode.encode('mañana'));   // 'maana-pta'
console.log(punycode.decode('maana-pta')); // 'mañana'
console.log(punycode.encode('☃-⌘'));      // '--dqo34k'
console.log(punycode.decode('--dqo34k'));  // '☃-⌘'

// 2) 域名级编解码（只处理非 ASCII 部分）
console.log(punycode.toASCII('mañana.com'));    // 'xn--maana-pta.com'
console.log(punycode.toASCII('example.com'));   // 'example.com'（纯 ASCII 不受影响）
console.log(punycode.toUnicode('xn--maana-pta.com')); // 'mañana.com'

// 3) UCS-2 码点互转
console.log(punycode.ucs2.decode('abc'));   // [ 0x61, 0x62, 0x63 ]
console.log(punycode.ucs2.encode([0x61, 0x62, 0x63])); // 'abc'
console.log(punycode.ucs2.decode('\uD834\uDF06')); // [ 0x1D306 ]（代理对还原为单个码点）

// 4) 版本号
console.log(punycode.version);
```

#### 注意事项

- 该模块**自 v7.0.0 起访问即会发出废弃警告**（稳定性等级 0 - Deprecated），未来某个大版本中会被移除。依赖它的代码应改用社区维护的 `Punycode.js` 模块。
- `punycode` 是 Node.js 内置的第三方依赖的打包版本，修复或修改必须提交到 Punycode.js 项目。
- `encode()` / `decode()` 处理的是**整个字符串**；`toASCII()` / `toUnicode()` 处理的是**域名**，只会转换其中需要转换的那部分，纯 ASCII 域名调用后不变。
- Punycode 只是把非 ASCII 字符转成 ASCII 的**传输表示**，本身并不包含 `xn--` 前缀的语义之外的任何内容；完整国际化域名在 DNS 中仍以 `xn--` 前缀标识，例如 `'例.com'` 的 Punycode 表示为 `'xn--fsq.com'`。
- 在 Node.js v8.x 中若只是处理 URL 里的国际化域名，优先使用 `url` 模块的 `url.domainToASCII()` / `url.domainToUnicode()`，以及 `new URL()` 在启用 ICU 时自动完成的 Punycode 转换，无需直接依赖本模块。

### console（控制台）

`console` 模块提供类似浏览器 JavaScript 控制台的调试输出能力，导出一个可写入任意流的 `Console` 类和一个全局 `console` 实例。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `new Console(stdout[, stderr])` | `stdout`：`<Writable>`；`stderr`：可选 `<Writable>`（缺省用 stdout） | 新的 Console 实例 |
| `console.log([data][, ...args])` | 任意参数，类 printf 格式 | 打印到 stdout（带换行） |
| `console.error([data][, ...args])` | 任意参数 | 打印到 stderr（带换行） |
| `console.warn([data][, ...args])` | 任意参数 | `console.error` 的别名 |
| `console.info([data][, ...args])` | 任意参数 | `console.log` 的别名 |
| `console.debug([data][, ...args])` | 任意参数 | `console.log` 的别名 |
| `console.dir(obj[, options])` | `options`：`showHidden`/`depth`/`colors` | 在 obj 上使用 `util.inspect()` 并打印到 stdout |
| `console.assert(value[, message][, ...args])` | `value`：任意值 | 为假时抛出 `AssertionError` |
| `console.trace([message][, ...args])` | 任意参数 | 向 stderr 打印 `Trace :` 及堆栈 |
| `console.time(label)` | `label`：`<string>` 计时器标识 | 启动计时器（精度到亚毫秒） |
| `console.timeEnd(label)` | `label`：`<string>` | 停止计时器并打印耗时（毫秒）到 stdout |
| `console.count([label])` | `label`：`<string>`，默认 `'default'` | 打印该 label 的调用次数到 stdout |
| `console.countReset([label='default'])` | `label`：`<string>` | 重置该 label 的计数器 |
| `console.group([...label])` | 任意 label | 后续输出缩进增加两个空格 |
| `console.groupCollapsed()` | 无 | `console.group()` 的别名 |
| `console.groupEnd()` | 无 | 后续输出缩进减少两个空格 |
| `console.clear()` | 无 | stdout 为 TTY 时尝试清屏；非 TTY 时什么也不做 |

精确签名：

```
new Console(stdout[, stderr])
console.assert(value[, message][, ...args])
console.clear()
console.count([label])
console.countReset([label='default'])
console.debug(data[, ...args])
console.dir(obj[, options])
console.error([data][, ...args])
console.group([...label])
console.groupCollapsed()
console.groupEnd()
console.info([data][, ...args])
console.log([data][, ...args])
console.time(label)
console.timeEnd(label)
console.trace([message][, ...args])
console.warn([data][, ...args])
```

#### Demo

```js
const fs = require('fs');
const { Console } = require('console');

// 1) 全局 console：stdout / stderr
console.log('你好世界');
console.log('你好%s', '世界');        // 你好世界
console.error(new Error('错误信息')); // [Error: 错误信息]，输出到 stderr
console.warn(`警告${'描述'}`);

// 2) 自定义输出的 Console 实例
const output = fs.createWriteStream('./stdout.log');
const errorOutput = fs.createWriteStream('./stderr.log');
const logger = new Console(output, errorOutput);
logger.log('count: %d', 5);   // 写入 stdout.log
logger.error('出错了');        // 写入 stderr.log

// 3) 计数与计时
console.count();               // default: 1
console.count('abc');          // abc: 1
console.countReset('abc');
console.count('abc');          // abc: 1

console.time('100-elements');
for (let i = 0; i < 100; i++) {}
console.timeEnd('100-elements'); // 100-elements: 0.2xx ms

// 4) 分组与堆栈
console.group('外层分组');
console.log('缩进了两个空格');
console.groupEnd();
console.trace('Show me');     // Trace : Show me + 堆栈到 stderr

// 5) 断言
console.assert(true, 'does nothing');
try {
  console.assert(false, 'Whoops %s', "didn't work");
} catch (err) {
  console.log('捕获到:', err.name); // AssertionError
}
```

#### 注意事项

- 全局 `console` 无需 `require('console')`；其等价于 `new Console(process.stdout, process.stderr)`。它既不总是同步（不像浏览器），也不总是异步（不像其他 Node.js 流）。
- `console.assert()` 在 **Node.js 中与浏览器行为不同**：Node.js 里断言为假会**抛出 `AssertionError`** 中断执行；浏览器里只是打印消息并继续执行。若想模拟浏览器行为，需要自行扩展并重写 `console.assert`。
- `console.log()` / `console.error()` 的第一个参数作为格式串，其余参数交给 `util.format()` 处理；若格式串中没有占位符，则所有参数都经 `util.inspect()` 后拼接。
- `console.warn()` 是 `console.error()` 的别名，`console.info()` 与 `console.debug()` 都是 `console.log()` 的别名。
- `console.dir()` 会**绕过**对象上自定义的 `inspect()` 函数，直接用 `util.inspect()` 格式化并打印；`depth` 默认 2（设 `null` 可无限递归），`colors` 默认 `false`。
- `console.count()` / `console.countReset()` / `console.clear()` / `console.group()` / `console.groupCollapsed()` / `console.groupEnd()` 均为 v8.x 新增（`count`/`countReset`/`clear` 自 v8.3.0，`group` 系列自 v8.5.0）。
- `console.timeEnd()` 自 v6.0.0 起会**删除计时器**以避免泄漏，因此同一标签不能多次 `timeEnd()`（旧版本允许多次调用，该行为已不再支持）。
- `console.clear()` 在 stdout 不是 TTY（例如输出被重定向到文件）时什么都不做；且其具体行为随操作系统与终端类型而异（Windows 上只清除当前终端视图中 Node.js 的输出）。
- 自 v8.0.0 起，写入底层流时发生的错误会被**忽略**（不再抛出）。

---

**文件与流模块：fs / buffer / stream / zlib**

### 文件系统（fs）

Node.js 内置的文件系统模块，提供同步与异步两套文件读写、目录操作、文件监听以及基于流的读写能力。

#### 核心 API

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `fs.readFile(path[, options], callback)` / `fs.readFileSync(path[, options])` | `path`：字符串/Buffer/URL/文件描述符；`options`：`encoding`（默认 `null`，返回 Buffer）、`flag`（默认 `'r'`） | 回调 `(err, data)`，`data` 为 `string \| Buffer`；同步版直接返回内容 |
| `fs.writeFile(file, data[, options], callback)` / `fs.writeFileSync(file, data[, options])` | `file`：文件名或文件描述符；`data`：`string \| Buffer \| Uint8Array`；`options`：`encoding`（默认 `'utf8'`）、`mode`（默认 `0o666`）、`flag`（默认 `'w'`，文件存在则截断） | 回调 `(err)`；异步写整个文件 |
| `fs.appendFile(file, data[, options], callback)` | 同上，但以追加方式写入 | 回调 `(err)` |
| `fs.open(path, flags[, mode], callback)` / `fs.openSync(path, flags[, mode])` | `flags`：`'r'`、`'r+'`、`'w'`、`'wx'`、`'w+'`、`'a'`、`'ax'`、`'a+'` 等；`mode` 默认 `0o666` | 回调 `(err, fd)`，返回文件描述符 |
| `fs.read(fd, buffer, offset, length, position, callback)` | 从 `fd` 读入 `buffer` 的指定区域 | 回调 `(err, bytesRead, buffer)` |
| `fs.write(fd, buffer[, offset[, length[, position]]], callback)` | 把 `buffer` 写入 `fd` 的指定位置 | 回调 `(err, bytesWritten)` |
| `fs.close(fd, callback)` | 关闭文件描述符 | 回调 `(err)` |
| `fs.stat(path, callback)` / `fs.statSync(path)` | 读取文件状态 | 返回 `fs.Stats` 对象，含 `isFile()`、`isDirectory()`、`size`、`mtime` 等 |
| `fs.lstat(path, callback)` | 读取状态，**不解引用符号链接** | 返回 `fs.Stats`；`isSymbolicLink()` 仅对它有效 |
| `fs.mkdir(path[, mode], callback)` | 创建目录，`mode` 默认 `0o777` | 回调 `(err)` |
| `fs.readdir(path[, options], callback)` | 列出目录内容 | 回调 `(err, files)`，`files` 为文件名数组 |
| `fs.rename(oldPath, newPath, callback)` | 重命名/移动文件 | 回调 `(err)` |
| `fs.unlink(path, callback)` / `fs.rmdir(path, callback)` | 删除文件 / 删除空目录 | 回调 `(err)` |
| `fs.truncate(path[, len], callback)` | 截断文件到指定长度 | 回调 `(err)` |
| `fs.access(path[, mode], callback)` | 检查文件是否存在及权限（`fs.constants.R_OK` 等） | 回调 `(err)`；不存在时 `err.code` 为 `ENOENT` |
| `fs.watch(filename[, options][, listener])` | `options`：`persistent`（默认 `true`）、`recursive`、`encoding` | 返回 `fs.FSWatcher`；监听器 `(eventType, filename)` |
| `fs.watchFile(filename[, options], listener)` | 基于 `stat` 轮询的慢速监听，可靠性较低 | 返回 `fs.StatWatcher` |
| `fs.createReadStream(path[, options])` | `options`：`flags`（`'r'`）、`encoding`、`fd`、`mode`、`autoClose`、`start`、`end`、`highWaterMark`（默认 64KB） | 返回 `fs.ReadStream`（可读流） |
| `fs.createWriteStream(path[, options])` | `options`：`flags`（`'w'`）、`encoding`（`'utf8'`）、`fd`、`mode`、`autoClose`、`start` | 返回 `fs.WriteStream`（可写流） |

#### 签名速查

```js
const fs = require('fs');

fs.readFile(path[, options], callback);
fs.readFileSync(path[, options]);
fs.writeFile(file, data[, options], callback);
fs.writeFileSync(file, data[, options]);
fs.appendFile(file, data[, options], callback);
fs.open(path, flags[, mode], callback);
fs.read(fd, buffer, offset, length, position, callback);
fs.write(fd, buffer[, offset[, length[, position]]], callback);
fs.close(fd, callback);
fs.stat(path, callback);
fs.mkdir(path[, mode], callback);
fs.readdir(path[, options], callback);
fs.rename(oldPath, newPath, callback);
fs.unlink(path, callback);
fs.watch(filename[, options][, listener]);
fs.createReadStream(path[, options]);
fs.createWriteStream(path[, options]);
```

#### Demo

```js
const fs = require('fs');
const path = require('path');
const os = require('os');

// mkdtemp 创建一个随机临时目录，避免污染工作区
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-demo-'));
const file = path.join(dir, 'hello.txt');

// 1) 异步写文件：回调第一个参数是错误对象，必须先判空再使用
fs.writeFile(file, 'Hello Node.js v8', 'utf8', (err) => {
  if (err) throw err;
  console.log('写入完成');

  // 2) 异步读文件：不指定 encoding 时返回的是 Buffer
  fs.readFile(file, (err, data) => {
    if (err) throw err;
    console.log('是 Buffer 吗:', Buffer.isBuffer(data)); // true
    console.log('内容:', data.toString('utf8'));

    // 3) stat 查看文件属性
    fs.stat(file, (err, stats) => {
      if (err) throw err;
      console.log('是文件:', stats.isFile(), '大小:', stats.size, '字节');

      // 4) 列出目录内容
      fs.readdir(dir, (err, files) => {
        if (err) throw err;
        console.log('目录内容:', files);

        // 5) 清理
        fs.unlink(file, (err) => {
          if (err) throw err;
          fs.rmdir(dir, () => console.log('清理完成'));
        });
      });
    });
  });
});
```

流式读写（`createReadStream` / `createWriteStream`），适合大文件，不会一次性把内容读进内存：

```js
const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-stream-'));
const src = path.join(dir, 'src.txt');
const dst = path.join(dir, 'dst.txt');

fs.writeFileSync(src, 'A'.repeat(64 * 1024)); // 造一个 64KB 文件

const rs = fs.createReadStream(src, { highWaterMark: 16 * 1024 });
const ws = fs.createWriteStream(dst);
let total = 0;

rs.on('data', (chunk) => { total += chunk.length; });
rs.on('error', (err) => { throw err; });
ws.on('error', (err) => { throw err; });

ws.on('finish', () => {
  console.log('复制完成, 字节数:', total);
  console.log('大小一致:', fs.statSync(dst).size === fs.statSync(src).size);

  // start/end 是闭区间，只读取文件的前 10 个字节
  const r2 = fs.createReadStream(src, { start: 0, end: 9 });
  r2.on('data', (chunk) => console.log('前 10 字节长度:', chunk.length));
  r2.on('end', () => {
    fs.unlinkSync(src);
    fs.unlinkSync(dst);
    fs.rmdirSync(dir);
    console.log('清理完成');
  });
});

rs.pipe(ws); // 把读流接到写流
```

监听文件变化：

```js
const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-watch-'));
const f = path.join(dir, 'a.txt');
fs.writeFileSync(f, 'x');

// 返回 fs.FSWatcher 对象
const watcher = fs.watch(dir, (eventType, filename) => {
  console.log('事件类型:', eventType); // 'rename' 或 'change'
  console.log('文件名:', filename && filename.toString()); //某些平台可能为 undefined
  watcher.close();
  fs.unlinkSync(f);
  fs.rmdirSync(dir);
});

setTimeout(() => fs.writeFileSync(f, 'changed'), 50);
```

#### 注意事项

- **回调里必须先判错**。`fs.readFile(path, (err, data) => ...)` 的第一个参数是错误对象，不判断就使用 `data` 会在失败时抛出难以定位的 `TypeError`；推荐的写法是 `if (err) throw err;` 或走自己的错误分支。
- **同步 API 会阻塞事件循环**。`fs.readFileSync`、`fs.writeFileSync` 等会阻塞整个进程直到完成，期间所有连接、定时器都停摆。在繁忙的进程中应优先使用异步方法；文档明确指出「建议在繁忙的进程中，使用异步的方法」。
- **同步版本会抛出异常，而异步版本通过回调传错**。`fs.readFileSync` 失败时直接 `throw`，必须用 `try/catch` 包裹。
- **`fs.exists` 已废弃**（v1.0.0 起），推荐用 `fs.access(path, callback)` 或 `fs.existsSync(path)`。
- **`fs.readFile` 会一次性把整个文件读进内存**，且是在单个线程池任务中完成的。文档建议在处理客户端请求时改用分块的 `fs.read()` 或 `fs.createReadStream()`，以减小线程池任务的耗时波动。
- **不要省略异步方法的回调**。从 v7.0.0 起 `callback` 参数不再是可选的，省略会触发警告；未来版本可能会直接抛错。若需要追踪最初的调用点，可设置 `NODE_DEBUG=fs` 环境变量。
- **`fs.writeFile` 会覆盖文件**（`flag` 默认 `'w'`，存在即截断）。想追加请用 `fs.appendFile`；想修改已有文件请用 `flags: 'r+'`。
- **不要在同一次并发中对同一文件多次调用 `fs.writeFile`**，这不安全，文档强烈推荐改用 `fs.createWriteStream`。
- **`path` 为目录时行为与平台相关**：macOS、Linux、Windows 上 `fs.readFile` 返回 `EISDIR` 错误，FreeBSD 上则返回目录内容的表示。
- **`fs.watch` 不是 100% 跨平台一致的**。递归选项只支持 macOS 和 Windows；在 Linux 上 `fs.watch` 解析的是 inode，路径被删除重建后新 inode 的事件不会再触发。`filename` 参数只在 Linux、macOS、Windows、AIX 上支持，且不保证一定提供，必须写好兜底逻辑。
- **在 Docker、Vagrant 或 NFS/SMB 网络文件系统上 `fs.watch` 可能不可靠**，此时可以退回使用基于 `stat` 轮询的 `fs.watchFile`（更慢但更可靠）。
- **`autoClose: false` 时需要自己关闭文件描述符**，否则会泄漏。
- **Windows 上的差异**：`fs.readdirSync('c:\\')` 与 `fs.readdirSync('c:')` 结果可能不同；用 `w` 选项打开已有隐藏文件会失败并报 `EPERM`，可用 `r+` 打开。
- **v8.x 没有 `fs.promises`**。Promise 风格的 `fs.promises.readFile` 等 API 是 Node.js v10 才引入的，v8.x 文档中不存在，所有异步文件操作都只能走回调风格。

### 缓存（Buffer）

Buffer 是 Node.js 中用于处理二进制数据的全局类型，提供字符串与字节之间的多编码转换、切片、拷贝、比较等能力。

#### 核心 API

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `Buffer.alloc(size[, fill[, encoding]])` | `size`：字节数；`fill`：填充值；`encoding`：填充字符串的编码 | 返回**已初始化**（填 0）的新 Buffer，保证不含旧敏感数据，比 `allocUnsafe` 慢 |
| `Buffer.allocUnsafe(size)` | `size`：字节数 | 返回未初始化的 Buffer，速度快，但可能残留旧的敏感数据，必须自行填充/写满 |
| `Buffer.allocUnsafeSlow(size)` | `size`：字节数 | 同 `allocUnsafe`，但不分配在共享的内部内存池中 |
| `Buffer.from(array)` | 八位字节数组 | 返回包含该字节数组**副本**的新 Buffer |
| `Buffer.from(arrayBuffer[, byteOffset[, length]])` | `ArrayBuffer` 及其偏移/长度 | 返回与给定 `ArrayBuffer` **共享同一内存**的 Buffer |
| `Buffer.from(buffer)` | 已有 Buffer | 返回包含其内容**副本**的新 Buffer |
| `Buffer.from(string[, encoding])` | 字符串及编码 | 返回包含该字符串副本的新 Buffer |
| `Buffer.from(object[, offsetOrEncoding[, length]])` | 普通对象 | 按 `offsetOrEncoding` / `length` 读取对象属性值并写入 Buffer |
| `Buffer.byteLength(string[, encoding])` | 字符串（或 Buffer/TypedArray/DataView/ArrayBuffer） | 返回**字节数**（不同于 `String.length` 的字符数） |
| `Buffer.compare(buf1, buf2)` | 两个 Buffer/Uint8Array | 返回 `0`（相等）、`1`、`-1`，可用于 `arr.sort(Buffer.compare)` |
| `Buffer.concat(list[, totalLength])` | `list`：Buffer 数组；`totalLength`：总长度 | 返回合并后的新 Buffer；给出 `totalLength` 可少一次循环 |
| `Buffer.isBuffer(obj)` | 任意对象 | 返回是否为 Buffer 的布尔值 |
| `Buffer.isEncoding(encoding)` | 编码名 | 返回该编码是否受支持的布尔值 |
| `Buffer.poolSize` | — | 内部 Buffer 池大小，默认 `8192`，可修改 |
| `buf[index]` | 字节索引 | 读取/设置单个字节（`0x00`–`0xFF`）；越界读取返回 `undefined`，越界设置无效 |
| `buf.buffer` | — | 返回底层 `ArrayBuffer` 对象 |
| `buf.length` | — | Buffer 的字节长度 |
| `buf.toString([encoding[, start[, end]]])` | `encoding` 默认 `'utf8'`，`start` 默认 `0`，`end` 默认 `buf.length` | 返回解码后的字符串 |
| `buf.toJSON()` | — | 返回 `{ type: 'Buffer', data: [...] }`，`JSON.stringify(buf)` 会隐式调用它 |
| `buf.write(string[, offset[, length]][, encoding])` | `offset` 默认 `0`，`length` 默认 `buf.length - offset` | 返回**实际写入的字节数** |
| `buf.slice([start[, end]])` | `start` 默认 `0`，`end`（不含）默认 `buf.length` | 返回**共享同一块内存**的新 Buffer，修改切片会影响原 Buffer |
| `buf.copy(target[, targetStart[, sourceStart[, sourceEnd]]])` | 源/目标偏移量 | 返回被拷贝的字节数，支持内存区域重叠 |
| `buf.compare(target[, targetStart[, targetEnd[, sourceStart[, sourceEnd]]])` | 比较区间 | 返回 `0` / `1` / `-1` |
| `buf.equals(otherBuffer)` | 另一个 Buffer/Uint8Array | 字节完全相同返回 `true` |
| `buf.fill(value[, offset[, end]][, encoding])` | 填充值可以是字符串/Buffer/整数 | 填充指定区间并返回 `buf` 自身 |
| `buf.includes(value[, byteOffset][, encoding])` | 要查找的值 | 返回是否包含的布尔值 |
| `buf.indexOf(value[, byteOffset][, encoding])` | 要查找的值 | 返回首次出现的字节下标，未找到返回 `-1` |
| `buf.lastIndexOf(value[, byteOffset][, encoding])` | 要查找的值 | 返回最后一次出现的字节下标 |
| `buf.readUInt32BE(offset[, noAssert])` / `buf.readInt32LE(offset[, noAssert])` | 偏移量 | 按指定字节序读取整数（另有 `readUInt8`、`readUInt16BE/LE`、`readDoubleBE/LE` 等） |
| `buf.writeUInt32BE(value, offset[, noAssert])` | 写入值与偏移量 | 按指定字节序写入整数（另有 `writeUInt8`、`writeInt16LE` 等） |
| `buf.swap16()` / `buf.swap32()` / `buf.swap64()` | — | 原地交换字节序，返回 `buf`；长度不是 2/4/8 的倍数会抛 `RangeError` |
| `buf.values()` / `buf.keys()` / `buf.entries()` | — | 返回字节 / 索引 / `[index, byte]` 迭代器 |
| `buffer.constants.MAX_LENGTH` / `MAX_STRING_LENGTH` | — | 单个 Buffer / 字符串的最大长度常量 |

#### 签名速查

```js
Buffer.alloc(size[, fill[, encoding]]);
Buffer.allocUnsafe(size);
Buffer.allocUnsafeSlow(size);
Buffer.from(array);
Buffer.from(arrayBuffer[, byteOffset[, length]]);
Buffer.from(buffer);
Buffer.from(string[, encoding]);
Buffer.from(object[, offsetOrEncoding[, length]]);
Buffer.byteLength(string[, encoding]);
Buffer.compare(buf1, buf2);
Buffer.concat(list[, totalLength]);
Buffer.isBuffer(obj);
Buffer.isEncoding(encoding);

buf.toString([encoding[, start[, end]]]);
buf.toJSON();
buf.write(string[, offset[, length]][, encoding]);
buf.slice([start[, end]]);
buf.copy(target[, targetStart[, sourceStart[, sourceEnd]]]);
buf.compare(target[, targetStart[, targetEnd[, sourceStart[, sourceEnd]]]);
buf.equals(otherBuffer);
buf.fill(value[, offset[, end]][, encoding]);
buf.includes(value[, byteOffset][, encoding]);
buf.indexOf(value[, byteOffset][, encoding]);
buf.readUInt32BE(offset[, noAssert]);
buf.writeUInt32BE(value, offset[, noAssert]);
```

#### Demo

```js
// 1) 字符串 -> Buffer -> 各种编码
const buf = Buffer.from('你好 Node.js', 'utf8');
console.log('字节长度:', buf.length);                        // 14（UTF-8 多字节）
console.log('hex:', buf.toString('hex'));
console.log('base64:', buf.toString('base64'));
console.log('byteLength("你好"):', Buffer.byteLength('你好', 'utf8')); // 6

// 2) 写入：write 返回实际写入的字节数
const b = Buffer.alloc(16);                                 // 已初始化，安全
const n = b.write('hello', 0, 5, 'utf8');
console.log('写入字节数:', n, '内容:', b.toString('utf8', 0, 5));

// 3) 拷贝：把 buf 的前 4 个字节拷进 t
const t = Buffer.alloc(4);
buf.copy(t, 0, 0, 4);
console.log('copy 后:', t.toString('hex'));                   // e4bda0e5

// 4) 拼接、比较、相等判断
console.log('concat:', Buffer.concat([Buffer.from('ab'), Buffer.from('cd')]).toString());
console.log('compare:', Buffer.compare(Buffer.from('1234'), Buffer.from('0123'))); // 1
console.log('equals:', Buffer.from('ABC').equals(Buffer.from('414243', 'hex')));    // true

// 5) 查找
console.log('indexOf:', Buffer.from('buffer').indexOf('f'));  // 2
console.log('includes:', Buffer.from('buffer').includes('uff')); // true

// 6) 序列化
console.log('toJSON:', JSON.stringify(Buffer.from([1, 2, 3])));
// {"type":"Buffer","data":[1,2,3]}
```

`slice` 共享内存的经典陷阱：

```js
const buf1 = Buffer.allocUnsafe(26);
for (let i = 0; i < 26; i++) {
  buf1[i] = i + 97; // 97 是 'a' 的 ASCII 码
}
const buf2 = buf1.slice(0, 3);
console.log(buf2.toString('ascii')); // abc

buf1[0] = 33;                        // 修改原始 Buffer
console.log(buf2.toString('ascii')); // !bc —— 切片跟着变了，因为内存是重叠的
```

#### 注意事项

- **`new Buffer()` 已被废弃**。v8.x 中应统一使用 `Buffer.from()`、`Buffer.alloc()`、`Buffer.allocUnsafe()`。从 Node.js 8.0.0 起 `Buffer(num)` / `new Buffer(num)` 返回的内存已经是初始化过的，但 `new Buffer()` 语义仍然随参数类型变化，容易引入安全和可靠性问题。
- **`allocUnsafe` 不安全**。它分配的内存段未用 0 填充，可能包含旧的敏感数据；使用后必须用 `buf.fill(0)` 或完全写满。可以用 `--zero-fill-buffers` 命令行选项强制所有新分配的 Buffer 自动填 0（性能有明显影响）。
- **`buf.slice()` 不是拷贝，是共享内存**。需要独立副本时用 `Buffer.from(buf)` 或 `buf.copy()`。
- **字节数 ≠ 字符数**。`buf.length` 和 `Buffer.byteLength()` 给的是字节数，`str.length` 给的是字符数。中文在 UTF-8 下占 3 字节。
- **`buf.write()` 会截断，不会自动扩容**。返回的字节数可能小于字符串长度，超出部分被丢弃，写入前要确保 Buffer 足够大。
- **切分多字节字符时不要直接 `buf.toString()`**。可读流上用 `readable.setEncoding('utf8')` 让流自己处理跨块的字符边界；手工处理可使用 `string_decoder` 模块的 `StringDecoder`。
- **`buf.indexOf()` 找不到时返回 `-1`**，不是 `undefined`，判断时要写成 `if (idx !== -1)`。
- **支持的编码有限**：`ascii`、`utf8`、`utf16le`（别名 `ucs2`）、`base64`、`latin1`（别名 `binary`）、`hex`。`raw` / `raws` 已在 v5.0.0 移除。
- **`latin1` 与浏览器的 WHATWG 规范不一致**：现代浏览器把 `latin1` 当作 `win-1252`，所以服务器返回 win-1252 数据时用 `latin1` 解码可能出错。
- **`Buffer.byteLength()` 对 `base64` 和 `hex` 假定输入合法**，含空格等非编码字符时返回值可能大于实际 Buffer 长度。
- **`Buffer.from(arr)` 拷贝内容，`Buffer.from(arr.buffer)` 共享内存**。这个区别决定了后续修改是否会互相影响。
- **Buffer 是 `Uint8Array` 的子类**，但 `new Uint32Array(Buffer.from([1,2,3,4]))` 会得到 4 个元素的数组 `[1,2,3,4]`，而不是一个 `0x01020304`。
- **`Buffer.from()` 不支持映射函数**，与 `TypedArray.from(source[, mapFn[, thisArg]])` 签名不同。

### 流（Stream）

流是 Node.js 中处理数据的抽象抽象层，分为 Readable（读）、Writable（写）、Duplex（读写）和 Transform（读写并变换）四种基本类型，用 `pipe()` 把它们串起来并自动处理背压。

#### 核心 API

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `readable.pipe(destination[, options])` | `destination`：目标 Writable；`options.end` 默认 `true` | 返回目标流，可链式 `r.pipe(z).pipe(w)`；自动处理背压 |
| `readable.read([size])` | `size`：可选字节数 | 返回 `string \| Buffer \| null`，无可读数据时返回 `null` |
| `readable.setEncoding(encoding)` | 编码名 | 返回 `this`；之后 `'data'` 事件收到的是字符串而不是 Buffer |
| `readable.pause()` / `readable.resume()` | — | 返回 `this`；在 flowing模式与 paused 模式之间切换 |
| `readable.unpipe([destination])` | 可选的目标流 | 解除 pipe 绑定；不传则解除全部 |
| `readable.unshift(chunk)` | 要压回缓冲区的数据块 | 把数据块压回可读队列底部 |
| `readable.isPaused()` | — | 返回当前是否处于暂停状态 |
| `readable.readableHighWaterMark` | — | 返回构造时传入的 `highWaterMark` |
| `readable.destroy([error])` | 可选错误 | 销毁流并触发 `'error'`，释放内部资源 |
| `writable.write(chunk[, encoding][, callback])` | `chunk`：`string \| Buffer \| Uint8Array`（对象模式下可为任意非 `null` 值） | 返回**布尔值**：缓冲未满返回 `true`，达到阈值返回 `false`（表示需要等待 `'drain'`） |
| `writable.end([chunk][, encoding][, callback])` | 可选的尾数据、编码、结束回调 | 表示不再写入；之后调用 `write()` 会报错 |
| `writable.cork()` / `writable.uncork()` | — | 把写入缓存在内存中 / 一次性输出；调用几次 `cork()`就要调用几次 `uncork()` |
| `writable.setDefaultEncoding(encoding)` | 编码名 | 返回 `this` |
| `writable.writableHighWaterMark` | — | 返回构造时传入的 `highWaterMark` |
| `writable.destroy([error])` | 可选错误 | 销毁写流并发出错误 |
| `stream.Readable` / `stream.Writable` | `options`：`highWaterMark`、`objectMode`、`encoding` 等 | 基类，需实现 `_read()` / `_write()` |
| `stream.Duplex` | 同上 | 同时实现 Readable 与 Writable，内部维护两个独立缓冲器 |
| `stream.Transform` | 同上 | Duplex 的特例，输出与输入关联，需实现 `_transform()` / `_flush()` |
| `stream.PassThrough` | 同上 | 极简 Transform，原样输出输入字节 |

流事件：`Readable` 有 `'data'`、`'end'`、`'readable'`、`'error'`、`'close'`；`Writable` 有 `'drain'`、`'finish'`、`'error'`、`'close'`、`'pipe'`、`'unpipe'`。

#### 签名速查

```js
const { Readable, Writable, Duplex, Transform, PassThrough } = require('stream');

readable.pipe(destination[, options]);
readable.read([size]);
readable.setEncoding(encoding);
readable.pause();
readable.resume();
readable.unpipe([destination]);
readable.unshift(chunk);
readable.isPaused();
readable.destroy([error]);

writable.write(chunk[, encoding][, callback]);
writable.end([chunk][, encoding][, callback]);
writable.cork();
writable.uncork();
writable.setDefaultEncoding(encoding);
writable.destroy([error]);

new stream.Readable([options]);
new stream.Writable([options]);
new stream.Duplex([options]);
new stream.Transform([options]);
```

#### Demo

四种流类型各一个最小实例：

```js
const { Readable, Writable, Duplex, Transform } = require('stream');

// 1) Writable：只写，write() 的回调必须被调用，否则流会卡住
const writer = new Writable({
  write(chunk, encoding, callback) {
    console.log('[Writable] 收到:', chunk.toString().trim());
    callback();
  }
});
writer.write('hello ');
writer.write('world');
writer.end('!\n');
writer.on('finish', () => console.log('[Writable] finish 触发'));

// 2) Readable：只读，push(null) 表示数据结束
let count = 0;
const readable = new Readable({
  read() {
    count += 1;
    if (count > 3) {
      this.push(null);
      return;
    }
    this.push(`第 ${count} 块\n`);
  }
});
readable.on('data', (chunk) => process.stdout.write(`[Readable] ${chunk}`));
readable.on('end', () => console.log('[Readable] end 触发'));

// 3) Duplex：可读可写，写进去的能从读端读出来
const duplex = new Duplex({
  write(chunk, encoding, callback) {
    this.push(chunk); // 写侧的数据同时推给读侧
    callback();
  },
  read() {}
});
duplex.on('data', (d) => console.log('[Duplex] 读到:', d.toString()));
duplex.write('hello duplex');
duplex.end();

// 4) Transform：边读边改，zlib 的压缩流就是这一类
const upper = new Transform({
  transform(chunk, encoding, callback) {
    this.push(chunk.toString().toUpperCase());
    callback();
  }
});
upper.on('data', (d) => console.log('[Transform] 输出:', d.toString()));
upper.write('hello transform');
upper.end();
```

`pipe` 与背压：

```js
const { Readable, Writable } = require('stream');

// 源：产生 10 个数据块
let i = 0;
const src = new Readable({
  read() {
    if (i < 10) {
      this.push(`chunk-${i++}\n`);
    } else {
      this.push(null);
    }
  }
});

// 目标：故意写得慢，并把 highWaterMark 调小，方便观察背压
const dst = new Writable({
  highWaterMark: 16,
  write(chunk, encoding, callback) {
    setTimeout(() => {
      console.log('落盘:', chunk.toString().trim());
      callback(); // 调用回调后，pipe 才会继续取下一块
    }, 30);
  }
});

// pipe 会自动处理背压：目标缓冲满时，源会暂停读取
src.pipe(dst);
dst.on('finish', () => console.log('pipe 完成'));
```

手动处理背压（不写 `pipe` 时必须自己处理）：

```js
const { Writable } = require('stream');

const ws = new Writable({
  highWaterMark: 16 * 1024,
  write(chunk, encoding, callback) {
    setTimeout(callback, 20); // 模拟慢速写入
  }
});

function write(data, cb) {
  if (!ws.write(data)) {
    // write() 返回 false：内部缓冲已达到 highWaterMark，必须停下来等 'drain'
    console.log('write() 返回 false：触发背压，等待 drain 事件');
    ws.once('drain', cb);
  } else {
    console.log('write() 返回 true：可以继续写');
    process.nextTick(cb);
  }
}

// 写入 64KB，超过 highWaterMark，必然会走到 false 分支
write('x'.repeat(64 * 1024), () => {
  console.log('写入完成（drain 已触发）');
  ws.end();
});
```

#### 注意事项

- **必须监听 `'error'` 事件**。`Readable` / `Writable` 都不监听 `'error'` 就会因为未处理的错误事件直接让进程崩溃。
- **`write()` 返回 `false` 时必须停止写入**。文档明确建议：一旦 `write()` 返回 `false`，在 `'drain'` 事件触发前不要再写入数据块。否则数据会一直堆积在内存里直到达到最大内存占用，导致垃圾回收性能下降；对不会 drain 的 TCP socket 持续写入还可能造成可被利用的内存漏洞。`pipe()` 会自动帮你处理这件事。
- **可读流有 flowing 和 paused 两种模式**。初始是 paused；监听 `'data'`、调用 `resume()` 或 `pipe()` 会切到 flowing；调用 `pause()` 或 `unpipe()` 会切回 paused。同一个流上不要混用多种消费方式。
- **flowing 模式下没有消费者，数据会丢失**。调用了 `resume()` 却没有监听 `'data'`，或取消了 `'data'` 监听，都可能丢数据。想丢弃数据也要 `resume()`。
- **`'end'` 事件只在数据被完全消费后才触发**。如果只是挂上 `'end'` 监听而不消费数据，流会永远停在那里（v0.10 之前数据会被静默丢弃）。
- **`'error'` 事件触发时流并不会关闭**，需要自己 `destroy()`。
- **`pipe()` 出错时目标可写流不会自动关闭**，必须手动关闭所有流以避免内存泄漏。`options: { end: false }` 可以禁止源结束时自动 `end()` 目标流。
- **`process.stdout` 和 `process.stderr` 无论传什么选项都会等到进程退出才关闭**。
- **`objectMode` 下 `chunk` 可以是任意非 `null` 的 JavaScript 值**，且 `highWaterMark` 的单位变成「对象个数」而非字节数；`null` 在流处理中有特殊含义（表示流结束），不能作为数据块。
- **非对象模式下 `chunk` 只能是字符串、Buffer 或 Uint8Array**；传入 `null` 一律视为无效（v6.0.0 起即使是对象模式也一样）。
- **`writable.end()` 之后再调用 `write()` 会报错**。
- **`cork()` / `uncork()` 必须成对**。多次 `cork()` 就要多次 `uncork()`；建议用 `process.nextTick()` 延迟 `uncork()`，把同一个事件循环里的多次 `write()` 批量输出。
- **`_transform()` 不能并行调用**，必须先调用 `callback` 才能接收下一个数据块。
- **实现自定义流时不要调用 `public` 方法**（如 `write()`、`push()`），那些是给使用者用的；应实现 `_read()`、`_write()`、`_writev()`、`_final()`、`_transform()`、`_flush()`。
- **`readable.setEncoding()` 会改变 `highWaterMark` 的计量单位**：调用后缓冲大小按「字符数」而不是「字节数」比较，多字节字符场景下要注意。
- **不推荐使用 `readable.push('')`**，它会停止读取进程却不产生可消费的数据。
- **`readable.unshift()` 在 `'end'` 事件触发后或运行时报错后不能调用**，且在读取过程中调用会抛异常；多数情况下改用 Transform 流更合适。

### 压缩（ZLIB）

zlib 模块基于 Gzip 和 Deflate/Inflate 提供数据压缩与解压，既有一站式便捷方法，也有可用于流式处理的压缩流。

#### 核心 API

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `zlib.gzip(buffer[, options], callback)` / `zlib.gzipSync(buffer[, options])` | `buffer`：Buffer/TypedArray/DataView/字符串；`options`：见下表 | 回调 `(err, result)`，结果为压缩后的 Buffer |
| `zlib.gunzip(buffer[, options], callback)` / `zlib.gunzipSync(...)` | 同上 | 回调 `(err, result)`，解压 gzip 数据 |
| `zlib.deflate(buffer[, options], callback)` / `zlib.deflateSync(...)` | 同上 | 使用 Deflate 压缩 |
| `zlib.deflateRaw(buffer[, options], callback)` / `zlib.deflateRawSync(...)` | 同上 | 使用 DeflateRaw 压缩，不附加 zlib 头 |
| `zlib.inflate(buffer[, options], callback)` / `zlib.inflateSync(...)` | 同上 | 解压 deflate 流 |
| `zlib.inflateRaw(buffer[, options], callback)` / `zlib.inflateRawSync(...)` | 同上 | 解压 raw deflate 流 |
| `zlib.unzip(buffer[, options], callback)` / `zlib.unzipSync(...)` | 同上 | 自动检测头信息，解压 Gzip 或 Deflate 数据 |
| `zlib.createGzip([options])` | `options` 对象 | 返回 `zlib.Gzip` 压缩流（Transform 类型） |
| `zlib.createGunzip([options])` | 同上 | 返回 `zlib.Gunzip` 解压流 |
| `zlib.createDeflate([options])` / `zlib.createDeflateRaw([options])` | 同上 | 返回 `zlib.Deflate` / `zlib.DeflateRaw` 流 |
| `zlib.createInflate([options])` / `zlib.createInflateRaw([options])` | 同上 | 返回 `zlib.Inflate` / `zlib.InflateRaw` 流 |
| `zlib.createUnzip([options])` | 同上 | 返回 `zlib.Unzip` 流，自动识别 gzip/deflate |
| `zlib.constants` | — | 所有 Zlib 常量的对象（v7.0.0 新增），如 `Z_SYNC_FLUSH`、`Z_BEST_COMPRESSION`、`Z_OK` |
| `zlib.bytesRead` | — | 压缩引擎在处理之前读取的字节数（v8.1.0 新增） |
| `zlib.close([callback])` | — | 关闭底层的 handle |
| `zlib.flush([kind], callback)` | `kind` 默认 `zlib.constants.Z_FULL_FLUSH` | 刷新挂起的数据；不要轻易调用，会损害压缩率 |
| `zlib.params(level, strategy, callback)` | 压缩等级与策略 | 动态更新压缩等级和压缩策略 |
| `zlib.reset()` | — | 把 compressor/decompressor 重置为默认值 |

`options` 支持的字段：`flush`（默认 `Z_NO_FLUSH`）、`finishFlush`（默认 `Z_FINISH`）、`chunkSize`（默认 `16*1024`）、`windowBits`、`level`、`memLevel`、`strategy`、`dictionary`（deflate/inflate 用）、`info`。

#### 签名速查

```js
const zlib = require('zlib');

zlib.gzip(buffer[, options], callback);
zlib.gzipSync(buffer[, options]);
zlib.gunzip(buffer[, options], callback);
zlib.gunzipSync(buffer[, options]);
zlib.deflate(buffer[, options], callback);
zlib.deflateSync(buffer[, options]);
zlib.deflateRaw(buffer[, options], callback);
zlib.deflateRawSync(buffer[, options]);
zlib.inflate(buffer[, options], callback);
zlib.inflateSync(buffer[, options]);
zlib.inflateRaw(buffer[, options], callback);
zlib.inflateRawSync(buffer[, options]);
zlib.unzip(buffer[, options], callback);
zlib.unzipSync(buffer[, options]);

zlib.createGzip([options]);
zlib.createGunzip([options]);
zlib.createDeflate([options]);
zlib.createDeflateRaw([options]);
zlib.createInflate([options]);
zlib.createInflateRaw([options]);
zlib.createUnzip([options]);
```

#### Demo

一次性压缩与解压：

```js
const zlib = require('zlib');

const input = 'Node.js v8 zlib 压缩示例，压缩示例压缩示例压缩示例。';

zlib.gzip(Buffer.from(input, 'utf8'), (err, gz) => {
  if (err) throw err;                       // 回调第一个参数是错误，必须判空
  console.log('原始字节数:', Buffer.byteLength(input));
  console.log('gzip 后字节数:', gz.length);

  zlib.unzip(gz, (err, out) => {
    if (err) throw err;
    console.log('解压结果一致:', out.toString('utf8') === input);
  });
});
```

流式压缩与解压（压缩流本身就是 Transform 流，可以直接 `pipe`）：

```js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const os = require('os');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zlib-'));
const src = path.join(dir, 'a.txt');
const gzFile = path.join(dir, 'a.txt.gz');

const text = '压缩示例。'.repeat(100);
fs.writeFileSync(src, text);

// 文件 -> gzip -> 文件
fs.createReadStream(src)
  .pipe(zlib.createGzip())
  .pipe(fs.createWriteStream(gzFile))
  .on('finish', () => {
    console.log('原大小:', fs.statSync(src).size);
    console.log('压缩文件大小:', fs.statSync(gzFile).size);

    // gzip 文件 -> gunzip -> 内存
    fs.createReadStream(gzFile)
      .pipe(zlib.createGunzip())
      .on('data', (chunk) => console.log('解压得到字节数:', chunk.length))
      .on('end', () => {
        fs.unlinkSync(src);
        fs.unlinkSync(gzFile);
        fs.rmdirSync(dir);
        console.log('清理完成');
      });
  });
```

#### 注意事项

- **回调式接口必须检查 `err`**。所有便捷方法都是 `callback(error, result)` 形式，忘记判断 `err` 会在失败时读到 `undefined` 结果。
- **所有非显式同步的 zlib API 都使用 libuv 的线程池**，这可能带来出乎意料的性能问题，可通过 `UV_THREADPOOL_SIZE` 调整线程池大小。
- **默认解压不完整数据会抛错**。如果已知数据不完整（例如只想检查压缩文件开头），可以把 `finishFlush` 设为 `zlib.constants.Z_SYNC_FLUSH` 来避免默认错误处理；但这不改变其他错误（如格式无效）的行为，且结果的有效性需要人工检查。
- **`zlib.flush()` 不要滥用**。过早刷新会损害压缩算法效果；它只刷新 zlib 内部状态，不会做流级别的刷新，其表现类似一次普通的 `write()`。
- **`level` 是影响压缩速度的最大因素**。等级越高压缩率越好但耗时更长；等级低则压缩率下降但速度大幅提升。
- **内存用量可调**。解压所需内存为 `(1 << (windowBits + 2)) + (1 << (memLevel + 9))` 字节，压缩所需内存为 `1 << windowBits` 字节。默认 `windowBits=15`、`memLevel=8` 时，小对象也需要约 128KB；想降低可设 `{ windowBits: 14, memLevel: 7 }`，但通常会降低压缩水平。
- **`zlib.params()` 的文档写的是「只对解压算法有效」，但语义上它用于动态更新压缩等级和压缩策略**，实际使用时以自己的测试为准。
- **`zlib.constants` 是 v7.0.0 新增的**。以前可以直接 `require('zlib').Z_NO_FLUSH` 这样访问，目前仍可访问但不推荐，应统一使用 `zlib.constants.Z_NO_FLUSH`。
- **Gunzip 的行为在多个版本中变化过**：v5.0.0 起截断的输入流会触发 `error` 事件；v5.9.0 起支持多个连续的 gzip 成员；v6.0.0 起输入流末尾的垃圾数据会触发 `error` 事件。
- **HTTP 场景下的正确做法**：`Accept-Encoding` 解析要参考 RFC 2616，示例代码中的解析器只是示意；对每个请求都跑一次 gzip 成本很高，应当缓存压缩后的缓冲区。

---

**运行时模块：events / timers / process / globals / assert / module / v8 / perf_hooks**

### events（事件）

Node.js 核心 API 普遍采用异步事件驱动架构，`events` 模块提供所有可触发事件对象的基类 `EventEmitter`。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `emitter.on(eventName, listener)` | `eventName: <any>` 事件名；`listener: <Function>` 回调函数 | 把 listener 追加到事件监听器数组末尾；不检查是否已添加，重复添加会被多次调用。返回 `EventEmitter` 引用，可链式调用 |
| `emitter.once(eventName, listener)` | `eventName: <any>`；`listener: <Function>` | 添加单次监听器，下次触发时先移除再调用。返回 `EventEmitter` 引用 |
| `emitter.emit(eventName[, ...args])` | `eventName: <any>`；`...args: <any>` | 按注册顺序**同步**调用每个监听器并传入参数；有监听器返回 `true`，否则返回 `false` |
| `emitter.removeListener(eventName, listener)` | `eventName: <any>`；`listener: <Function>` | 从监听器数组中移除指定的 listener，**最多只移除一个实例**；返回 `EventEmitter` 引用 |
| `emitter.addListener(eventName, listener)` | 同 `on` | `on` 的别名 |
| `emitter.prependListener(eventName, listener)` | `eventName: <any>`；`listener: <Function>` | 把 listener 插入到监听器数组**开头**；返回 `EventEmitter` 引用 |
| `emitter.prependOnceListener(eventName, listener)` | `eventName: <any>`；`listener: <Function>` | 在开头插入单次监听器；返回 `EventEmitter` 引用 |
| `emitter.removeAllListeners([eventName])` | `eventName: <any>` 可选 | 移除全部或指定事件的监听器；返回 `EventEmitter` 引用 |
| `emitter.listeners(eventName)` | `eventName: <any>` | 返回该事件监听器数组的**副本**（v7.0.0 起 `once` 返回原始监听器而非包装函数） |
| `emitter.listenerCount(eventName)` | `eventName: <any>` | 返回正在监听该事件的监听器数量 |
| `emitter.eventNames()` | 无 | 返回已注册监听器的事件名数组（字符串或符号） |
| `emitter.setMaxListeners(n)` | `n: <integer>` | 修改该实例的最大监听器数；`Infinity`（或 `0`）表示不限制。返回 `EventEmitter` 引用 |
| `emitter.getMaxListeners()` | 无 | 返回当前实例的最大监听器限制，默认取 `EventEmitter.defaultMaxListeners` |
| `EventEmitter.defaultMaxListeners` | 可写属性 | 全局默认值，默认 **10**；设为非正数会抛 `TypeError` |
| `EventEmitter.listenerCount(emitter, eventName)` | `emitter`；`eventName` | 已废弃（v4.0.0），改用 `emitter.listenerCount()` |

#### 代码块（精确签名）

```js
const EventEmitter = require('events');

const emitter = new EventEmitter();
emitter.on(eventName, listener);          // listener: Function
emitter.once(eventName, listener);         // listener: Function
emitter.emit(eventName[, ...args]);        // ...args: any
emitter.removeListener(eventName, listener);
emitter.removeAllListeners([eventName]);
emitter.listeners(eventName);
emitter.listenerCount(eventName);
emitter.eventNames();
emitter.setMaxListeners(n); // n: integer
emitter.getMaxListeners();
```

#### Demo

```js
'use strict';
const EventEmitter = require('events');

// 1) 继承 EventEmitter 定义自己的事件源
class Job extends EventEmitter {
  constructor() {
    super();               // 必须调用父类构造函数，否则 this._events 未初始化
    this.state = 'pending';
  }

  run() {
    this.state = 'running';
    this.emit('start', Date.now());        // 同步触发，监听器返回值被丢弃

    setImmediate(() => {
      this.emit('done', 'ok');
      this.emit('error', new Error('模拟一个错误'));  // 坑 2：必须有 error 监听器
    });
  }
}

const job = new Job();

// 2) 必须注册 error 监听器，否则 emit('error') 会抛错并使进程崩溃
job.on('error', (err) => {
  console.error('捕获到错误：', err.message);
});

job.on('start', (ts) => {
  console.log('任务开始：', ts);
});

job.once('done', (result) => {
  // once：触发前先被注销，第二次 emit('done') 不会再进来
  console.log('任务完成：', result);
});

job.run();

// 3) removeListener 必须传入同一个函数引用，且每次只移除一个实例
const onLog = (msg) => console.log('日志：', msg);
job.on('log', onLog);
job.on('log', onLog);   // 同一个函数被添加了两次
job.removeListener('log', onLog);   // 只移除一个实例，还剩一个
console.log('剩余 log 监听器数量：', job.listenerCount('log'));

// 4) 超过 10 个监听器会触发 MaxListenersExceededWarning
const emitter = new EventEmitter();
for (let i = 0; i < 12; i++) {
  emitter.on('tick', () => {});
}
console.log('tick 监听器数量：', emitter.listenerCount('tick'));
console.log('最大监听器数：', emitter.getMaxListeners());
```

#### 注意事项

- **`error` 事件的坑**：若没有为 `error` 事件注册至少一个监听器，`emit('error')` 会抛出错误、打印堆栈并**直接退出 Node.js 进程**。文档指出应始终为 `error` 注册监听器；`domain` 模块虽可拦截但已被废弃。
- **最大监听器警告**：每个事件默认最多注册 10 个监听器，超出会向 stderr 输出 `MaxListenersExceededWarning`（提示可能存在 EventEmitter 内存泄漏）。这不是硬性限制——仍可继续添加。可用 `emitter.setMaxListeners(n)` 或 `EventEmitter.defaultMaxListeners` 调整；后者会影响**所有**实例（包括之前创建的），所以优先用实例级 `setMaxListeners()`。用 `--trace-warnings` 可显示警告堆栈，用 `process.on('warning')` 可捕获警告（其 `name` 为 `MaxListenersExceededWarning`，并带 `emitter`、`type`、`count` 属性）。
- **同步调用**：`emit` 会同步按注册顺序调用所有监听器，监听器的返回值被丢弃，需要异步请在监听器里用 `setImmediate()` 或 `process.nextTick()`。
- **`this` 指向**：普通函数监听器里的 `this` 指向监听器所附加的 EventEmitter；箭头函数监听器里 `this` 不再指向该实例。
- **`on` 不去重**：多次用相同的 `eventName` 和 `listener` 调用 `on`，该监听器会被添加并调用多次；`removeListener` 每次也只移除一个实例，需要调用多次才能全部移除。
- **移除时机**：事件一旦开始触发，即使在监听器中调用 `removeListener()`/`removeAllListeners()`，本次 `emit` 中已排入的监听器仍会被依次调用；移除只影响后续的事件。
- **不要随意 `removeAllListeners`**：尤其当 EventEmitter 实例是其他组件（如 socket、文件流）创建时。
- `'newListener'` 在监听器被**插入内部数组之前**触发（在回调里再 `on` 同名事件，新监听器会被插到同名前面）；`'removeListener'` 在监听器被移除后触发。

### timers（定时器）

`timers` 模块暴露一组全局 API，用于在将来某个时间段调用调度函数，其实现基于 Node.js 事件循环而非浏览器的 HTML 规范。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `setTimeout(callback, delay[, ...args])` | `callback: <Function>` 到点要调用的函数；`delay: <number>` 等待毫秒数；`...args: <any>` 调用时传入的可选参数 | 预定在 delay 毫秒后执行一次回调，返回一个用于 `clearTimeout()` 的 `Timeout` |
| `setInterval(callback, delay[, ...args])` | `callback: <Function>`；`delay: <number>`；`...args: <any>` | 预定每隔 delay 毫秒重复执行回调，返回一个用于 `clearInterval()` 的 `Timeout` |
| `setImmediate(callback[, ...args])` | `callback: <Function>` 在当前事件循环回合结束时调用；`...args: <any>` | 预定立即执行的回调（**在 I/O 事件回调之后**被触发），返回一个用于 `clearImmediate()` 的 `Immediate` |
| `clearTimeout(timeout)` | `timeout: <Timeout>` 由 `setTimeout()` 返回 | 取消该定时器 |
| `clearInterval(timeout)` | `timeout: <Timeout>` 由 `setInterval()` 返回 | 取消该定时器 |
| `clearImmediate(immediate)` | `immediate: <Immediate>` 由 `setImmediate()` 返回 | 取消该 immediate |
| `timeout.ref()` | 无 | 要求事件循环在该 Timeout 活动期间不要退出；多次调用无效果。返回 Timeout 引用 |
| `timeout.unref()` | 无 | 该 Timeout 活动时不要求事件循环保持活动，进程可能在回调执行前退出；多次调用无效果。返回 Timeout 引用 |

#### 代码块（精确签名）

```js
// timers 是全局 API，无需 require('timers')
const timeout = setTimeout(callback, delay[, ...args]);   // callback: Function, delay: number
const interval = setInterval(callback, delay[, ...args]);  // callback: Function, delay: number
const immediate = setImmediate(callback[, ...args]);       // callback: Function

clearTimeout(timeout);
clearInterval(interval);
clearImmediate(immediate);

// Timeout 对象上的方法
timeout.ref();
timeout.unref();
```

#### Demo

```js
'use strict';

// 1) setTimeout：延迟执行一次
const t1 = setTimeout((name) => {
  console.log('1 秒后执行，参数为：', name);
}, 1000, 'timer-args');

// 2) setInterval：重复执行
let count = 0;
const t2 = setInterval(() => {
  count += 1;
  console.log('第', count, '次');
  if (count >= 3) {
    clearInterval(t2);   // 一定要在满足条件时清除，否则会一直重复
  }
}, 200);

// 3) setImmediate：在当前事件循环回合结束时、I/O 回调之后执行
setImmediate(() => {
  console.log('setImmediate 回调');
});

// 4) 取消一个尚未触发的 setTimeout
const t3 = setTimeout(() => {
  console.log('这段永远不会执行');
}, 5000);
clearTimeout(t3);

// 5) unref：即使还有这个定时器，进程也可以正常退出
const t4 = setTimeout(() => {
  console.log('进程还没退出的话才会执行');
}, 10000);
t4.unref();
t4.ref();   // 恢复 ref状态（unref 之后才需要）
```

#### 注意事项

- **不精确**：`setTimeout` 的回调**可能不会精确地在 delay 毫秒被调用**；Node.js 不能保证回调被触发的确切时间，也不能保证它们的顺序，只会在尽可能接近所指定的时间上调用。
- **delay 边界**：当 `delay` 大于 `2147483647` 或小于 `1` 时，`delay` 会被设为 `1`。
- **类型检查**：`callback` 不是函数时抛出 `TypeError`。
- **`setInterval` 的重复堆积**：若回调执行时间超过间隔时间，回调会不断重复执行，可能堆积任务；建议在回调里做耗时控制或改用 `setTimeout` 递归调度。
- **默认是 "ref'd" 的**：`setTimeout`/`setInterval` 返回的 Timeout 默认会保持事件循环存活，通常不需要手动 `ref()`；只有此前调用过 `unref()` 时才需要恢复。
- **`unref()` 的代价**：调用 `unref()` 会创建一个内部定时器来唤醒事件循环，创建太多这类定时器可能对性能产生负面影响。
- **`setImmediate` 的时机**：它在 I/O 事件的回调之后被触发；多次调用时回调按创建顺序执行，每次事件循环迭代都会处理整个回调队列；如果 immediate 是在某个正在执行的回调中排入队列的，则要到下一次事件循环迭代才触发。
- **promisified 变体无法取消**：`util.promisify(setImmediate)`、`util.promisify(setTimeout)` 创建的定时器**不可能被取消**。
- 定时器函数是全局的，使用时无需 `require('timers')`。

### process（进程）

`process` 是全局对象，提供当前 Node.js 进程的信息并用于控制该进程，它本身是 `EventEmitter` 的实例。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `process.argv` | 只读属性 | `<Array>` 启动进程时的命令行参数：`argv[0]` 为 `process.execPath`，`argv[1]` 为当前执行的 JS 文件路径，其余为用户参数 |
| `process.argv0` | 只读属性 | `<string>` 启动时传入的 `argv[0]` 的只读副本 |
| `process.env` | 可读写对象 | `<Object>` 用户环境信息对象；新增属性的值会被转换成字符串；Windows 下不区分大小写 |
| `process.exit([code])` | `code: <integer>` 结束状态码，默认 0 | 以状态码 code **同步终止**进程；未提供时使用 `process.exitCode` 或 0 |
| `process.exitCode` | 可读写属性 | `<integer>` 进程正常结束（或 `process.exit()` 未传参）时的状态码 |
| `process.platform` | 只读属性 | `<string>` 操作系统平台，如 `'aix'`、`'darwin'`、`'freebsd'`、`'linux'`、`'openbsd'`、`'sunos'`、`'win32'`（构建在 Android 上时可能为 `'android'`） |
| `process.arch` | 只读属性 | `<string>` CPU 架构，如 `'arm'`、`'arm64'`、`'ia32'`、`'mips'`、`'x32'`、`'x64'` 等 |
| `process.cwd()` | 无 | `<string>` 当前工作目录 |
| `process.chdir(directory)` | `directory: <string>` | 变更当前工作目录；失败（如目录不存在）会抛出异常 |
| `process.memoryUsage()` | 无 | `<Object>` 内存使用情况，单位字节：`rss`、`heapTotal`、`heapUsed`、`external` |
| `process.hrtime([time])` | `time: <Array>` 上一次 `hrtime()` 的结果 | `<Array>` `[seconds, nanoseconds]`；传入非 tuple 数组会抛 `TypeError` |
| `process.uptime()` | 无 | `<number>` 进程运行秒数（含小数） |
| `process.pid` / `process.ppid` | 只读属性 | `<integer>` 进程 PID / 父进程 PID |
| `process.version` / `process.versions` | 只读属性 | `<string>` / `<Object>` Node.js 版本与各依赖版本 |
| `process.nextTick(callback[, ...args])` | `callback: <Function>`；`...args: <any>` | 把 callback 加入 next tick 队列，在当前轮询队列完成后、任何 I/O 之前依次调用 |
| `process.emitWarning(warning[, options])` | `warning: <string>\|<Error>`；`options: <Object>` 含 `type`/`code`/`ctor`/`detail` | 发出自定义进程警告；v8.0.0 起支持 options 形式 |
| `process.cpuUsage([previousValue])` | `previousValue: <Object>` 上次返回值 | `<Object>` 含 `user`、`system`，单位微秒；传上次结果可求差值 |
| `process.abort()` | 无 | 立即结束进程并生成 core 文件 |
| `process.kill(pid[, signal])` | `pid: <number>`；`signal: <string>\|<number>` 默认 `'SIGTERM'` | 向目标进程发送信号；目标不存在会抛错；信号 `0` 可测试进程是否存在 |
| `process.umask([mask])` | `mask: <number>` | 返回或设置创建文件的权限掩码；不传参返回当前掩码，传入则设置并返回旧值 |

#### 代码块（精确签名）

```js
process.argv; // Array
process.env;                               // Object
process.exit([code]); // code: integer
process.exitCode = 1;                      // integer
process.platform;                          // string
process.arch;                              // string
process.cwd();                             // string
process.chdir(directory); // directory: string
process.memoryUsage();                     // { rss, heapTotal, heapUsed, external }
process.hrtime([time]);                    // time: Array -> [seconds, nanoseconds]
process.nextTick(callback[, ...args]);     // callback: Function
process.emitWarning(warning[, options]);  // warning: string | Error
process.on('exit', (code) => {});          // process 是 EventEmitter 实例
```

#### Demo

```js
'use strict';

// 1) 读取命令行参数
console.log('可执行文件：', process.argv[0]);
console.log('脚本路径：', process.argv[1]);
console.log('用户参数：', process.argv.slice(2));

// 2) 平台与架构
console.log(`平台 ${process.platform} / 架构 ${process.arch} / Node ${process.version}`);

// 3) 环境变量
process.env.MY_ENV = 'dev';               // 新增属性会被转成字符串
console.log('MY_ENV =', process.env.MY_ENV, '| PATH长度 =', (process.env.PATH || '').length);

// 4) 当前工作目录
console.log('当前目录：', process.cwd());

// 5) 内存与 CPU 统计
const mem = process.memoryUsage();
console.log(`堆已用 ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB，RSS ${(mem.rss / 1024 / 1024).toFixed(2)} MB`);
const start = process.cpuUsage();
const t0 = process.hrtime();
console.log('本次 CPU 使用(微秒)：', process.cpuUsage(start));
console.log('高精度耗时：', process.hrtime(t0));

// 6) nextTick 优先于 I/O 与定时器
process.nextTick(() => console.log('nextTick 先执行'));
setTimeout(() => console.log('setTimeout 后执行'), 0);

// 7) 未捕获异常：只做同步清理，不要试图恢复应用
process.on('uncaughtException', (err) => {
  console.error('捕获到未捕获异常：', err.message);
  process.exitCode = 1;   // 用 exitCode 让进程自然结束
});

// 8) exit 事件里只允许同步操作
process.on('exit', (code) => {
  console.log('即将退出，退出码：', code);
 // 这里的 setTimeout 回调永远不会被执行
});
```

#### 注意事项

- **`process.exit()` 会截断异步 I/O**：调用 `process.exit()` 会强制进程尽快结束，即使还有大量等待中的异步操作没完成，**包括写入 `process.stdout` / `process.stderr` 的 I/O**，可能导致输出被清空或丢失（因为 Node.js 中写 stdout 有时是异步的，可能跨越多个 tick）。正确做法是设置 `process.exitCode = 1` 让进程自然结束；若确实需要终止，抛出一个未捕获错误并允许进程正常结束更安全。
- **`'exit'` 事件只允许同步操作**：所有监听器回调执行完后，事件循环中排队的工作会被**强制丢弃**，进程立即结束。因此在 `'exit'` 里写 `setTimeout` 是无效的。
- **`'beforeExit'` vs `'exit'`**：事件循环清空且没有新工作被加入时触发 `'beforeExit'`（回调里做异步操作可让进程继续运行）；显式 `process.exit()` 或抛出未捕获异常时**不会**触发 `'beforeExit'`。除非本意就是追加异步工作，否则不要用 `'beforeExit'` 代替 `'exit'`。
- **`uncaughtException` 不是错误处理机制**：它是"最后补救"，等价于 On Error Resume Next是不安全的——未处理异常意味着应用已处于未定义状态。监听器里再抛出的异常不会被捕获，进程会以非零状态码结束（可能无限循环）。正确用法是执行已分配资源（文件描述符、句柄）的**同步清理**；更可靠的方案是用另一个进程来监测并重启应用。
- **`'unhandledRejection'`**：v7.0.0 起未处理的 Promise rejection已被废弃，v6.6.0 起会发出进程警告。回调参数为 `(reason, p)`。可用 `promise.catch(() => {})` 阻止该事件，或用 `'rejectionHandled'` 事件跟踪后续处理。
- **`'warning'` 事件**：默认会打印到 stderr，用 `--no-warnings` 可关闭默认输出但事件仍会发出；`--trace-warnings` 可显示完整堆栈。最佳实践是每个进程最多发一次同类警告。
- **`process.env` 的赋值**：在进程内部 `process.env.foo = 'bar'` 生效，但在外部 shell 中执行 `node -e 'process.env.foo = "bar"' && echo $foo` 不会生效，因为子进程无法修改父进程的环境。
- **信号事件**：`SIGINT`/`SIGTERM` 在非 Windows 平台有默认监听器，绑定新的监听器会移除默认行为（进程不再退出）；`SIGKILL`、`SIGSTOP` 不能绑定监听器；`SIGUSR1` 被 Node.js 保留用于启动调试器。Windows 下 Node.js 会在 `SIGHUP` 触发后 10 秒无条件关闭。
- **退出码**：正常结束为 0；未捕获异常为 1；V8 致命错误为 5；被信号终止时为 `128 + 信号码`（如 `SIGKILL` → 137）。
- **平台限制**：`process.getuid/geteuid/getgid/getegid/getgroups/setuid/seteuid/setgid/setegid/setgroups/initgroups` 仅在 POSIX 平台有效（Windows/Android 上无效），使用前应先判断 `if (process.getuid)`。

### globals（全局对象）

Node.js 中有一组在所有模块中都可直接使用的全局变量，其中一部分（`__dirname`、`__filename`、`exports`、`module`、`require()`）的作用域仅在模块内。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `global` | 只读属性 | `<Object>` 全局的命名空间对象（v0.1.27） |
| `console` | 只读属性 | `<Object>` 用于打印 stdout 和 stderr（v0.1.100） |
| `process` | 只读属性 | `<Object>` 进程对象（v0.1.7） |
| `Buffer` | 只读属性 | `<Function>` 用于处理二进制数据（v0.1.103） |
| `__dirname` | 模块内变量 | 当前模块文件所在目录的绝对路径（**仅模块内作用域**） |
| `__filename` | 模块内变量 | 当前模块文件的绝对路径（**仅模块内作用域**） |
| `exports` | 模块内变量 | 当前模块的导出对象（**仅模块内作用域**） |
| `module` | 模块内变量 | 当前模块对象（**仅模块内作用域**） |
| `require()` | `require(id)` | 加载模块（**仅模块内作用域**） |
| `setTimeout(callback, delay[, ...args])` | `callback: <Function>`；`delay: <number>` | 预定一次延迟执行（全局 API，无需 require） |
| `setInterval(callback, delay[, ...args])` | `callback: <Function>`；`delay: <number>` | 预定重复执行 |
| `setImmediate(callback[, ...args])` | `callback: <Function>` | 预定在当前事件循环回合结束时执行 |
| `clearTimeout(timeoutObject)` | `timeoutObject: <Timeout>` | 取消定时器 |
| `clearInterval(intervalObject)` | `intervalObject: <Timeout>` | 取消定时器 |
| `clearImmediate(immediateObject)` | `immediateObject: <Immediate>` | 取消 immediate |

#### 代码块（精确签名）

```js
global;                       // Object：全局命名空间
console;                      // Object：stdout / stderr 输出
process;                      // Object：进程对象
Buffer;                       // Function：二进制数据处理

// 仅在模块内作用域有效
__dirname;
__filename;
exports;
module;
require(id);

setTimeout(callback, delay[, ...args]);
setInterval(callback, delay[, ...args]);
setImmediate(callback[, ...args]);
clearTimeout(timeoutObject);
clearInterval(intervalObject);
clearImmediate(immediateObject);
```

#### Demo

```js
'use strict';

// 1) 全局命名空间对象
global.myAppConfig = { name: 'koa-demo', port: 3000 };
console.log('通过 global 挂载的配置：', global.myAppConfig);

// 2) 顶层作用域不是全局作用域（与浏览器不同）
var topLevel = '我只在当前模块内可见';
console.log('顶层 var 可见：', topLevel);
// console.log(global.topLevel);  // undefined，因为顶层 var 的作用域只在模块内

// 3) 模块内变量：__dirname / __filename / module / exports / require
console.log('当前模块目录：', __dirname);
console.log('当前模块文件：', __filename);
console.log('当前模块对象 id：', module.id);
console.log('exports 初始为空对象：', JSON.stringify(exports));

// 4) Buffer 是全局的（处理二进制数据）
const buf = Buffer.from('Node.js', 'utf8');
console.log('Buffer 内容：', buf.toString('utf8'), '字节数：', buf.length);

// 5) 定时器同样是全局 API
const t = setTimeout(() => console.log('全局 setTimeout'), 10);
clearTimeout(t);
```

#### 注意事项

- **模块作用域 vs 全局作用域**：浏览器中顶层 `var` 就是全局变量；Node.js 中顶层作用域**不是**全局作用域，`var something` 的作用域只在模块内。真正要挂到全局请显式使用 `global.xxx = ...`。
- **`__dirname`、`__filename`、`exports`、`module`、`require()` 只在模块内可见**，它们不是真正的全局变量。
- **`console`、`process`、`Buffer`、`global` 是 Node.js 特有的全局对象**；其中一些内置对象本身是 JavaScript 语言的一部分（如 `Buffer` 之于二进制处理）。
- **`process.stdout` / `process.stderr` 与其他流不同**：不能被 `end()` 关闭（调用会抛异常），也永远不会触发 `'finish'` 事件；写操作是否同步取决于连接的是文件、TTY 还是管道，以及操作系统是 Windows 还是 POSIX。用 `isTTY` 属性判断是否连接到终端。
- **同步写会阻塞事件循环**：向终端或慢速管道写 stdout/stderr 时可能长时间阻塞事件循环，在生产环境记录日志时需要留心。

### assert（断言）

`assert` 模块提供用于测试不变式的断言函数，断言失败时抛出带有 `message` 属性的 `AssertionError`。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `assert(value[, message])` | `value: <any>`；`message: <any>` | `assert.ok()` 的别名 |
| `assert.ok(value[, message])` | `value: <any>`；`message: <any>` | 测试 value 是否为真值，相当于 `assert.equal(!!value, true, message)`；不为真值则抛 `AssertionError` |
| `assert.equal(actual, expected[, message])` | `actual`/`expected: <any>`；`message: <any>` | 用相等运算符 `==` 比较；不相等则抛 `AssertionError` |
| `assert.strictEqual(actual, expected[, message])` | 同上 | 用全等运算符 `===` 比较；不全等则抛 `AssertionError` |
| `assert.notEqual(actual, expected[, message])` | 同上 | 用 `!=` 比较；相等则抛错 |
| `assert.notStrictEqual(actual, expected[, message])` | 同上 | 用 `!==` 比较；全等则抛错 |
| `assert.deepEqual(actual, expected[, message])` | 同上 | 深度相等测试，原始值用 `==`；只测可枚举的自身属性，不测原型 |
| `assert.deepStrictEqual(actual, expected[, message])` | 同上 | 深度全等测试，原始值用 `===`，原型与类型标签也要一致 |
| `assert.notDeepEqual(actual, expected[, message])` | 同上 | `deepEqual` 的反面 |
| `assert.notDeepStrictEqual(actual, expected[, message])` | 同上 | `deepStrictEqual` 的反面 |
| `assert.throws(block[, error][, message])` | `block: <Function>`；`error: <RegExp>\|<Function>`；`message: <any>` | 断言 block 会抛出错误；error 可为构造函数、正则或自定义函数 |
| `assert.doesNotThrow(block[, error][, message])` | 同上 | 断言 block **不会**抛出错误；类型不匹配或 error 为 undefined 时抛出原错误 |
| `assert.ifError(value)` | `value: <any>` | value 为真则抛出 value，可用于测试回调函数的 error 参数 |
| `assert.fail(message)` / `assert.fail(actual, expected[, message[, operator[, stackStartFunction]]])` | `operator: <string>` 默认 `'!='`；`stackStartFunction: <function>` 默认 `assert.fail` | 抛出 `AssertionError`；给出 message 时它作为错误信息 |

#### 代码块（精确签名）

```js
const assert = require('assert');

assert(value[, message]);                       // value: any, message: any
assert.ok(value[, message]);                    // value: any
assert.equal(actual, expected[, message]);      // actual/expected: any
assert.strictEqual(actual, expected[, message]);
assert.notEqual(actual, expected[, message]);
assert.notStrictEqual(actual, expected[, message]);
assert.deepEqual(actual, expected[, message]);
assert.deepStrictEqual(actual, expected[, message]);
assert.notDeepEqual(actual, expected[, message]);
assert.notDeepStrictEqual(actual, expected[, message]);
assert.throws(block[, error][, message]);       // block: Function, error: RegExp | Function
assert.doesNotThrow(block[, error][, message]);
assert.ifError(value);                          // value: any
assert.fail(message);
assert.fail(actual, expected[, message[, operator[, stackStartFunction]]]);
```

#### Demo

```js
'use strict';
const assert = require('assert');

// 1) ok：测试真值
assert.ok(true, '应当为真值');
assert.ok(1);
// assert.ok(false, '不是真值');   // 抛出 AssertionError: 不是真值

// 2) equal 使用 ==，strictEqual 使用 ===
assert.equal(1, '1');      // 通过，1 == '1'
assert.strictEqual(1, 1);  // 通过
// assert.strictEqual(1, '1');   // 抛出 AssertionError: 1 === '1'

// 3) 深度比较：deepEqual 不比较原型，deepStrictEqual 比较
const obj1 = { a: { b: 1 } };
const obj2 = Object.create(obj1);
assert.deepEqual(obj1, obj2);          // 通过，不测试原型
// assert.deepStrictEqual(obj1, obj2); // 抛出 AssertionError: {} deepStrictEqual Date {}

// 4) throws：error 参数可以是构造函数、正则或自定义函数
assert.throws(
  () => { throw new Error('错误信息'); },
  Error
);
assert.throws(
  () => { throw new Error('错误信息'); },
  /错误/
);
assert.throws(
  () => { throw new Error('错误信息'); },
  (err) => err instanceof Error && /错误/.test(err.message),
  '不是期望的错误'
);

// 5) doesNotThrow：类型不匹配时会把原错误抛出来
assert.doesNotThrow(() => {
  // 这里不应该抛错
});

// 6) ifError：用于测试回调的 error 参数
function cb(err, data) {
  assert.ifError(err);   // err 为真值时抛出 err
  return data;
}
cb(null, 'ok');

// 7) fail：显式让测试失败
// assert.fail(1, 2, undefined, '>');   // 抛出 AssertionError [ERR_ASSERTION]: 1 > 2

console.log('全部断言通过');
```

#### 注意事项

- **`assert.throws` 的第二个参数不能是字符串**：若第二个参数是字符串，会被视为省略了 `error` 参数，该字符串被当作 `message` 使用。应写成 `assert.throws(myFunction, /错误信息/, '没有抛出期望的信息')`。
- **`doesNotThrow` 的行为差异**：若抛出的错误类型与 `error` 指定的不同，或 `error` 为 `undefined`，它抛出的是**原始错误**；只有类型匹配时才抛 `AssertionError`（信息形如 `Got unwanted exception (TypeError).`）。
- **`equal` 系列是宽松比较**：`assert.equal(1, '1')` 会通过，`assert.equal({a:{b:1}}, {a:{b:1}})` 会失败（对象按引用比较），需要比较对象结构请用 `deepEqual`。
- **`deepEqual` 只测可枚举的自身属性**：不测试原型、连接符（Symbol）或不可枚举属性；这些请用 `deepStrictEqual`。
- **SameValueZero 语义**：文档建议需要 SameValueZero 比较时使用 ES2015 的 `Object.is()`——`assert.notStrictEqual(0, -0)` 会通过（`===` 不区分 ±0），而 `Object.is(0, -0)` 为 false；`assert.strictEqual(NaN, NaN)` 会失败，而 `Object.is(NaN, NaN)` 为 true。
- **`message` 为 undefined 时**使用默认错误信息；`message` 会被作为 `AssertionError` 的 `message` 属性。

### module（模块）

模块系统为每个 `.js` 文件提供一个模块级包装（`module`、`exports`、`require()`、`__filename`、`__dirname`），并通过缓存机制让同一模块只被求值一次。

> 说明：本次抓取的 `module.txt` 源文件返回 **404 Not Found**，因此本节仅依据 `globals.txt` 中关于 `module`/`require()`/`exports`/`__dirname`/`__filename` 作用域的描述编写，未引入该文档以外的内容。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `module` | 模块内变量 | 当前模块对象（仅模块内作用域） |
| `exports` | 模块内变量 | 当前模块的导出对象（仅模块内作用域） |
| `require()` | `require(id)` | 加载模块（仅模块内作用域） |
| `__filename` | 模块内变量 | 当前模块文件的绝对路径（仅模块内作用域） |
| `__dirname` | 模块内变量 | 当前模块文件所在目录的绝对路径（仅模块内作用域） |

#### 代码块（精确签名）

```js
// 以下变量/函数只在模块内作用域可见
module; // 当前模块对象
exports;       // 当前模块的导出对象
require(id);   // id: string
__filename;    // string
__dirname;     // string
```

#### Demo

```js
'use strict';
// demo-module.js —— 一个最简单的 CommonJS 模块

// 1) exports 方式导出
exports.add = (a, b) => a + b;

// 2) module.exports 方式导出（与 exports 是同一个对象，赋值为整体替换）
module.exports = {
  mul: (a, b) => a * b
};

// 3) 私有变量：不导出，外部访问不到
const secret = 'only-inside';
```

```js
'use strict';
// demo-main.js —— 引用上面的模块
const m = require('./demo-module');

console.log('add(1, 2) =', m.add(1, 2));
console.log('mul(3, 4) =', m.mul(3, 4));
console.log('__filename =', __filename);
console.log('__dirname  =', __dirname);

// 模块缓存：两次 require 同一个路径得到同一个 exports 对象
const again = require('./demo-module');
console.log('是同一个实例吗？', again === m);
console.log('缓存对象：', require.cache[require.resolve('./demo-module')] !== undefined);
```

#### 注意事项

- **模块缓存**：`require()` 对同一模块路径只会求值一次，后续 `require()` 返回缓存中的同一个 `exports` 对象（可用 `require.cache` 查看）。若需要重新加载模块，必须先删除对应的缓存条目。
- **作用域隔离**：`__dirname`、`__filename`、`exports`、`module`、`require()` 只在模块内作用域可见，不会泄漏到全局。
- **exports 与 module.exports**：`exports` 是 `module.exports` 的初始引用，两者初始指向同一个对象；一旦把 `module.exports` 重新赋值为新对象，之前挂在 `exports` 上的属性就不再被导出。
- **`require()` 的路径解析**依赖于模块文件所在位置，跨目录引用时注意相对路径基准是当前模块目录而不是工作目录（工作目录请用 `process.cwd()`）。

### v8

`v8` 模块暴露了内置在 Node.js 二进制文件中的 V8 专属 API，可用于查看堆内存统计、设置 V8 命令行标志以及进行结构化克隆式的序列化。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `v8.getHeapStatistics()` | 无 | `<Object>` 含 `total_heap_size`、`total_heap_size_executable`、`total_physical_size`、`total_available_size`、`used_heap_size`、`heap_size_limit`、`malloced_memory`、`peak_malloced_memory`、`does_zap_garbage` |
| `v8.getHeapSpaceStatistics()` | 无 | `<Array>` 每项含 `space_name`、`space_size`、`space_used_size`、`space_available_size`、`physical_space_size`；堆空间的顺序与可用性不保证 |
| `v8.cachedDataVersionTag()` | 无 | `<integer>` 由 V8 版本、命令行标志和检测到的 CPU 功能派生，用于判断 `vm.Script` 的 cachedData 是否兼容 |
| `v8.setFlagsFromString(string)` | `string: <string>` | 设置 V8 引擎的命令行标志；应谨慎使用 |
| `v8.serialize(value)` | `value: <any>` | `<Buffer>` 用 DefaultSerializer 序列化值到缓冲区 |
| `v8.deserialize(buffer)` | `buffer: <Buffer>\|<Uint8Array>` | 用默认配置反序列化出一个 JS 值 |

#### 代码块（精确签名）

```js
const v8 = require('v8');

v8.getHeapStatistics();
v8.getHeapSpaceStatistics();
v8.cachedDataVersionTag();
v8.setFlagsFromString(string);      // string: string

v8.serialize(value);                // value: any -> Buffer
v8.deserialize(buffer);             // buffer: Buffer | Uint8Array

// 序列化类（实验性质）
const serializer = new v8.Serializer();
serializer.writeHeader();
serializer.writeValue(value);
serializer.releaseBuffer();         // -> Buffer

const deserializer = new v8.Deserializer(buffer);
deserializer.readHeader();
deserializer.readValue();
```

#### Demo

```js
'use strict';
const v8 = require('v8');

// 1) 堆统计
const stats = v8.getHeapStatistics();
console.log('已用堆大小 (MB)：', (stats.used_heap_size / 1024 / 1024).toFixed(2));
console.log('堆上限 (MB)：', (stats.heap_size_limit / 1024 / 1024).toFixed(2));
console.log('malloced_memory：', stats.malloced_memory, '| does_zap_garbage：', stats.does_zap_garbage);

// 2) 堆空间统计（顺序和可用性在不同 V8 版本中不保证）
console.log('堆空间列表：');
v8.getHeapSpaceStatistics().forEach((s) => {
  console.log(`  ${s.space_name}: size=${s.space_size}, used=${s.space_used_size}`);
});

// 3) cachedDataVersionTag
console.log('cachedDataVersionTag：', v8.cachedDataVersionTag());

// 4) 序列化 / 反序列化（兼容 HTML structured clone algorithm）
const buf = v8.serialize({ name: 'koa-demo', list: [1, 2, 3] });
console.log('序列化后是 Buffer 吗？', Buffer.isBuffer(buf), '字节数：', buf.length);
const restored = v8.deserialize(buf);
console.log('反序列化结果：', restored);

// 5) 设置 V8 标志：打印 1 分钟的 GC 事件，然后关闭
v8.setFlagsFromString('--trace_gc');
setTimeout(() => {
  v8.setFlagsFromString('--notrace_gc');
}, 60e3);
```

#### 注意事项

- **API 可能随时变动**：文档明确指出 `v8` 的 API 和实现可能在任何时间变化。
- **`setFlagsFromString` 需谨慎**：在虚拟机已经运行后修改其设置可能造成不可预测的结果，包括崩溃和数据丢失，或者一点作用也没有。针对特定版本的 Node.js，可用选项通过 `node --v8-options` 获取。
- **序列化 API 是实验性质**（稳定性 1）：格式向下兼容，可安心存储于硬盘，但 API 或传输格式仍可能发生不兼容的变化，直到该警告被移除。
- **`releaseBuffer()` 的副作用**：返回内部缓冲区后不应再使用该序列化机制；如果之前某次写入失败，调用此方法会造成不可预知的行为。
- **`getHeapSpaceStatistics()` 的顺序与可用性不保证**：不能依赖某个空间一定存在。
- **`does_zap_garbage`** 是 0/1 布尔值，凸显是否设置了 `--zap_code_space`；为真时 V8 会用位模式覆盖堆中的垃圾，RSS 会不断变大。

### perf_hooks（性能钩子 / Performance Timing API）

`perf_hooks` 实现了 W3C Performance Timeline 规范，用于采集高精度的性能指标，与现代浏览器中的 Performance API 相同（稳定性 1 - 实验性质，v8.5.0 引入）。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `performance.now()` | 无 | `<number>` 当前的高精度毫秒时间戳 |
| `performance.timeOrigin` | 只读属性 | `<number>` 所有性能指标 duration 的测量起点 |
| `performance.mark([name])` | `name: <string>` 可选 | 创建一个 PerformanceMark 条目，`entryType` 恒为 `'mark'`，`duration` 恒为 0 |
| `performance.measure(name, startMark, endMark)` | `name: <string>`；`startMark: <string>`；`endMark: <string>` | 创建 PerformanceMeasure 条目，duration 为两个标记之间的毫秒数 |
| `performance.getEntries()` | 无 | `<Array>` 按 `startTime` 顺序返回全部 PerformanceEntry |
| `performance.getEntriesByName(name[, type])` | `name: <string>`；`type: <string>` 可选 | `<Array>` 按名称（可选再按类型）过滤的条目 |
| `performance.getEntriesByType(type)` | `type: <string>` | `<Array>` 按 `entryType` 过滤的条目 |
| `performance.clearMarks([name])` | `name: <string>` 可选 | 不传则移除全部 PerformanceMark，传则只移除指定的 |
| `performance.clearMeasures([name])` | `name: <string>` 可选 | 不传则移除全部 PerformanceMeasure |
| `performance.clearGC()` | 无 | 移除所有 `entryType` 为 `'gc'` 的条目 |
| `performance.clearFunctions([name])` | `name: <string>` 可选 | 不传则移除全部 PerformanceFunction 对象 |
| `performance.timerify(fn)` | `fn: <Function>` | 包装函数并测量其运行时间；需订阅 `'function'` 事件类型才能取到明细 |
| `performance.nodeTiming` | 只读属性 | `<PerformanceNodeTiming>` Node.js 自身各阶段的时间点，如 `nodeStart`、`v8Start`、`bootstrapComplete`、`moduleLoadStart/End`、`loopStart/Exit` 等 |
| `new PerformanceObserver(callback)` | `callback: <Function>` 即 `(list, observer) => {}` | 监听新增 PerformanceEntry 的通知器 |
| `observer.observe(options)` | `options: <Object>`：`entryTypes: <Array>`（必填，否则报错）、`buffered: <boolean>` 默认 false | 订阅指定类型的条目通知 |
| `observer.disconnect()` | 无 | 断开该 observer 的所有通知 |

#### 代码块（精确签名）

```js
const { performance, PerformanceObserver } = require('perf_hooks');

performance.now();                          // -> number
performance.timeOrigin;                    // -> number
performance.mark([name]);                  // name: string
performance.measure(name, startMark, endMark);  // name/startMark/endMark: string
performance.getEntries(); // -> Array
performance.getEntriesByName(name[, type]);
performance.getEntriesByType(type);
performance.clearMarks([name]);
performance.clearMeasures([name]);
performance.clearGC();
performance.clearFunctions([name]);
performance.timerify(fn);                  // fn: Function
performance.nodeTiming;                    // -> PerformanceNodeTiming

new PerformanceObserver(callback);         // callback: (list, observer) => void
observer.observe(options);                  // options: { entryTypes: Array, buffered?: boolean }
observer.disconnect();
```

#### Demo

```js
'use strict';
const { performance, PerformanceObserver } = require('perf_hooks');

// 1) 用 mark / measure 测量一段同步逻辑的耗时
performance.mark('A');
doSomeLongRunningProcess();
performance.mark('B');
performance.measure('A to B', 'A', 'B');

const measure = performance.getEntriesByName('A to B')[0];
console.log('A 到 B 之间耗时(ms)：', measure.duration);
console.log('条目类型：', measure.entryType, '| 名称：', measure.name, '| 起始时间：', measure.startTime);

// 2) timerify：测量函数运行时间
function someFunction() {
  console.log('hello world');
}
const wrapped = performance.timerify(someFunction);

const obs = new PerformanceObserver((list, observer) => {
  console.log('函数耗时(ms)：', list.getEntries()[0].duration);
  observer.disconnect(); // 用完立刻断开，避免额外性能开销
  performance.clearFunctions();
});
obs.observe({ entryTypes: ['function'] });
wrapped();

// 3) 观察 mark事件：buffered 为 true 时回调只触发一次，list 中包含全部条目
const obs2 = new PerformanceObserver((list, observer) => {
  console.log('一次收到条目数：', list.getEntries().length);
  observer.disconnect();
});
obs2.observe({ entryTypes: ['mark'], buffered: true });

for (let n = 0; n < 3; n++) {
  performance.mark(`test${n}`);
}

// 4) Node.js 自身的启动时间点
console.log('nodeStart：', performance.nodeTiming.nodeStart);
console.log('v8Start：', performance.nodeTiming.v8Start);
console.log('bootstrapComplete：', performance.nodeTiming.bootstrapComplete);

// 辅助函数
function doSomeLongRunningProcess() {
  let sum = 0;
  for (let i = 0; i < 5e6; i++) {
    sum += i;
  }
  return sum;
}
```

#### 注意事项

- **稳定性为 1（实验性质）**：API 仍可能变化，`Performance`、`PerformanceObserver` 等均在 v8.5.0 才新增，低版本 Node.js 上不可用。
- **`observe()` 必须提供 `entryTypes`**：不提供会抛出错误。
- **`buffered` 的区别**：`buffered: false`（默认）时每个条目都会**同步**触发一次回调（回调里 list 只有一项）；`buffered: true` 时回调通过 `setImmediate()` 调用，多个通知会在内部缓冲，回调只触发一次且 list 包含全部条目。
- **`PerformanceObserver` 会带来额外性能开销**：不应长期订阅，用完应立即 `disconnect()`。
- **`timerify` 的明细需要订阅 `'function'` 事件类型**才能被访问到；用 `performance.clearFunctions()` 释放内存。
- **`measure()` 的标记要求**：`endMark` 必须是已存在的 PerformanceMark 或 PerformanceNodeTiming 提供的时间戳属性，否则会抛错；`startMark` 不存在时默认取 `timeOrigin`。
- **条目类型**：`entryType` 可能是 `'node'`、`'mark'`、`'measure'`、`'gc'` 或 `'function'`；当为 `'gc'` 时，`kind` 属性标识 GC 类型（`NODE_PERFORMANCE_GC_MAJOR` / `MINOR` / `INCREMENTAL` / `WEAKCB`）。

---

**网络模块：http / https / http2 / net / dns / dgram**

### http

HTTP 服务器与客户端模块，提供基于流的低层 HTTP 协议实现，不缓冲完整请求/响应，消息头与消息体由用户自行解析。

#### 核心 API

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `http.createServer([requestListener])` | `requestListener` <Function>，被自动添加到 `'request'` 事件 | 返回新建的 `http.Server` 实例；实践中也常写作 `http.createServer([options][, requestListener])` |
| `http.request(options[, callback])` | `options` <Object\|string\|URL>；`callback` <Function> 挂到 `'response'` 事件 | 返回 `http.ClientRequest`（可写流），必须调用 `req.end()` |
| `http.get(options[, callback])` | 同 `http.request`；`method` 固定为 GET | 返回 `http.ClientRequest`，自动调用 `req.end()` |
| `http.globalAgent` | — | 所有 HTTP 客户端请求默认使用的 `http.Agent` 实例 |
| `http.METHODS` | — | 解析器支持的 HTTP 方法列表 <Array> |
| `http.STATUS_CODES` | — | 标准状态码及其简短描述的对象，如 `http.STATUS_CODES[404] === 'Not Found'` |
| `new http.Agent([options])` | `options`：`keepAlive`(默认 false)、`keepAliveMsecs`(默认 1000)、`maxSockets`(默认 Infinity)、`maxFreeSockets`(默认 256) | 返回管理连接复用/池化的代理对象 |
| `agent.destroy()` | — | 销毁当前正被代理使用的任何 socket |
| `server.listen()` | 同 `net.Server` 的 `listen()` | 开启 HTTP 服务器监听 |
| `server.close([callback])` | `callback` <Function> | 停止接收新连接（详见 `net.Server.close()`） |
| `server.setTimeout([msecs][, callback])` | `msecs` 默认 120000（2 分钟） | 设置 socket 超时；返回 server |
| `server.timeout` | — | 空闲超时毫秒数，默认 120000；设为 `0` 禁用 |
| `server.keepAliveTimeout` | — | 最后一个响应后等待额外传入数据的毫秒数，默认 5000；`0` 禁用 |
| `server.maxHeadersCount` | — | 请求头最大数量，默认 2000，`0` 表示无限制 |
| `server.listening` | — | <boolean>，服务器是否正在监听 |
| `message.url` | — | <string>，仅服务端请求有效，仅含实际请求中的 URL 部分 |
| `message.method` | — | <string>，仅服务端请求有效，如 `'GET'`、`'DELETE'` |
| `message.headers` | — | <Object>，请求/响应头对象，键名全部小写 |
| `message.rawHeaders` | — | <Array>，原始头列表 `[key, value, key2, value2, ...]`，偶数位为键 |
| `message.httpVersion` | — | <string>，`'1.1'` 或 `'1.0'` |
| `message.statusCode` / `message.statusMessage` | — | <number>/<string>，仅客户端响应有效 |
| `message.setTimeout(msecs, callback)` | — | 调用 `message.connection.setTimeout()`；返回 message |
| `message.destroy([error])` | `error` <Error> | 销毁底层 socket；传 error 则触发 `'error'` 事件 |
| `message.socket` | — | <net.Socket>，底层 socket |
| `request.setHeader(name, value)` | `value` <string\|string[]> | 设置请求头；同名多值用数组 |
| `request.getHeader(name)` / `request.removeHeader(name)` | `name` <string> | 读取/移除请求头，**名称大小写敏感** |
| `request.write(chunk[, encoding][, callback])` | `chunk` <string\|Buffer>，`encoding` 默认 `'utf8'` | 发送请求体的一块；返回 request |
| `request.end([data[, encoding]][, callback])` | 同上 | 结束发送请求；分块请求会发送终止字符 `'0\r\n\r\n'` |
| `request.flushHeaders()` | — | 刷新请求头，跳过「与首块数据打包」的优化 |
| `request.setTimeout(timeout[, callback])` | `timeout` <number> 毫秒 | socket 分配并连接后调用 `socket.setTimeout()`；返回 request |
| `request.abort()` | — | 标记请求终止，丢弃剩余数据并销毁 socket |
| `request.socket` | — | <net.Socket>，`response.end()` 之后为 null |
| `response.setHeader(name, value)` | `value` <string\|string[]> | 设置隐式响应头；值含非法字符抛 `TypeError` |
| `response.getHeader(name)` / `response.removeHeader(name)` | `name` <string> | 读取/移除响应头，**名称不区分大小写** |
| `response.getHeaderNames()` | — | <Array>，唯一响应头名称数组（小写） |
| `response.getHeaders()` | — | <Object>，当前响应头的浅拷贝，无 Object 原型方法 |
| `response.hasHeader(name)` | `name` <string> | <boolean>，是否已设置该响应头 |
| `response.headersSent` | — | <boolean>（只读），响应头是否已发送 |
| `response.writeHead(statusCode[, statusMessage][, headers])` | `statusCode` <number> 三位；`headers` <Object> | 发送响应头；消息中只能调用一次，且必须在 `end()` 之前 |
| `response.write(chunk[, encoding][, callback])` | `chunk` <string\|Buffer> | 返回 <boolean>：全部刷新到内核缓冲为 true，仍在内存排队为 false（此时监听 `'drain'`） |
| `response.end([data][, encoding][, callback])` | 同上 | 通知服务器响应已全部发送；**每次响应都必须调用** |
| `response.statusCode` / `response.statusMessage` | — | 隐式响应头模式下控制状态码/状态描述 |
| `response.setTimeout(msecs[, callback])` | — | 设置 socket 超时；返回 response |
| `response.addTrailers(headers)` | `headers` <Object> | 添加尾部响应头，仅分块编码时才会发送 |
| `response.writeContinue()` | — | 发送 `100 Continue` |
| `response.socket` / `response.connection` | — | <net.Socket>，底层 socket |
| `response.finished` / `response.sendDate` | — | <boolean>，响应是否已完成 / 是否自动生成 Date 响应头（默认 true） |

Server 事件：`'request'`、`'connection'`、`'clientError'`（`err, socket`，err 含 `bytesParsed`、`rawPacket`）、`'checkContinue'`、`'checkExpectation'`、`'connect'`、`'upgrade'`、`'close'`。
ClientRequest 事件：`'response'`、`'socket'`、`'connect'`、`'continue'`、`'upgrade'`、`'abort'`、`'timeout'`、`'error'`。
IncomingMessage 事件：`'aborted'`、`'close'`。

常用状态码（`http.STATUS_CODES` 提供完整集合）：

| 状态码 | 描述 | 典型用途 |
| --- | --- | --- |
| 100 | Continue | 客户端发送请求体前的确认 |
| 200 | OK | 请求成功 |
| 201 | Created | 资源已创建 |
| 204 | No Content | 成功但无响应体 |
| 301 / 302 | Moved Permanently / Found | 重定向 |
| 304 | Not Modified | 缓存命中 |
| 400 | Bad Request | 请求格式错误 |
| 401 | Unauthorized | 未认证 |
| 403 | Forbidden | 拒绝访问 |
| 404 | Not Found | 资源不存在 |
| 405 | Method Not Allowed | 方法不允许 |
| 408 | Request Timeout | 请求超时 |
| 413 | Payload Too Large | 请求体过大 |
| 417 | Expectation Failed | `Expect` 头不被满足 |
| 500 | Internal Server Error | 服务端异常 |
| 502 | Bad Gateway | 上游网关错误 |
| 503 | Service Unavailable | 服务不可用 |
| 504 | Gateway Timeout | 网关超时 |

#### 精确签名

```js
http.createServer([requestListener])            // v8 文档签名；返回 http.Server
http.request(options[, callback])               // options: Object | string | URL
http.get(options[, callback])                   // 自动 GET 并调用 req.end()
http.METHODS                                   // Array
http.STATUS_CODES                               // Object

server.listen([port][, host][, backlog][, callback])
server.close([callback])
server.setTimeout([msecs][, callback])          // 默认 120000
server.maxHeadersCount                          // 默认 2000

request.setHeader(name, value)
request.getHeader(name)
request.removeHeader(name)
request.write(chunk[, encoding][, callback])
request.end([data[, encoding]][, callback])
request.flushHeaders()
request.setTimeout(timeout[, callback])
request.abort()

response.setHeader(name, value)
response.getHeader(name)
response.getHeaderNames()
response.getHeaders()
response.hasHeader(name)
response.removeHeader(name)
response.writeHead(statusCode[, statusMessage][, headers])
response.write(chunk[, encoding][, callback])
response.end([data][, encoding][, callback])
response.setTimeout(msecs[, callback])
response.addTrailers(headers)
response.writeContinue()

message.setTimeout(msecs, callback)
message.destroy([error])
```

#### Demo：原生 http 服务 + 请求体解析 + 静态文件 + 404/500 处理

```js
// server.js —— 原生 http 服务：请求体解析 + 静态文件 + 404/500 处理
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 3000;
const ROOT = path.join(__dirname, 'public');          // 静态文件根目录
const MAX_BODY = 1024 * 1024;                          // 请求体最大 1MB

// 常见扩展名 -> Content-Type
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

// 读取并解析请求体（必须消费掉，否则连接会挂起）
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// 发送 JSON 响应
function sendJSON(res, statusCode, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length
  });
  res.end(body);
}

// 发送静态文件
function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream'
  });
  // 使用流管道，避免大文件全部读入内存
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsed.pathname);

  try {
    // 1) POST 接口：解析请求体
    if (req.method === 'POST' && pathname === '/api/echo') {
      const raw = await readBody(req);
      const contentType = req.headers['content-type'] || '';
      let parsedBody;
      if (contentType.includes('application/json')) {
        parsedBody = JSON.parse(raw.toString('utf8'));   // 解析失败会抛错，被 catch 捕获
      } else {
        parsedBody = raw.toString('utf8');
      }
      return sendJSON(res, 200, { ok: true, method: req.method, body: parsedBody });
    }

    // 2) GET 接口：返回查询参数
    if (req.method === 'GET' && pathname === '/api/time') {
      return sendJSON(res, 200, { now: new Date().toISOString() });
    }

    // 3) 静态文件
    if (req.method === 'GET' || req.method === 'HEAD') {
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const target = path.join(ROOT, relative);
      // 防目录穿越：目标必须仍在 ROOT 之内
      if (!target.startsWith(ROOT)) {
        return sendJSON(res, 403, { error: 'Forbidden' });
      }
      fs.stat(target, (err, stat) => {
        if (err || !stat.isFile()) {
          return sendJSON(res, 404, { error: 'Not Found', path: pathname });
        }
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Length': stat.size });
          return res.end();
        }
        sendFile(res, target);
      });
      return;
    }

    // 4) 其余方法：405
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  } catch (err) {
    // 5) 500 处理
    console.error('服务端异常:', err);
    if (err.message === 'PAYLOAD_TOO_LARGE') {
      return sendJSON(res, 413, { error: 'Payload Too Large' });
    }
    if (res.headersSent) {          // 响应头已发出，只能中断连接
      return res.destroy();
    }
    sendJSON(res, 500, { error: 'Internal Server Error' });
  }
});

// 处理客户端错误（如非法 HTTP 报文）
server.on('clientError', (err, socket) => {
  if (!socket.writable) return socket.destroy();
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

// 设置空闲超时与 keep-alive 超时
server.keepAliveTimeout = 5000;
server.setTimeout(120000);

server.listen(PORT, () => {
  console.log(`HTTP 服务已启动: http://127.0.0.1:${PORT}`);
});
```

配套客户端（演示请求体解析与 keep-alive 复用）：

```js
// client.js —— 调用上面的服务
const http = require('http');

const payload = JSON.stringify({ name: 'Node.js', type: 'http' });

const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/echo',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  console.log('状态码:', res.statusCode);
  // 必须消费响应数据，否则会占用内存/挂起
  res.setEncoding('utf8');
  res.on('data', (chunk) => process.stdout.write(chunk));
  res.on('end', () => console.log('\n响应读取完毕'));
});

req.on('error', (e) => console.error('请求出错:', e.message));
req.write(payload);
req.end();   // 使用 http.request 必须调用 end()
```

#### 注意事项

- **超时未设置**：`http.createServer()` 的 `server.timeout` 默认 120000（2 分钟），但若在请求/响应/服务器任一对象上注册了 `'timeout'` 监听器，超时的 socket **不再被自动销毁**，必须显式 `socket.destroy()` 或 `res.end()`。客户端侧应始终调用 `request.setTimeout(ms, cb)`，因为 `'timeout'` 事件只通知空闲、不会自动中止请求。
- **请求体未消费导致挂起**：客户端收到 `'response'` 后必须通过 `res.read()`、监听 `'data'` 或调用 `res.resume()` 消耗完数据，否则数据会一直堆积在内存中，可能造成 `process out of memory`；同时连接无法复用。服务端同理：不读取 `req` 的数据也不调用 `req.resume()`，会导致该连接上的后续请求无法正常处理。
- **`writeHead` 与 `setHeader` 顺序**：`response.writeHead()` 在一个响应中只能调用一次，且必须在 `response.end()` 之前；先调用 `write()`/`end()` 则会走隐式响应头模式。`setHeader()` 设置的头会与 `writeHead()` 的头合并，且 **`writeHead()` 的优先级更高**（同名时覆盖 `setHeader()` 的值）。
- **`Content-Length` 以字节计**：应使用 `Buffer.byteLength(body)` 计算，而不是字符串长度；Node.js **不会校验** `Content-Length` 与实际发送的响应体/请求体长度是否一致。
- **keep-alive**：客户端默认 `http.globalAgent` 的 `keepAlive` 为 false，每次请求都会新建连接；需要复用时应自定义 `new http.Agent({ keepAlive: true, keepAliveMsecs: 1000 })` 并在 `options.agent` 中指定，用完调用 `agent.destroy()`。服务端 `server.keepAliveTimeout` 默认 5000ms，`server.timeout` 默认 120000ms；修改 `timeout`/`keepAliveTimeout` 只影响**新建**的连接，不影响已存在的连接。
- **HEAD 请求与 204/304 响应**不得携带响应体。
- **重复请求头**：`message.headers` 中 `set-cookie` 始终为数组，`age`、`authorization`、`content-length`、`content-type`、`etag`、`expires`、`host`、`referer`、`user-agent` 等重复项会被丢弃，其余用 `,` 拼接；需要原始头请用 `message.rawHeaders`。
- **客户端必须调用 `req.end()`**，否则请求永远不会被发送。
- **`'clientError'` 事件**触发时不存在 request/response 对象，任何响应必须直接写入 socket，并且要保证是格式正确的 HTTP 响应报文；从 v6.0.0 起，只要注册了该事件的监听器，socket 就不会再被默认 `destroy()`。
- **URL 解析**：`request.url` 只包含实际请求中的 URL 部分，需要拆分请用 `require('url').parse(request.url)` 或 `new URL(req.url, base)`。
- **Node.js 不会检查 `Content-Length` 与已传输请求体长度是否相等**，代理/网关场景要自行校验。

### https

HTTPS 是 HTTP 基于 TLS/SSL 的版本，在 Node.js 中作为独立模块实现，接口形态与 `http` 高度相似但默认端口为 443。

#### 核心 API

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `https.createServer([options][, requestListener])` | `options` <Object>，接受 `tls.createServer()` / `tls.createSecureContext()` 的选项（`key`、`cert`、`pfx`、`passphrase` 等）；`requestListener` <Function> | 返回 `https.Server`（`tls.Server` 的子类，触发与 `http.Server` 相同的事件） |
| `https.request(options[, callback])` | 接受 `http.request()` 的全部选项，默认值不同：`protocol` 默认 `https:`、`port` 默认 `443`、`agent` 默认 `https.globalAgent`；使用自定义 Agent 时还可接受 `tls.connect()` 的 `pfx, key, passphrase, cert, ca, ciphers, rejectUnauthorized, secureProtocol, servername` | 返回 `http.ClientRequest`（可写流），必须调用 `req.end()` |
| `https.get(options[, callback])` | 同上，`method` 固定为 GET | 返回 `http.ClientRequest`，自动 `req.end()` |
| `https.globalAgent` | — | `https.Agent` 的全局实例，用于所有 HTTPS 客户端请求 |
| `new https.Agent([options])` | 同 `http.Agent` 的选项 | 类似 `http.Agent` 的代理对象 |
| `server.listen()` | — | 开启监听加密连接的 HTTPS 服务器，方法与 `net.Server` 相同 |
| `server.close([callback])` | `callback` <Function> | 详见 HTTP 模块的 `server.close()` |
| `server.setTimeout([msecs][, callback])` | `msecs` 默认 120000（2 分钟） | 查看 `http.Server#setTimeout()` |
| `server.timeout` | — | <number>，默认 120000 |
| `server.keepAliveTimeout` | — | <number>，默认 5000（5 秒），查看 `http.Server#keepAliveTimeout` |

#### 精确签名

```js
https.createServer([options][, requestListener])
https.request(options[, callback])
https.get(options[, callback])
https.globalAgent

server.listen()
server.close([callback])
server.setTimeout([msecs][, callback])
```

#### Demo：自签证书的最小 HTTPS 示例

生成自签证书（只需一条命令）：

```bash
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' \
  -keyout localhost-privkey.pem -out localhost-cert.pem
```

服务端：

```js
// https-server.js —— 自签证书的最小 HTTPS 服务
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('./localhost-privkey.pem'),   // 私钥
  cert: fs.readFileSync('./localhost-cert.pem')       // 证书
};

const server = https.createServer(options, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('hello world\n');
});

server.listen(8000, () => {
  console.log('HTTPS 服务已启动: https://127.0.0.1:8000');
});
```

客户端（访问自签证书需显式指定 `ca` 或关闭校验）：

```js
// https-client.js
const https = require('https');
const fs = require('fs');

const req = https.request({
  hostname: '127.0.0.1',
  port: 8000,
  path: '/',
  method: 'GET',
  ca: fs.readFileSync('./localhost-cert.pem')   // 信任自签证书；或用 rejectUnauthorized: false
}, (res) => {
  console.log('状态码：', res.statusCode);
  console.log('请求头：', res.headers);
  res.on('data', (d) => process.stdout.write(d));
});

req.on('error', (e) => console.error(e));
req.end();
```

用 `curl -k https://localhost:8000/` 也能访问（`-k` 表示跳过证书校验）。

#### 注意事项

- **必须提供证书**：`https.createServer()` 的 `options` 中 `key`/`cert`（或 `pfx` + `passphrase`）是必需的，否则握手无法完成。
- **客户端默认会校验证书**：自签证书需要通过 `ca` 指定信任的根证书，或设置 `rejectUnauthorized: false`（仅限开发调试）。
- **不要对 `https.request()` 的 options 直接加 `key`/`cert`**：这些选项在使用自定义 Agent 时才生效，正确做法是 `options.agent = new https.Agent(options)`；若不想使用连接池，则传 `agent: false`。
- **默认端口是 443**（`http` 是 80），`protocol` 默认 `https:`。
- **`https.request()` 同样必须调用 `req.end()`**，且必须消费响应数据。
- **超时与 keep-alive** 与 `http` 一致：`server.timeout` 默认 120000，`server.keepAliveTimeout` 默认 5000，且修改只对新连接生效。
- **`https.Server` 是 `tls.Server` 的子类**，但触发的事件与 `http.Server` 一致，`req`/`res` 仍是 `http.IncomingMessage`/`http.ServerResponse`。

### http2

HTTP/2 协议实现模块（稳定性：1 - 实验性），提供低层的 Core API 与模拟 HTTP/1 使用体验的 Compatibility API 两套接口。

#### 核心 API

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `http2.createServer(options[, onRequestHandler])` | `options`：<code>maxDeflateDynamicTableSize</code>、<code>maxHeaderListPairs</code>（默认 128）、<code>maxOutstandingPings</code>（默认 10）、<code>maxSendHeaderBlockLength</code>、<code>paddingStrategy</code>、<code>peerMaxConcurrentStreams</code>（默认 100）、<code>selectPadding</code>、<code>settings</code>；<code>onRequestHandler</code> <Function> 见 Compatibility API | 返回 `net.Server` 实例，负责创建与管理 `Http2Session` |
| `http2.createSecureServer(options[, onRequestHandler])` | 同上，另可传入任意 <code>tls.createServer()</code> 选项（服务端通常需要 <code>pfx</code> 或 <code>key</code>/<code>cert</code>）；<code>allowHTTP1</code> 为 true 时不支持 HTTP/2 的连接会降级为 HTTP/1.x | 返回 `tls.Server` 实例 |
| `http2.connect(authority[, options][, listener])` | `authority` <string\|URL>；`options` 含 <code>settings</code>、<code>createConnection</code>、<code>maxSessionMemory</code>、<code>maxHeaderListPairs</code> 等 | 返回 `Http2Session` |
| `http2.constants` | — | 常量集合，如 `http2.constants.NGHTTP2_SESSION_CLIENT`、`PADDING_STRATEGY_NONE` |
| `http2.getDefaultSettings()` | — | 返回默认 `Settings Object` |
| `http2.getPackedSettings(settings)` / `http2.getUnpackedSettings(buf)` | — | 设置对象的打包/解包 |
| `http2session.request(headers[, options])` | `headers` <Headers Object>；`options`：`endStream`、`exclusive`、`parent`、`weight`(1~256)、`getTrailers` | 仅客户端 Session 可用，返回 `ClientHttp2Stream` |
| `http2session.settings(settings)` | — | 提交新的 SETTINGS 帧 |
| `http2session.ping([payload, ]callback)` | — | 发送 PING 帧 |
| `http2session.shutdown(options[, callback])` | — | 优雅关闭会话（不销毁 session） |
| `http2session.destroy()` | — | 立即销毁会话 |
| `http2stream.respond([headers[, options]])` | `headers` <Headers Object>；`options`：`endStream`、`getTrailers` | 返回 undefined；服务端用，返回响应头 |
| `http2stream.respondWithFile(path[, headers[, options]])` | 文件路径 | 以文件内容作为响应体 |
| `http2stream.respondWithFD(fd[, headers[, options]])` | 文件描述符 | 以 fd 内容作为响应体 |
| `http2stream.rstCode` / `http2stream.rstStream(code)` | — | 流的 RST 码 / 发送 RST |
| `http2.Http2ServerRequest` | — | 兼容 API 的请求对象，实现 Readable 流接口 |
| `http2.Http2ServerResponse` | — | 兼容 API 的响应对象，实现 Writable 流接口 |

`Headers Object` 用普通对象表示，键会被序列化为小写，值应为字符串或字符串数组；伪首部以 `:` 开头（如 `':status'`、`':path'`）。传给回调的 headers 对象**原型为 null**，因此 `Object.prototype.toString()`、`hasOwnProperty()` 等方法不可用。

Session 事件：`'close'`、`'connect'`、`'error'`、`'frameError'`、`'goaway'`、`'localSettings'`、`'remoteSettings'`、`'stream'`、`'socketError'`、`'timeout'`。
Stream 事件：`'aborted'`、`'close'`、`'error'`、`'frameError'`、`'timeout'`、`'trailers'`。

#### 精确签名

```js
http2.createServer(options[, onRequestHandler])
http2.createSecureServer(options[, onRequestHandler])
http2.connect(authority[, options][, listener])
http2.getDefaultSettings()
http2.getPackedSettings(settings)
http2.getUnpackedSettings(buf)

session.request(headers[, options])
session.settings(settings)
session.ping([payload, ]callback)
session.shutdown(options[, callback])
session.destroy()

stream.respond([headers[, options]])
stream.respondWithFile(path[, headers[, options]])
stream.respondWithFD(fd[, headers[, options]])
```

#### Demo：HTTP/2 服务端与客户端

```js
// http2-server.js —— Core API 的纯文本 HTTP/2 服务端
const http2 = require('http2');

const server = http2.createServer();

server.on('error', (err) => console.error('server error:', err));
server.on('socketError', (err) => console.error('socket error:', err));

server.on('stream', (stream, headers) => {
  // stream 是 Duplex
  console.log('收到请求:', headers[':path'], headers[':method']);
  stream.respond({
    'content-type': 'text/html',
    ':status': 200
  });
  stream.end('<h1>Hello World</h1>');
});

server.listen(8080, () => console.log('HTTP/2 服务已启动: http://127.0.0.1:8080'));
```

```js
// http2-client.js —— Core API 的 HTTP/2 客户端
const http2 = require('http2');

const client = http2.connect('http://127.0.0.1:8080');
client.on('socketError', (err) => console.error('socket error:', err));
client.on('error', (err) => console.error('client error:', err));

const req = client.request({ ':path': '/' });
req.on('response', (headers, flags) => {
  console.log('响应头:', headers);
});
req.setEncoding('utf8');
let data = '';
req.on('data', (chunk) => { data += chunk; });
req.on('end', () => {
  console.log('\n响应体:', data);
  client.destroy();     // 用完记得销毁会话，否则进程不会退出
});
req.end();
```

#### 注意事项

- **稳定性为「实验性」**：v8.x 中 `http2` 标记为 Stability: 1 - Experimental，生产使用需谨慎。
- **Core API 与 Compatibility API 是两套东西**：Core API 面向协议特性、客户端/服务端高度对称；Compatibility API 提供接近 HTTP/1 的 `req`/`res` 体验，便于同时支持 HTTP/1 与 HTTP/2。
- **ALPN 协商**：要在同一端口同时支持 HTTPS 与 HTTP/2，用 `http2.createSecureServer({ cert, key, allowHTTP1: true }, onRequest)`；**不支持从非 TLS 的 HTTP/1 服务器升级**。
- **必须显式销毁会话**：`client.destroy()` 或 `session.destroy()`，否则会话会保持进程不退出。
- **伪首部写法不同**：HTTP/2 用 `':status'`、`':path'`、`:method` 等代替 HTTP/1 的 `statusCode`、`url`、`method`。
- **兼容 API 会忽略状态描述**：HTTP/2 没有 reason phrase，`res.statusMessage` 无意义。
- **headers 对象无原型**：`Object.prototype` 上的方法在回调收到的 headers 上不可用。
- **流错误会关闭 stream**：发送超出 `maxSendHeaderBlockLength` 的头部会触发 `'frameError'` 并销毁该流。

### net

提供创建基于流的 TCP 或 IPC 服务器与客户端的异步网络 API，是 `http`/`https` 之下的底层传输模块。

#### 核心 API

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `net.createServer([options][, connectionListener])` | `options`：`allowHalfOpen`（默认 false）、`pauseOnConnect`（默认 false）；`connectionListener` <Function> 自动挂到 `'connection'` 事件 | 返回 `net.Server`，可为 TCP 或 IPC 服务 |
| `net.createConnection(options[, connectListener])` | `options`：`port`/`host`(默认 `'localhost'`)/`path`/`localAddress`/`localPort`/`family`/`hints`/`lookup`，以及附加的 `timeout`；`connectListener` 挂到 `'connect'` 事件 | 返回 `net.Socket`（已初始化连接） |
| `net.connect(options[, connectListener])` | 同上 | `net.createConnection()` 的别名 |
| `net.createConnection(port[, host][, connectListener])` | `port` <number>，`host` 默认 `'localhost'` | 返回 `net.Socket`，初始化 TCP 连接 |
| `net.createConnection(path[, connectListener])` | `path` <string>，IPC 路径 | 返回 `net.Socket`，初始化 IPC 连接 |
| `new net.Socket([options])` | `options`：`fd`、<code>allowHalfOpen</code>(默认 false)、`readable`、`writable` | 返回新的 `net.Socket` |
| `socket.connect(options[, connectListener])` | 同 `createConnection` 的 options | 异步连接；触发 `'connect'` 或 `'error'`；返回 socket 自身 |
| `socket.connect(port[, host][, connectListener])` / `socket.connect(path[, connectListener])` | 同上 | 同上 |
| `socket.write(data[, encoding][, callback])` | `data` <string\|Buffer>，`encoding` 默认 UTF8 | 全部刷新到内核缓冲返回 true，仍排队返回 false（此时触发 `'drain'`） |
| `socket.end([data][, encoding])` | — | 半关闭 socket（发送 FIN），返回 socket 自身 |
| `socket.destroy([exception])` | `exception` <Error> | 确保不再有 I/O；传 exception 会触发 `'error'` 事件 |
| `socket.setEncoding([encoding])` | — | 设置可读流编码，返回 socket 自身 |
| `socket.setTimeout(timeout[, callback])` | `timeout` <number> 毫秒 | 空闲超时；**只通知，不断开**，需自行 `end()`/`destroy()`；`0` 禁用 |
| `socket.setKeepAlive([enable][, initialDelay])` | `enable` 默认 false，`initialDelay` 默认 0 | 启用/禁用长连接探测，返回 socket 自身 |
| `socket.setNoDelay([noDelay])` | `noDelay` 默认 true | 禁用 Nagle 算法 |
| `socket.pause()` / `socket.resume()` | — | 暂停/恢复读取数据 |
| `socket.ref()` / `socket.unref()` | — | 将 socket 加入/移出维持进程存活的引用列表 |
| `socket.address()` | — | 返回 `{ port, family, address }` |
| `socket.localAddress` / `socket.localPort` | — | 本地 IP / 本地端口 |
| `socket.remoteAddress` / `socket.remotePort` / `socket.remoteFamily` | — | 远程 IP / 远程端口 / 协议族（`'IPv4'`/`'IPv6'`） |
| `socket.bytesRead` / `socket.bytesWritten` / `socket.bufferSize` | — | 已收字节 / 已发字节 / 待写缓冲字符数 |
| `socket.connecting` / `socket.destroyed` | — | <boolean>，是否正在连接 / 是否已销毁 |
| `server.listen([port][, host][, backlog][, callback])` | `port` 省略或为 0 时由系统随机分配；`host` 省略时监听 `::`（可用时）或 `0.0.0.0`；`backlog` 默认 511 | 返回 `net.Server`，异步监听，`'listening'` 事件触发时 callback 被调用 |
| `server.listen(options[, callback])` | `options`：`port`、`host`、`path`（与 port 冲突时忽略 port）、`backlog`、`exclusive`（默认 false） | 返回 `net.Server`；`port` 与 `path` 都没有则抛错 |
| `server.listen(path[, backlog][, callback])` | `path` <string> | 启动 IPC 服务器 |
| `server.listen(handle[, backlog][, callback])` | `handle` <Object>，含 `_handle` 或 `fd` | 在已有句柄上监听（Windows 上不支持 fd） |
| `server.address()` | — | `{ port, family, address }`；IPC 时为字符串。**只能在 `'listening'` 事件后调用** |
| `server.close([callback])` | `callback` <Function> | 停止接受新连接，保留已有连接；全部连接关闭后触发 `'close'` 并调用 callback；返回 server |
| `server.getConnections(callback)` | `callback(err, count)` | 异步获取当前并发连接数，返回 server |
| `server.maxConnections` | — | 连接数上限，超出则拒绝连接 |
| `server.listening` | — | <boolean>，是否正在监听 |
| `server.ref()` / `server.unref()` | — | 允许/禁止进程因该 server 而退出 |
| `net.isIP(input)` / `net.isIPv4(input)` / `net.isIPv6(input)` | `input` <string> | 返回 0/4/6 或 true/false |

`net.Socket` 事件：`'close'`（`had_error` <boolean>）、`'connect'`、`'data'`（<Buffer>）、`'drain'`、`'end'`、`'error'`、`'lookup'`（`err, address, family, host`）、`'timeout'`。
`net.Server` 事件：`'listening'`、`'connection'`（<net.Socket>）、`'error'`、`'close'`。

IPC 路径说明：UNIX 上是文件系统路径名（长度被截断，Linux 107 字节、macOS 103 字节），在文件系统中可见并持续到 unlink；Windows 上是命名管道，必须以 `\\?\pipe\` 或 `\\.\pipe\` 开头，JS 字符串中需用双反斜杠转义。

#### 精确签名

```js
net.createServer([options][, connectionListener])
net.createConnection(options[, connectListener])
net.createConnection(path[, connectListener])
net.createConnection(port[, host][, connectListener])
net.connect(options[, connectListener])          // createConnection 的别名

new net.Socket([options])
socket.connect(options[, connectListener])
socket.connect(path[, connectListener])
socket.connect(port[, host][, connectListener])
socket.write(data[, encoding][, callback])
socket.end([data][, encoding])
socket.destroy([exception])
socket.setEncoding([encoding])
socket.setTimeout(timeout[, callback])
socket.setKeepAlive([enable][, initialDelay])
socket.setNoDelay([noDelay])

server.listen([port][, host][, backlog][, callback])
server.listen(options[, callback])
server.listen(path[, backlog][, callback])
server.listen(handle[, backlog][, callback])
server.close([callback])
server.getConnections(callback)
```

#### Demo：TCP echo 服务端与客户端

```js
// tcp-server.js —— TCP echo 服务端
const net = require('net');

const server = net.createServer((socket) => {
  console.log('客户端已连接:', socket.remoteAddress + ':' + socket.remotePort);

  socket.setEncoding('utf8');
  socket.on('data', (data) => {
    console.log('收到:', data.trim());
    socket.write('echo: ' + data);        // 原样回显
  });
  socket.on('end', () => {
    console.log('客户端已断开');
  });
  socket.on('error', (err) => {
    console.error('socket 错误:', err.message);
  });
});

// 端口被占用时的常见错误处理
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('端口被占用，1 秒后重试...');
    setTimeout(() => {
      server.close();
      server.listen(8124);
    }, 1000);
  } else {
    throw err;
  }
});

server.listen(8124, '127.0.0.1', () => {
  console.log('服务端已启动:', server.address());
});
```

```js
// tcp-client.js —— TCP echo 客户端
const net = require('net');

const client = net.createConnection({ port: 8124, host: '127.0.0.1' }, () => {
  console.log('已连接到服务端!');
  client.write('hello\r\n');
});

client.on('data', (data) => {
  console.log('服务端返回:', data.toString().trim());
  client.end();                      // 半关闭写端
});

client.on('end', () => {
  console.log('与服务端断开');
});

client.on('error', (err) => {
  console.error('连接错误:', err.message);
});

// 空闲超时保护：timeout 事件只通知，不会自动断开
client.setTimeout(5000, () => {
  console.error('连接超时，主动断开');
  client.destroy();
});
```

可用 `telnet localhost 8124` 手动测试服务端。

#### 注意事项

- **`socket.write()` 的返回值必须检查**：返回 `false` 表示数据还在用户态缓冲中排队，此时应等待 `'drain'` 事件再继续写，否则内存会持续增长。
- **`'timeout'` 事件不会自动断开连接**：文档明确说明「该事件只是用来通知 socket 已经闲置。用户必须手动关闭」，务必在回调中调用 `socket.end()` 或 `socket.destroy()`。
- **默认没有超时**：`net.Socket` 默认不设超时，需要自己调用 `socket.setTimeout()`。
- **`'data'` 事件没有监听者时数据会丢失**：一旦绑定 `net.Socket` 的 `data` 事件，就不能再在同一 socket 上混用 `read()` 读取。
- **`'end'` 与半关闭**：`allowHalfOpen` 默认为 false，对端发来 FIN 时 socket 会自动回发 FIN 并销毁 fd；若设为 true，则必须显式调用 `socket.end()`。
- **`server.address()` 只能在 `'listening'` 事件触发后调用**。
- **`EADDRINUSE`** 是最常见的监听错误，应在 `'error'` 事件中处理（关闭后重试）。
- **`server.close()` 是异步的**：它只停止接受新连接，已有连接全部关闭后才会触发 `'close'` 事件。
- **所有 `net.Socket` 都被设置 `SO_REUSEADDR`**；`listen()` 的 `backlog` 实际长度由操作系统的 `sysctl` 决定（如 Linux 的 `tcp_max_syn_backlog`、`somaxconn`），默认值是 511。
- **`listen()` 可以被多次调用**，每次会用新选项重新打开服务器。
- **`socket.connect()` 通常不需要直接调用**，`net.createConnection()` 已经封装了「创建 socket + 立即连接」。
- **IPv6 监听注意**：多数系统上监听 `::`（unspecified IPv6 address）会同时监听 `0.0.0.0`。

### dns

域名解析模块，包含两类函数：`dns.lookup()` 使用底层操作系统工具（无需网络通信），其余 `dns.resolve*()` / `dns.reverse()` 则通过网络向真实 DNS 服务器发起查询。

#### 核心 API

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `dns.lookup(hostname[, options], callback)` | `hostname` <string>；`options` 可为 <integer>（4 或 6）或 <Object>：`family`、`hints`、`all`、`verbatim`；`callback(err, address, family)` | 使用操作系统 `getaddrinfo(3)` 解析；`all: true` 时回调变为 `(err, addresses)`，addresses 为 `{ address, family }` 数组 |
| `dns.lookupService(address, port, callback)` | `address` <string> 必须是合法 IP，否则抛 `TypeError`；`port` <number> 必须为整数，否则抛 `TypeError` | 回调 `(err, hostname, service)`，基于 `getnameinfo` |
| `dns.resolve(hostname[, rrtype], callback)` | `hostname` <string>；`rrtype` <string> 默认 `'A'` | 回调 `(err, records)`；records 类型随 rrtype 变化（见下表） |
| `dns.resolve4(hostname[, options], callback)` | `options.ttl` <boolean> 为 true 时返回 `{ address, ttl }` 对象数组而非字符串数组 | 回调 `(err, addresses)`，A 记录 |
| `dns.resolve6(hostname[, options], callback)` | 同上 | 回调 `(err, addresses)`，AAAA 记录 |
| `dns.resolveCname(hostname, callback)` | — | 回调 `(err, addresses)`，CNAME 记录 |
| `dns.resolveMx(hostname, callback)` | — | 回调 `(err, addresses)`，每项含 `priority`、`exchange` |
| `dns.resolveNaptr(hostname, callback)` | — | 回调 `(err, addresses)`，每项含 `flags`、`service`、`regexp`、`replacement`、`order`、`preference` |
| `dns.resolveNs(hostname, callback)` | — | 回调 `(err, addresses)`，NS 记录 |
| `dns.resolvePtr(hostname, callback)` | — | 回调 `(err, addresses)`，PTR 记录 |
| `dns.resolveSoa(hostname, callback)` | — | 回调 `(err, address)`，含 `nsname`、`hostmaster`、`serial`、`refresh`、`retry`、`expire`、`minttl` |
| `dns.resolveSrv(hostname, callback)` | — | 回调 `(err, addresses)`，每项含 `priority`、`weight`、`port`、`name` |
| `dns.resolveTxt(hostname, callback)` | — | 回调 `(err, records)`，二维数组 `string[][]` |
| `dns.resolveAny(hostname, callback)` | — | 回调 `(err, ret)`，每项含 `type` 字段及对应属性 |
| `dns.reverse(ip, callback)` | `ip` <string> | 回调 `(err, hostnames)`，反向解析出主机名数组 |
| `dns.getServers()` | — | 返回当前用于 DNS 解析的服务器 IP 字符串数组 |
| `dns.setServers(servers)` | `servers` <string[]>，rfc5952 格式；默认端口 53 可省略，如 `'4.4.4.4:1053'`、`'[2001:4860:4860::8888]:1053'` | 设置 DNS 服务器；IP 无效会报错 |
| `new dns.Resolver()` | 新增于 v8.3.0 | 独立解析程序，其 `setServers()` 不影响其他解析程序与全局设置 |
| `resolver.cancel()` | 新增于 v8.3.0 | 取消该解析程序未解决的查询，回调收到 `ECANCELLED` 错误码 |

`dns.resolve()` 的 `rrtype` 与返回结构：

| rrtype | records 内容 | 结果类型 | 简写方法 |
| --- | --- | --- | --- |
| `'A'` | IPv4 地址（默认） | <string> | `dns.resolve4()` |
| `'AAAA'` | IPv6 地址 | <string> | `dns.resolve6()` |
| `'CNAME'` | 规范名称记录 | <string> | `dns.resolveCname()` |
| `'MX'` | 邮件交换记录 | <Object> | `dns.resolveMx()` |
| `'NAPTR'` | 名称授权指针记录 | <Object> | `dns.resolveNaptr()` |
| `'NS'` | 名称服务器记录 | <string> | `dns.resolveNs()` |
| `'PTR'` | 指针记录 | <string> | `dns.resolvePtr()` |
| `'SOA'` | 权威起始记录 | <Object> | `dns.resolveSoa()` |
| `'SRV'` | 服务记录 | <Object> | `dns.resolveSrv()` |
| `'TXT'` | 文本记录 | <string[]> | `dns.resolveTxt()` |
| `'ANY'` | 任意记录 | <Object> | `dns.resolveAny()` |

`dns.lookup()` 支持的 getaddrinfo 标志：`dns.ADDRCONFIG`（只返回当前系统配置的地址类型，不考虑回环地址）、`dns.V4MAPPED`（指定 IPv6 族但未找到 IPv6 地址时返回 IPv4 映射地址，部分系统如 FreeBSD 10.1 不支持）。

错误码（`err.code`）：`NODATA`、`FORMERR`、`SERVFAIL`、`NOTFOUND`、`NOIMP`、`REFUSED`、`BADQUERY`、`BADNAME`、`BADFAMILY`、`BADRESP`、`CONNREFUSED`、`TIMEOUT`、`EOF`、`FILE`、`NOMEM`、`DESTRUCTION`、`BADSTR`、`BADFLAGS`、`NONAME`、`BADHINTS`、`NOTINITIALIZED`、`LOADIPHLPAPI`、`ADDRGETNETWORKPARAMS`、`CANCELLED`。

#### 精确签名

```js
dns.lookup(hostname[, options], callback)
dns.lookupService(address, port, callback)
dns.resolve(hostname[, rrtype], callback)
dns.resolve4(hostname[, options], callback)
dns.resolve6(hostname[, options], callback)
dns.resolveCname(hostname, callback)
dns.resolveMx(hostname, callback)
dns.resolveNaptr(hostname, callback)
dns.resolveNs(hostname, callback)
dns.resolvePtr(hostname, callback)
dns.resolveSoa(hostname, callback)
dns.resolveSrv(hostname, callback)
dns.resolveTxt(hostname, callback)
dns.resolveAny(hostname, callback)
dns.reverse(ip, callback)
dns.getServers()
dns.setServers(servers)
```

#### Demo：域名解析示例

```js
// dns-demo.js —— dns.lookup 与 dns.resolve* 的用法对比
const dns = require('dns');

// 1) lookup：使用操作系统解析（走 /etc/hosts、nsswitch.conf），不进行网络通信
dns.lookup('iana.org', (err, address, family) => {
  if (err) throw err;
  console.log('lookup 结果 IP 地址: %j 地址族: IPv%s', address, family);
});

// 2) lookup 带 options：限定 IPv6 + 标志位
const options = {
  family: 6,
  hints: dns.ADDRCONFIG | dns.V4MAPPED
};
dns.lookup('example.com', options, (err, address, family) => {
  if (err) throw err;
  console.log('address: %j family: IPv%s', address, family);
});

// 3) lookup 带 all: true，返回全部地址
options.all = true;
dns.lookup('example.com', options, (err, addresses) => {
  if (err) throw err;
  console.log('addresses: %j', addresses);
});

// 4) resolve4：通过 DNS 协议查询 A 记录（走网络）
dns.resolve4('archive.org', { ttl: true }, (err, addresses) => {
  if (err) throw err;
  console.log('resolve4 IP 地址: %j', addresses);

  // 5) reverse：反向解析
  addresses.forEach((a) => {
    const ip = a.address || a;
    dns.reverse(ip, (err, hostnames) => {
      if (err) throw err;
      console.log(`IP 地址 ${ip} 逆向解析到域名: ${JSON.stringify(hostnames)}`);
    });
  });
});

// 6) resolve：指定资源记录类型
dns.resolve('example.com', 'MX', (err, records) => {
  if (err) throw err;
  console.log('MX 记录:', records);
});

// 7) lookupService：IP + 端口 -> 主机名与服务名
dns.lookupService('127.0.0.1', 22, (err, hostname, service) => {
  if (err) throw err;
  console.log(hostname, service);   // Prints: localhost ssh
});

// 8) 独立解析程序：只影响自己，不污染全局设置
const { Resolver } = require('dns');
const resolver = new Resolver();
resolver.setServers(['4.4.4.4']);
resolver.resolve4('example.org', (err, addresses) => {
  if (err) throw err;
  console.log('通过 4.4.4.4 解析:', addresses);
});
```

#### 注意事项

- **`dns.lookup()` 与 `dns.resolve*()` 行为完全不同**：`lookup()` 在底层调用操作系统的 `getaddrinfo(3)`，会读取 `/etc/hosts`、`nsswitch.conf`；`resolve*()` / `reverse()` 则通过网络执行 DNS 查询，**不会**使用 `/etc/hosts`。
- **`lookup()` 占用 libuv 线程池**：虽然对 JS 表现为异步，内部是同步的 `getaddrinfo(3)`，大量并发调用会拖慢整个进程，可通过 `UV_THREADPOOL_SIZE` 调整线程池大小；`resolve*()` 使用异步网络通信，不占用线程池。
- **`err.code` 可能是 `'ENOENT'`**：不只是域名不存在时（如无可用文件描述符）查找失败也会设置该码。
- **`dns.lookup()` 的 `family` 回调值不一定是传入的值**：回调中的 `family` 表示实际结果的地址族。
- **`verbatim` 选项**：默认为 false，会把 IPv4 地址排到 IPv6 之前；新代码建议使用 `{ verbatim: true }` 保持 DNS 返回的原始顺序。
- **不要在 DNS 查询过程中调用 `dns.setServers()`**。
- **自定义 DNS 服务器需注意格式**：IPv6 必须带方括号，非默认端口要显式写出，如 `'[2001:4860:4860::8888]:1053'`。
- **`dns.lookupService()` 会抛 `TypeError`**：`address` 不是合法 IP 或 `port` 不是整数时。
- **Net 模块会内部调用 `dns.lookup()`**：`socket.connect()` 和 `dgram.createSocket()` 允许通过 `lookup` 选项替换默认解析器。

### dgram

UDP 数据报 socket 的实现模块，提供无连接、尽力而为的报文收发能力（支持单播、广播与多播）。

#### 核心 API

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `dgram.createSocket(options[, callback])` | `options`：`type`（**必填**，`'udp4'` 或 `'udp6'`）、`reuseAddr`（默认 false）、`recvBufferSize`、`sendBufferSize`、`lookup`；`callback` <Function> 为 `'message'` 事件监听器 | 返回 `dgram.Socket` |
| `dgram.createSocket(type[, callback])` | `type` <string> `'udp4'` 或 `'udp6'` | 返回 `dgram.Socket` |
| `socket.bind([port][, address][, callback])` | `port` <number>，省略或 0 时由系统分配随机端口；`address` 省略时监听所有地址；`callback` 无参数 | 绑定端口并开始监听，触发 `'listening'` 事件 |
| `socket.bind(options[, callback])` | `options`：`port`、<code>address</code>、`exclusive`（默认 false，配合 cluster 共享端口） | 同上 |
| `socket.send(msg, [offset, length,] port [, address] [, callback])` | `msg` <Buffer\|Uint8Array\|string\|Array>；`offset`/`length` 仅在 Buffer/Uint8Array 时可用且需同时给出；`port` <number>；`address` <string> 省略时用 `'127.0.0.1'`（udp4）或 `'::1'`（udp6）；`callback` 汇报 DNS 错误与 buffer 复用时机 | 发送数据报；错误在有 callback 时通过 callback 抛出，否则以 `'error'` 事件形式投射到 socket |
| `socket.address()` | — | 返回含 `address`、`family`、`port` 的对象 |
| `socket.close([callback])` | `callback` 等价于给 `'close'` 事件加监听器 | 关闭 socket 并停止监听 |
| `socket.setBroadcast(flag)` | `flag` <boolean> | 设置/清除 `SO_BROADCAST` |
| `socket.setMulticastInterface(multicastInterface)` | <string>，IPv4 填目标网卡的 IP，IPv6 需带 scope（如 `'::%eth1'`、Windows 用 `'::%2'`） | 设置默认的多播出口接口 |
| `socket.addMembership(multicastAddress[, multicastInterface])` | — | 通过 `IP_ADD_MEMBERSHIP` 加入多播组 |
| `socket.dropMembership(multicastAddress[, multicastInterface])` | — | 通过 `IP_DROP_MEMBERSHIP` 退出多播组；socket 关闭时内核自动调用 |
| `socket.setMulticastLoopback(flag)` | `flag` <boolean> | 设置/清除 `IP_MULTICAST_LOOP` |
| `socket.setMulticastTTL(ttl)` | `ttl` <number>，范围 0-255 | 设置 `IP_MULTICAST_TTL` |
| `socket.setTTL(ttl)` | `ttl` <number>，范围 0-255 | 设置 `IP_TTL` |
| `socket.setRecvBufferSize(size)` / `socket.getRecvBufferSize()` | `size` <number> | 设置/获取 `SO_RCVBUF` |
| `socket.setSendBufferSize(size)` / `socket.getSendBufferSize()` | `size` <number> | 设置/获取 `SO_SNDBUF` |
| `socket.ref()` / `socket.unref()` | — | 将 socket 加入/移出维持进程存活的引用列表，可链式调用 |

`dgram.Socket` 事件：`'message'`（`msg` <Buffer>，`rinfo` 含 `address`、`family`、`port`、`size`）、`'listening'`、`'error'`（<Error>）、`'close'`。

#### 精确签名

```js
dgram.createSocket(options[, callback])
dgram.createSocket(type[, callback])

socket.bind([port][, address][, callback])
socket.bind(options[, callback])
socket.send(msg, [offset, length,] port [, address] [, callback])
socket.address()
socket.close([callback])
socket.setBroadcast(flag)
socket.setMulticastInterface(multicastInterface)
socket.addMembership(multicastAddress[, multicastInterface])
socket.dropMembership(multicastAddress[, multicastInterface])
socket.setMulticastLoopback(flag)
socket.setMulticastTTL(ttl)
socket.setTTL(ttl)
socket.setRecvBufferSize(size)
socket.setSendBufferSize(size)
```

#### Demo：UDP 收发

```js
// udp-server.js —— UDP 服务端
const dgram = require('dgram');

const server = dgram.createSocket('udp4');

server.on('error', (err) => {
  console.error(`服务器异常：\n${err.stack}`);
  server.close();
});

server.on('message', (msg, rinfo) => {
  console.log(`服务器收到：${msg} 来自 ${rinfo.address}:${rinfo.port}`);
  // 原样回发
  server.send(msg, rinfo.port, rinfo.address);
});

server.on('listening', () => {
  const address = server.address();
  console.log(`服务器监听 ${address.address}:${address.port}`);
});

server.bind(41234);   // 服务器监听 0.0.0.0:41234
```

```js
// udp-client.js —— UDP 客户端
const dgram = require('dgram');

const client = dgram.createSocket('udp4');
const message = Buffer.from('Some bytes');

// 发送 UDP 包到 localhost 的指定端口
client.send(message, 41234, 'localhost', (err) => {
  if (err) {
    console.error('发送出错:', err);
  } else {
    console.log('发送成功');
  }
  client.close();
});

client.on('message', (msg) => {
  console.log('收到回包:', msg.toString());
});
```

发送多个 buffer 组成一个数据报（`offset`/`length` 此时不能指定）：

```js
const dgram = require('dgram');
const buf1 = Buffer.from('Some ');
const buf2 = Buffer.from('bytes');
const client = dgram.createSocket('udp4');
client.send([buf1, buf2], 41234, (err) => {
  client.close();
});
```

#### 注意事项

- **必须 `bind()` 才能收包**：只有绑定端口后 socket 才开始监听数据报；绑定失败会触发 `'error'` 事件（极少数情况如对已关闭的 socket 绑定会直接抛 `Error`）。**绑定后的 socket 会让 Node.js 进程保持运行**，若希望进程能退出需调用 `socket.unref()`。
- **`send()` 之前未 `bind()` 也会自动绑定**：socket 会被分配一个随机端口并绑定到「所有接口」地址（udp4 为 `'0.0.0.0'`，udp6 为 `'::0'`），所以只发不收的客户端不需要显式 `bind()`。
- **`send()` 的 `offset`/`length` 只对 Buffer/Uint8Array 有效**，且两者必须同时指定；`msg` 为数组时两者都不能指定。
- **错误处理方式取决于有没有传 `callback`**：传了 callback，错误通过 callback 的第一个参数返回；没传，错误以 `'error'` 事件的形式投射到 socket 上（无监听者会抛出）。**确定数据包是否发送成功的唯一方式就是指定 callback**。
- **DNS 查询会带来至少 1 个 tick 的延迟**：当 `address` 是主机名时，DNS 解析会让发送推迟。
- **`bind()` 是异步的**（自 Node.js v0.10 起）：需要在绑定完成后再做后续操作（如 `addMembership`）时，必须把后续逻辑放进 `bind()` 的回调里。
- **同时监听 `'listening'` 事件又传 `bind()` 的 callback 并不冲突**，但也没有实际用处。
- **UDP 包大小有限制**：IPv4 的载荷长度字段为 16 位，含 IP 头最多 65507 字节；IPv4 最小 MTU 为 68 字节（推荐 576），IPv6 最小 MTU 为 1280 字节。**发送大于接收方 MTU 的包会被静默丢弃，不会通知发送者**，因此大包必须自行分片。
- **多播出口接口设置有约束**：`setMulticastInterface()` 传入无法解析为 IP 会抛 `EINVAL`；IPv4 地址与族不匹配或找不到对应接口会抛 `EADDRNOTAVAIL` / `EPROTONOSUP`；传 `'0.0.0.0'` 或 `'::'` 可交回系统默认选择。
- **`socket.unref()` / `ref()` 多次调用无额外效果**，且返回 socket 引用可链式调用。

---

---

**进阶模块：crypto / child_process / cluster / readline / tty / vm / async_hooks**

### crypto (加密)

crypto 模块对 OpenSSL 的哈希、HMAC、加密、解密、签名与验证功能做了一整套封装，可通过 `require('crypto')` 引入。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `crypto.createHash(algorithm[, options])` | `algorithm` `<string>` 如 `'sha256'`；`options` `<Object>` stream.transform 选项 | 返回 `Hash` 对象；`hash.update(data[, inputEncoding])` 追加数据，`hash.digest([encoding])` 输出摘要（`hex`/`latin1`/`base64`），不传 encoding 返回 `Buffer` |
| `crypto.createHmac(algorithm, key[, options])` | `algorithm` `<string>`；`key` `<string>`/`<Buffer>`/`<TypedArray>`/`<DataView>`；`options` `<Object>` | 返回 `Hmac` 对象；`hmac.update()` + `hmac.digest([encoding])` |
| `crypto.createCipheriv(algorithm, key, iv[, options])` | `algorithm` `<string>`（依赖 OpenSSL，如 `'aes-256-gcm'`）；`key`、`iv` 为 `<string>`/`<Buffer>`/`<TypedArray>`/`<DataView>`；`options` `<Object>` | 返回 `Cipher` 对象（不可 `new`），可作流使用，也可 `cipher.update()` + `cipher.final([outputEncoding])` |
| `crypto.createDecipheriv(algorithm, key, iv[, options])` | 同上 | 返回 `Decipher` 对象；`decipher.update()` + `decipher.final([outputEncoding])`；GCM 需先 `setAuthTag(buffer)` |
| `crypto.randomBytes(size[, callback])` | `size` `<number>` 字节数 | 传 `callback` 时异步回调 `(err, buf)`；不传则同步返回 `Buffer`，出错抛异常 |
| `crypto.pbkdf2(password, salt, iterations, keylen, digest, callback)` | `password`/`<salt>` `<string>`；`iterations` `<number>`；`keylen` `<number>`；`digest` `<string>`（v8.0.0 起必填） | 回调 `(err, derivedKey)`，`derivedKey` 为 `Buffer` |
| `crypto.pbkdf2Sync(password, salt, iterations, keylen, digest)` | 同上 | 成功返回 `Buffer`，失败抛 `Error` |
| `crypto.createSign(algorithm[, options])` | `algorithm` `<string>`；`options` `<Object>` stream.Writable 选项 | 返回 `Sign` 对象；`sign.update(data[, inputEncoding])` 后 `sign.sign(privateKey[, outputFormat])` |
| `crypto.createVerify(algorithm[, options])` | 同上 | 返回 `Verify` 对象；`verify.update()` 后 `verify.verify(object, signature[, signatureFormat])` 返回布尔值 |
| `crypto.timingSafeEqual(a, b)` | `a`、`b` 均为 `<Buffer>`/`<TypedArray>`/`<DataView>` 且长度相同 | 返回 `boolean`，基于常量时间算法比较，不泄露时序信息 |
| `crypto.getHashes()` / `crypto.getCiphers()` / `crypto.getCurves()` | 无 | 返回受支持的哈希算法名 / 加密算法名 / 椭圆曲线名的数组 |

#### 精确签名

```js
crypto.createHash(algorithm[, options])                      // -> Hash
crypto.createHmac(algorithm, key[, options])                  // -> Hmac
crypto.createCipheriv(algorithm, key, iv[, options])          // -> Cipher
crypto.createDecipheriv(algorithm, key, iv[, options])        // -> Decipher
crypto.randomBytes(size[, callback])                         // -> Buffer
crypto.pbkdf2(password, salt, iterations, keylen, digest, callback)
crypto.pbkdf2Sync(password, salt, iterations, keylen, digest) // -> Buffer
crypto.createSign(algorithm[, options])                       // -> Sign
crypto.createVerify(algorithm[, options])                     // -> Verify
crypto.timingSafeEqual(a, b)                                  // -> boolean

hash.update(data[, inputEncoding])
hash.digest([encoding])
hmac.update(data[, inputEncoding])
hmac.digest([encoding])
cipher.update(data[, inputEncoding][, outputEncoding])
cipher.final([outputEncoding])
cipher.setAAD(buffer)
cipher.getAuthTag()
decipher.setAAD(buffer)
decipher.setAuthTag(buffer)
sign.sign(privateKey[, outputFormat])
verify.verify(object, signature[, signatureFormat])
```

#### Demo：哈希 + HMAC + 对称加解密 + AES-GCM

```js
const crypto = require('crypto');

// ---------- 1. 哈希 ----------
const hash = crypto.createHash('sha256');
hash.update('Node.js 学习笔记');
console.log('sha256:', hash.digest('hex'));

// ---------- 2. HMAC ----------
const hmac = crypto.createHmac('sha256', 'a secret');
hmac.update('Node.js 学习笔记');
console.log('hmac  :', hmac.digest('hex'));

// ---------- 3. 密钥派生（PBKDF2）----------
const salt = crypto.randomBytes(16);
const key = crypto.pbkdf2Sync('password', salt, 100000, 32, 'sha512');
console.log('派生密钥长度:', key.length); // 32 字节

// ---------- 4. 对称加密解密（AES-256-CBC）----------
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
let encrypted = cipher.update('机密内容', 'utf8', 'hex');
encrypted += cipher.final('hex');

const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
let decrypted = decipher.update(encrypted, 'hex', 'utf8');
decrypted += decipher.final('utf8');
console.log('解密结果:', decrypted); // 机密内容

// ---------- 5. AES-256-GCM（带认证标签）----------
const gcmKey = crypto.randomBytes(32);
const gcmIv = crypto.randomBytes(12);       // GCM 推荐 12 字节
const aad = Buffer.from('附加的认证数据');

const gcmCipher = crypto.createCipheriv('aes-256-gcm', gcmKey, gcmIv);
gcmCipher.setAAD(aad);                       // 必须在 update() 之前调用
let gcmData = gcmCipher.update('GCM 加密内容', 'utf8', 'hex');
gcmData += gcmCipher.final('hex');
const authTag = gcmCipher.getAuthTag();      // 必须在 final() 之后调用

const gcmDecipher = crypto.createDecipheriv('aes-256-gcm', gcmKey, gcmIv);
gcmDecipher.setAAD(aad);
gcmDecipher.setAuthTag(authTag);            // 必须在 final() 之前调用
let gcmPlain = gcmDecipher.update(gcmData, 'hex', 'utf8');
gcmPlain += gcmDecipher.final('utf8');
console.log('GCM 解密结果:', gcmPlain); // GCM 加密内容

// ---------- 6. 常量时间比较 ----------
const a = crypto.createHmac('sha256', 'k').update('token').digest();
const b = crypto.createHmac('sha256', 'k').update('token').digest();
console.log('timingSafeEqual:', crypto.timingSafeEqual(a, b));
```

#### 注意事项

- `crypto.createCipher()` / `crypto.createDecipher()` 已被弃用：它们用 `EVP_BytesToKey` + MD5 + 单次迭代 + 无盐派生密钥，可被字典攻击；应改用 `crypto.pbkdf2()` 派生 key/iv 后配合 `createCipheriv()` / `createDecipheriv()`。
- 不要在 `createCipher()` 中使用计数模式（CTR、GCM、CCM），文档明确会发出警告，因为 IV 复用会导致 GCM 被攻破；使用这些模式时务必每次生成新的随机 IV。
- `cipher.setAAD()` 必须在 `cipher.update()` 之前调用；`cipher.getAuthTag()` 必须在 `cipher.final()` 之后调用；`decipher.setAuthTag()` 必须在 `decipher.final()` 之前调用，否则抛错。
- `hash.digest()`、`hmac.digest()`、`sign.sign()`、`verify.verify()` 调用后对象不可复用，重复调用会抛错。
- `createCipheriv`/`createDecipheriv` 的 `key`、`iv` 长度必须与算法匹配（iv 长度由算法决定，如 AES-256-CBC 为 16 字节，GCM 通常 12 字节）。
- `crypto.pbkdf2()` 与 `crypto.randomBytes()` 的异步版本使用 libuv 线程池，大批量请求时可能造成性能抖动，注意 `UV_THREADPOOL_SIZE`；`randomBytes` 的异步版本是一次线程池请求，大请求建议拆分。
- `crypto.timingSafeEqual()` 要求两个参数长度相同且都是 Buffer/TypedArray/DataView；它本身并不保证周围代码时序安全。
- v6.0.0 起 `update()` 等方法的默认 `inputEncoding` 由 `binary` 改为 `utf8`；`crypto.DEFAULT_ENCODING` 默认为 `'buffer'`。
- 依据 NIST SP 800-131A：MD5 与 SHA-1 在需要抗碰撞的场景（如数字签名）已不可用；RSA/DSA/DH 密钥建议至少 2048 位，ECDSA/ECDH 曲线至少 224 位；`modp1`/`modp2`/`modp5` 分组密钥过短，不推荐使用。
- 有些 Node.js 构建可能不包含 crypto 支持，此时 `require('crypto')` 会抛异常，可用 `try/catch` 包裹。

### child_process (子进程)

child_process 模块提供了衍生子进程的功能，与 `popen(3)` 类似但不完全相同，核心是异步的 `spawn()` 与同步的 `spawnSync()`。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `child_process.exec(command[, options][, callback])` | `command` `<string>`，参数用空格分隔；`options` 含 `cwd`/`env`/`encoding`(默认 `'utf8'`)/`shell`(UNIX 默认 `/bin/sh`，Windows 默认 `process.env.ComSpec`)/`timeout`(默认 0)/`maxBuffer`(默认 200*1024)/`killSignal`(默认 `'SIGTERM'`)/`uid`/`gid`/`windowsHide` | 返回 `<ChildProcess>`；回调签名 `(error, stdout, stderr)`，成功时 `error` 为 `null`，失败时 `error.code` 为退出码、`error.signal` 为终止信号；非 0 退出码即视为错误 |
| `child_process.execFile(file[, args][, options][, callback])` | `file` `<string>` 可执行文件名或路径；`args` `<string[]>`；`options` 与 `exec` 基本相同（另含 `windowsVerbatimArguments`） | 返回 `<ChildProcess>`；不衍生 shell，直接执行可执行文件，比 `exec` 更高效；回调 `(error, stdout, stderr)` |
| `child_process.spawn(command[, args][, options])` | `command` `<string>`；`args` `<Array>`（省略即空数组）；`options` 含 `cwd`/`env`/`argv0`/`stdio`/`detached`/`uid`/`gid`/`shell`(默认 false)/`windowsVerbatimArguments`/`windowsHide` | 返回 `<ChildProcess>`；通过 `subprocess.stdout`/`stderr`/`stdin` 流式交互，不阻塞事件循环 |
| `child_process.fork(modulePath[, args][, options])` | `modulePath` `<string>` 要在子进程中运行的模块；`args` `<Array>`；`options` 含 `cwd`/`env`/`execPath`/`execArgv`/`silent`(默认 false)/`stdio`（数组中必须含 `'ipc'`）/`windowsVerbatimArguments`/`uid`/`gid` | 返回 `<ChildProcess>`，额外带有内置 IPC 通信通道；`subprocess.send()` 与子进程 `process.send()` 互相发消息 |
| `child_process.execSync(command[, options])` | `command` `<string>`；`options` 含 `cwd`/`input`/`stdio`/`env`/`shell`/`uid`/`gid`/`timeout`/`killSignal`/`maxBuffer`/`encoding`(默认 `'buffer'`)/`windowsHide` | 返回 `<Buffer>` 或 `<string>`（stdout）；进程超时或退出码非 0 时抛出 `Error`，错误对象包含 `spawnSync()` 的完整结果 |

#### 精确签名

```js
child_process.exec(command[, options][, callback]) // -> ChildProcess
child_process.execFile(file[, args][, options][, callback])  // -> ChildProcess
child_process.spawn(command[, args][, options])              // -> ChildProcess
child_process.fork(modulePath[, args][, options])            // -> ChildProcess
child_process.execSync(command[, options])                   // -> Buffer | string
child_process.execFileSync(file[, args][, options])          // -> Buffer | string
child_process.spawnSync(command[, args][, options])          // -> { pid, output, stdout, stderr, status, signal, error }

subprocess.send(message[, sendHandle[, options]][, callback]) // -> boolean
subprocess.disconnect()
subprocess.kill([signal])
```

#### Demo：spawn 传参 + fork IPC 通信

`parent.js`：

```js
const { spawn, fork } = require('child_process');

// ---------- 1. spawn：把参数放进 args 数组，而不是拼进命令字符串 ----------
// 用 process.execPath 启动当前 Node，可跨平台运行
const child = spawn(process.execPath, ['-e', 'console.log("子进程收到:", process.argv.slice(1))', 'hello', 'world'], {
  cwd: process.cwd(),
  env: { ...process.env, MY_FLAG: '1' }
});

child.stdout.on('data', (data) => {
  console.log('stdout:', data.toString().trim());
});
child.stderr.on('data', (data) => {
  console.log('stderr:', data.toString().trim());
});
child.on('error', (err) => {
  console.error('启动子进程失败:', err.message);
});
child.on('close', (code) => {
  console.log('子进程退出码:', code);
});

// ---------- 2. spawn：向子进程 stdin 写入数据 ----------
const writer = spawn(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)']);
writer.stdin.write('通过管道发送的数据\n');
writer.stdin.end();

// ---------- 3. fork：父进程与子进程通过 IPC 通道通信 ----------
const forked = fork(`${__dirname}/child.js`, ['来自父进程的参数'], {
  silent: true // 让子进程的 stdout/stderr 通过管道回到父进程
});

forked.on('message', (msg) => {
  console.log('父进程收到消息:', msg);
  if (msg && msg.type === 'ready') {
    forked.send({ type: 'task', payload: '请计算一下' });
  }
  if (msg && msg.type === 'done') {
    forked.disconnect(); // 关闭 IPC 通道
  }
});

forked.send({ type: 'hello', payload: '你好' });

forked.on('exit', (code) => {
  console.log('fork 出的子进程已退出, code =', code);
});
```

`child.js`：

```js
// 子进程通过 process.on('message') 接收父进程的消息
process.on('message', (msg) => {
  console.log('子进程收到消息:', msg);
  console.log('子进程启动参数:', process.argv.slice(2));

  if (msg && msg.type === 'hello') {
    // 回应父进程
    process.send({ type: 'ready', payload: '子进程已就绪' });
  }

  if (msg && msg.type === 'task') {
    process.send({ type: 'done', payload: `任务「${msg.payload}」完成` });
  }
});

// 主动断开 IPC 通道
process.on('disconnect', () => {
  console.log('IPC 通道已关闭');
});
```

#### 注意事项

- `exec()`、`execSync()` 会衍生 shell 执行命令字符串，**存在 shell 注入风险**：文档明确警告不要把未经检查的用户输入传入，任何包含 shell 元字符的输入都可触发任意命令执行。需要执行外部命令时优先用 `execFile()` 或 `spawn()` + `args` 数组。
- `exec()` 与 `execSync()` 的 `maxBuffer` 默认 200*1024 字节，超出则子进程被终止；输出量大时需调大。
- `exec()` 不像 POSIX 的 `exec(3)` 那样替换当前进程，而是**另起一个 shell 子进程**。
- `exec()` 与 `execFile()` 的回调不是 Node惯用的 `(err, data)` 形式，而是 `(error, stdout, stderr)`；且 `error` 非0 退出码即会触发。
- `fork()` 不像 POSIX 的 `fork(2)` 那样克隆当前进程：它使用父进程的 `process.execPath` 启动一个全新的 Node.js 实例，各进程有各自独立的内存和 V8 实例，**不能共享内存**；因此不推荐派生大量 Node.js 进程（额外资源开销大）。
- `fork()` 的 `stdio` 若使用数组，必须包含一个值为 `'ipc'` 的子项，否则抛错；`stdio` 一旦提供会覆盖 `silent`。
- `subprocess.send()` 的消息经过序列化与反序列化，**接收到的对象可能与发送时不完全一致**（例如 `NaN` 会变成 `null`）。
- 不要发送以 `NODE_` 为前缀的 `cmd` 消息（如 `{cmd: 'NODE_foo'}`），它们是 Node核心内部保留的，不会触发子进程的 `process.on('message')`。
- `subprocess.send()` 在通道已关闭或积压超过阈值时返回 `false`，否则返回 `true`；可用回调实现流控。
- 在 `fork()` 出来的子进程内使用 `spawn()` 时，其 shell 配置选项会被自动忽略、不生效。
- `execSync()` 等同步 API 会阻塞事件循环直到子进程退出，性能影响明显；且若子进程捕获了 `SIGTERM` 却不退出，父进程会一直等待。
- Windows 上 `.bat`/`.cmd` 无法用 `execFile()` 直接启动（没有终端不可执行），需使用 `exec()`、或 `spawn('cmd.exe', ['/c', 'my.bat'])`、或 `spawn(..., { shell: true })`。

### cluster (集群)

cluster 模块允许简单方便地创建共享同一服务器端口的子进程，把多核负载分摊到多个工作进程上。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `cluster.fork([env])` | `env` `<Object>` 要增加到工作进程的环境变量（键值对） | 返回 `<cluster.Worker>`；**只能由主进程调用** |
| `cluster.isMaster` | 无 | `<boolean>`；当 `process.env.NODE_UNIQUE_ID` 未定义时为 `true`（即当前进程是主进程） |
| `cluster.isWorker` | 无 | `<boolean>`；当进程不是主进程时为 `true`，与 `cluster.isMaster` 恰好相反 |
| `worker.process` | 无 | `<ChildProcess>`；所有工作进程都由 `child_process.fork()` 创建，其返回对象保存在 `.process` 上 |
| `cluster.workers` | 无 | `<Object>`，以 `id` 为键存放活跃工作进程对象的哈希表，只能在主进程中调用 |
| `cluster.worker` | 无 | `<Object>`，当前工作进程对象的引用，对主进程无效 |
| `cluster.setupMaster([settings])` | `settings` 见 `cluster.settings` | 修改默认 `fork` 行为，只能由主进程调用 |
| `worker.send(message[, sendHandle][, callback])` | `message` `<Object>`；`sendHandle` `<Handle>`；`callback` `<Function>` | 返回 `<boolean>`；主进程发给指定工作进程，工作进程发给主进程 |
| `worker.disconnect()` / `worker.kill([signal = 'SIGTERM'])` | `signal` `<string>` | 断开/杀死工作进程；会设置 `worker.exitedAfterDisconnect` |
| `worker.id` / `worker.isConnected()` / `worker.isDead()` / `worker.exitedAfterDisconnect` | 无 | `id` `<number>` 唯一编号；`isConnected()` 判断 IPC 是否连着主进程；`isDead()` 判断是否已终止；`exitedAfterDisconnect` `<boolean>` 区分主动/被动退出 |
| `cluster.schedulingPolicy` | 无 | `cluster.SCHED_RR`（循环计数，除 Windows 外默认）或 `cluster.SCHED_NONE`（由操作系统决定）；也可通过环境变量 `NODE_CLUSTER_SCHED_POLICY` 设置为 `"rr"` 或 `"none"` |

> 说明：Node.js v8.x 文档中主进程判定属性为 `cluster.isMaster`（`isPrimary` 是后续版本才引入的名称，v8.x 中并不存在）。

#### 精确签名

```js
cluster.fork([env])                                  // -> cluster.Worker
cluster.setupMaster([settings])
cluster.disconnect([callback])
cluster.isMaster                                      // -> boolean
cluster.isWorker                                      // -> boolean
cluster.schedulingPolicy
cluster.settings // -> Object
cluster.worker                                        // -> Object
cluster.workers                                       // -> Object

worker.id                                             // -> number
worker.process // -> ChildProcess
worker.send(message[, sendHandle][, callback])        // -> boolean
worker.disconnect()                                   // -> Worker
worker.kill([signal = 'SIGTERM'])
worker.isConnected()                                  // -> boolean
worker.isDead()                                       // -> boolean
worker.exitedAfterDisconnect                          // -> boolean | undefined
```

#### Demo：主从多进程

```js
const cluster = require('cluster');
const http = require('http');
const os = require('os');

const numCPUs = os.cpus().length;

// ---------- 主进程 ----------
if (cluster.isMaster) {
  console.log(`主进程 ${process.pid} 正在运行，共 ${numCPUs} 个 CPU`);

  // fork 出与 CPU 数量相同的工作进程
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // 统计所有工作进程收到的请求总数
  let numReqs = 0;
  setInterval(() => {
    console.log(`numReqs = ${numReqs}`);
  }, 1000);

  cluster.on('message', (worker, message) => {
    if (message && message.cmd === 'notifyRequest') {
      numReqs += 1;
    }
  });

  // 工作进程退出时自动补充一个新的
  cluster.on('exit', (worker, code, signal) => {
    console.log(`工作进程 ${worker.process.pid} 已退出 (code=${code}, signal=${signal})`);
    if (!worker.exitedAfterDisconnect) {
      console.log('不是主动退出，补充一个新的工作进程');
      cluster.fork();
    }
  });

  cluster.on('listening', (worker, address) => {
    console.log(`工作进程 ${worker.process.pid} 已监听 ${address.address}:${address.port}`);
  });
} else {
  // ---------- 工作进程 ----------
  const port = 8000 + cluster.worker.id; // 注意：cluster 中 listen(0) 的端口是可预料的

  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`来自工作进程 ${process.pid} 的响应\n`);

    // 通过 IPC 通道通知主进程，累加请求计数
    process.send({ cmd: 'notifyRequest' });
  }).listen(port, () => {
    console.log(`工作进程 ${process.pid} 已启动，监听 ${port}`);
  });

  // 接收主进程的消息
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      process.disconnect(); // 关闭 IPC 通道，让工作进程优雅退出
    }
  });
}
```

#### 注意事项

- **各工作进程是相互独立的进程**，拥有各自的内存与 V8 实例，**不能共享内存**；Node.js 不支持路由逻辑，因此不应依赖内存数据对象（如 session、登录态）做跨进程共享，需通过 IPC 消息或外部存储（数据库、Redis）传递。
- Node.js 不会自动管理工作进程数量，进程池需由应用自己管理（示例中的 `cluster.on('exit')` 里补 fork 即是常见做法）。
- 没有任何存活的工作进程时，服务器会丢失现有连接并拒绝新连接。
- 在 cluster 模式下 `server.listen(0)` 并不会得到真正的随机端口：端口只在第一次分配时随机，之后每个工作进程都会得到相同的"随机"端口。需要独立端口时应根据工作进程 ID 生成（如 `8000 + cluster.worker.id`）。
- `server.listen({ fd: 7 })` 会把句柄（handle）传给工作进程，而不是文件描述符 7 本身；`server.listen(handle)` 会让工作进程直接使用该句柄而不与父进程通信。
- cluster 支持两种连接分发模式：循环法（默认，主进程监听端口后分发）与主进程把监听 socket 交给工作进程直接接收（理论效率高，但实际受操作系统调度影响不稳定）。
- 在 Windows 上还不能在工作进程中设置管道（Pipe）服务器。
- `worker.suicide` 已废弃（v6.0.0 起访问会发出废弃警告），请改用 `worker.exitedAfterDisconnect`。
- `worker.disconnect()` 与 `process.disconnect()` 是两个不同的方法，不要混淆：`worker.disconnect()` 在主进程中会发送内部消息让工作进程自己断开；长时间运行的服务端连接可能导致其阻塞，可配合 `worker.send('shutdown')` 与 `setTimeout` 兜底调用 `worker.kill()`。
- `cluster.on('message')` 在 v6.0.0 之前只接受 `(message, handle)` 两个参数；为兼容旧版本可判断 `arguments.length === 2`。
- `cluster.settings` 不应被手动修改；`setupMaster()` 的设置只对之后的 `fork()` 生效，且无法设置传给 `fork()` 的 `env`。
- 工作进程上 `process` 发生 `'disconnect'` 事件且 `exitedAfterDisconnect` 不为 `true` 时，工作进程会调用 `process.exit(0)`，以防连接意外断开。

### readline (逐行读取)

readline 模块提供了一个接口，用于从可读流（如 `process.stdin`）中每次读取一行数据。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `readline.createInterface(options)` | `input` `<Readable>`（必需）；`output` `<Writable>`；`completer` `<Function>`；`terminal` `<boolean>`（默认检查 `output.isTTY`）；`historySize` `<number>`（默认 30，0 表示禁用）；`prompt`（默认 `'> '`）；`crlfDelay` `<number>`（默认 100 毫秒）；`removeHistoryDuplicates` `<boolean>` | 返回 `readline.Interface` 实例 |
| `rl.question(query, callback)` | `query` `<string>` 提示语；`callback` `<Function>` | 把 `query` 写入 `output` 并等待输入，回调**只带答案一个参数**（不遵循 `(err, data)` 惯例） |
| `rl.setPrompt(prompt)` / `rl.prompt([preserveCursor])` | `prompt` `<string>`；`preserveCursor` `<boolean>` | 设置/输出提示符；`prompt()` 会在必要时恢复 input 流 |
| `rl.write(data[, key])` | `data` `<string>`；`key` `<Object>`（`ctrl`/`meta`/`shift`/`name`） | 把数据或按键序列写入 output；`key` 仅在 output 是 TTY 时支持，指定 `key` 时忽略 `data` |
| `rl.close()` | 无 | 关闭接口并撤回对 input/output 流的控制，触发 `'close'` 事件 |
| `rl.pause()` / `rl.resume()` | 无 | 暂停/恢复 input 流 |
| `readline.clearLine(stream, dir)` | `stream` `<Writable>`；`dir` `-1`/`1`/`0`（左/右/整行） | 清除 TTY 流当前行 |
| `readline.clearScreenDown(stream)` | `stream` `<Writable>` | 从光标当前位置向下清除 |
| `readline.cursorTo(stream, x, y)` | `stream` `<Writable>`；`x`、`y` `<number>` | 移动光标到指定位置 |
| `readline.moveCursor(stream, dx, dy)` | `stream` `<Writable>`；`dx`、`dy` `<number>` | 相对当前位置移动光标 |
| `readline.emitKeypressEvents(stream[, interface])` | `stream` `<Readable>`；`interface` `<readline.Interface>` | 让流按接收到的输入触发 `'keypress'` 事件；若流是 TTY，必须先设为原始模式 |

#### 精确签名

```js
readline.createInterface(options)                  // -> readline.Interface
rl.question(query, callback)
rl.setPrompt(prompt)
rl.prompt([preserveCursor])
rl.write(data[, key])
rl.close()
rl.pause()
rl.resume()
readline.clearLine(stream, dir)
readline.clearScreenDown(stream)
readline.cursorTo(stream, x, y)
readline.moveCursor(stream, dx, dy)
readline.emitKeypressEvents(stream[, interface])
```

#### Demo：简单命令行界面 + 逐行读取文件

```js
const readline = require('readline');
const fs = require('fs');

// ---------- 1. 交互式命令行界面 ----------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '请输入> '
});

rl.prompt();

rl.on('line', (line) => {
  switch (line.trim()) {
    case 'hello':
      console.log('world!');
      break;
    case 'quit':
    case 'exit':
      rl.close(); // 关闭接口，进程才能正常退出
      return;
    default:
      console.log(`你输入的是：'${line.trim()}'`);
  }
  rl.prompt();
});

rl.on('close', () => {
  console.log('再见!');
});

// ---------- 2. 逐行读取文件流 ----------
const rl2 = readline.createInterface({
  input: fs.createReadStream('sample.txt'),
  crlfDelay: Infinity // \r\n 永远当作一个换行符
});

rl2.on('line', (line) => {
  console.log('文件的单行内容：', line);
});
```

#### 注意事项

- 创建 `readline.Interface` 后，Node.js 程序不会自动终止，因为接口还在等待 input 流的数据；必须调用 `rl.close()` 或在 `'close'` 事件里 `process.exit(0)`。
- `rl.question()` 的回调**只接收答案一个参数**，不遵循 Node.js 惯用的 `(err, value)` 模式，写 `(err, answer)` 会拿到 `undefined`。
- `'SIGCONT'` 与 `'SIGTSTP'` 事件在 Windows 上不受支持。
- `'SIGINT'` 事件：若没有注册监听器，则触发 `'pause'` 事件；`'SIGTSTP'` 未注册监听器时进程会被送到后台。
- `terminal` 默认为在 `output` 流上检查 `isTTY` 的结果；`historySize` 只有在 `terminal` 为 `true` 时才有意义，否则历史缓存不会被初始化。
- `crlfDelay` 会被强制为不小于 100 的数值，可设为 `Infinity`。
- `readline.emitKeypressEvents()` 的 stream 若为 TTY，必须先 `setRawMode(true)`；关闭 readline 实例并不会停止 input 继续触发 `'keypress'` 事件。
- `rl.write()` 会把数据当作用户输入写入 readline 接口，注意不要用它引入不受信任的内容。

### tty (终端)

tty 模块提供了 `tty.ReadStream` 和 `tty.WriteStream` 两个类，用于判断进程是否运行在文本终端（TTY）以及读取终端尺寸、切换原始模式。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `tty.isatty(fd)` | `fd` `<number>` 文件描述符 | 返回 `boolean`，该 fd 是否关联 TTY |
| `tty.ReadStream` | `net.Socket` 的子类，表示 TTY 的可读部分 | 通常 `process.stdin` 就是唯一的实例，无需手工创建 |
| `readStream.isTTY` | 无 | `<boolean>`，对 `tty.ReadStream` 实例恒为 `true` |
| `readStream.isRaw` | 无 | `<boolean>`，是否处于原始模式，默认 `false` |
| `readStream.setRawMode(mode)` | `mode` `<boolean>`，`true` 进入原始模式，`false` 恢复默认模式 | 设置原始模式，同时更新 `isRaw` 属性 |
| `tty.WriteStream` | `net.Socket` 的子类，表示 TTY 的可写部分 | 通常 `process.stdout` / `process.stderr` 就是实例 |
| `writeStream.isTTY` | 无 | `<boolean>`，恒为 `true` |
| `writeStream.columns` / `writeStream.rows` | 无 | `<number>`，当前终端的列数/行数，每次触发 `'resize'` 事件时更新 |
| `'resize'` 事件 | 无 | 当 `columns` 或 `rows` 变化时在 write stream 上触发，回调无参数 |

#### 精确签名

```js
tty.isatty(fd)                  // -> boolean
readStream.setRawMode(mode)
readStream.isTTY                // -> boolean
readStream.isRaw                // -> boolean
writeStream.isTTY               // -> boolean
writeStream.columns             // -> number
writeStream.rows                // -> number
```

#### Demo：终端检测、尺寸监听与原始模式

```js
const tty = require('tty');
const fs = require('fs');

// ---------- 1. 判断当前是否运行在 TTY 中 ----------
console.log('stdout 是 TTY 吗:', Boolean(process.stdout.isTTY));
console.log('fd 1 是 TTY 吗:', tty.isatty(1));

// ---------- 2. 监听终端窗口大小变化 ----------
if (process.stdout.isTTY) {
  process.stdout.on('resize', () => {
    console.log('窗口大小发生变化！');
    console.log(`${process.stdout.columns}x${process.stdout.rows}`);
  });
}

// ---------- 3. 原始模式：按键逐个生效，Ctrl+C 不再产生 SIGINT ----------
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdout.write('请按任意键（Ctrl+C 退出）：');

  process.stdin.on('data', (key) => {
    // Ctrl+C 的字节是 \x03
    if (key === '\u0003') {
      process.stdout.write('\n退出。\n');
      // 恢复默认模式再退出，否则终端会处于异常状态
      process.stdin.setRawMode(false);
      process.exit(0);
    }
    process.stdout.write(`你按下了: ${key}\n`);
  });
}
```

#### 注意事项

- 判断是否在 TTY 上下文中的首选方法是检查 `process.stdout.isTTY`，输出被管道重定向时它会变为 `false`（如 `node -p ... | cat`）。
- 原始模式（`setRawMode(true)`）下，终端对字符的特殊处理全部被禁用，包括 CTRL+C 不再产生 SIGINT，必须自行处理退出。
- 退出前务必调用 `setRawMode(false)` 恢复终端默认模式，否则终端会残留异常状态（无法回显、无法换行）。
- `tty.ReadStream`/`tty.WriteStream` 是 `net.Socket` 的子类，通常不需要手工创建实例。
- `columns`/`rows` 只在 `'resize'` 事件触发时更新，读取时要以事件为准。
- `'SIGCONT'`/`'SIGTSTP'` 等终端信号相关能力属于 `readline` 模块，Windows 上不受支持。

### vm (虚拟机)

vm 模块提供了一系列 API，用于在 V8 虚拟机环境（独立 Context）中编译和运行代码，常见用途是运行沙箱化代码。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `new vm.Script(code, options)` | `code` `<string>` 要解析的 JavaScript 代码；`options` 含 `filename`/`lineOffset`/`columnOffset`/`displayErrors`/`timeout`/`cachedData`/`produceCachedData` | 返回 `vm.Script` 对象，**只编译不执行**；编译后的脚本可多次执行，代码不绑定任何全局对象 |
| `vm.createContext([sandbox])` | `sandbox` `<Object>` | 把 sandbox 上下文隔离化，使其可用于 `runInContext()`；不传则返回全新的空 sandbox 对象 |
| `vm.isContext(sandbox)` | `sandbox` `<Object>` | 返回 `boolean`，该对象是否已被 `createContext()` 上下文隔离化 |
| `vm.runInContext(code, contextifiedSandbox[, options])` | `code` `<string>`；`contextifiedSandbox` 必须是经 `createContext()` 隔离化的对象；`options` 同上 | 返回代码执行结果；执行代码无法获取本地作用域 |
| `vm.runInNewContext(code[, sandbox][, options])` | `code` `<string>`；`sandbox` `<Object>`（`undefined` 则新建） | 先为 sandbox 提供隔离上下文再执行代码，返回结果 |
| `vm.runInThisContext(code[, options])` | `code` `<string>`；`options` 同上 | 在当前 `global` 对象的上下文中执行代码并返回结果 |
| `vm.runInDebugContext(code)` | `code` `<string>` | 在 V8 的调试上下文中编译并执行，返回结果（如 `Debug` 对象）；稳定性 0 - 失效，替代方案开发中 |
| `script.runInContext(contextifiedSandbox[, options])` | 同 `vm.runInContext` 的参数 | 在指定 context 中执行已编译代码并返回结果；`options` 额外支持 `breakOnSigint` |
| `script.runInNewContext([sandbox[, options]])` | 同上 | 为 sandbox 提供隔离上下文后执行已编译代码并返回结果 |
| `script.runInThisContext([options])` | 同上 | 在 `global` 对象上下文中执行已编译代码并返回结果 |

#### 精确签名

```js
new vm.Script(code, options)
script.runInContext(contextifiedSandbox[, options])
script.runInNewContext([sandbox[, options]])
script.runInThisContext([options])
vm.createContext([sandbox])
vm.isContext(sandbox)
vm.runInContext(code, contextifiedSandbox[, options])
vm.runInDebugContext(code)
vm.runInNewContext(code[, sandbox][, options])
vm.runInThisContext(code[, options])
```

#### Demo：沙箱上下文与超时保护

```js
const vm = require('vm');
const util = require('util');

// ---------- 1. createContext：沙箱拥有独立的全局对象 ----------
const x = 1;
const sandbox = { x: 2 };
vm.createContext(sandbox); // 上下文隔离化

const code = 'x += 40; var y = 17;';
vm.runInContext(code, sandbox);

console.log('sandbox.x =', sandbox.x); // 42
console.log('sandbox.y =', sandbox.y); // 17
console.log('外部的 x =', x); // 1，外部全局变量不受影响
console.log('isContext:', vm.isContext(sandbox)); // true

// ---------- 2. 编译一次，多次执行 ----------
const script = new vm.Script('count += 1; name = "kitty";');
const ctx = vm.createContext({ animal: 'cat', count: 2 });
for (let i = 0; i < 10; ++i) {
  script.runInContext(ctx);
}
console.log(util.inspect(ctx)); // { animal: 'cat', count: 12, name: 'kitty' }

// ---------- 3. runInNewContext：每个沙箱互相隔离 ----------
const script2 = new vm.Script('globalVar = "set"');
const sandboxes = [{}, {}, {}];
sandboxes.forEach((s) => script2.runInNewContext(s));
console.log(util.inspect(sandboxes)); // [{ globalVar: 'set' }, { globalVar: 'set' }, { globalVar: 'set' }]

// ---------- 4. timeout：超时则抛出 Error ----------
try {
  vm.runInNewContext('while (true) {}', {}, { timeout: 100 });
} catch (err) {
  console.log('超时被捕获:', err.message);
}

// ---------- 5. runInThisContext：在当前 global 上执行 ----------
global.globalVar = 0;
const script3 = new vm.Script('globalVar += 1', { filename: 'myfile.vm' });
for (let i = 0; i < 1000; ++i) {
  script3.runInThisContext();
}
console.log('globalVar =', globalVar); // 1000
```

#### 注意事项

- **vm 模块不是实现代码安全性的机制**，文档明确指出：绝不要试图用其运行未经信任的代码。沙箱只隔离全局对象，不提供安全边界。
- `vm.runInContext()` 的 `contextifiedSandbox` 必须是先经过 `vm.createContext()` 上下文隔离化的对象，否则其全局对象不会按预期工作。
- 沙箱内代码无法访问本地作用域（闭包变量），但可以访问 `global` 上的属性以及 sandbox 上提供的属性。
- `vm.createContext()` 后，脚本的全局对象既拥有 sandbox 的所有属性，也拥有 global object 的属性；沙箱之外的代码的全局变量保持不变。
- 使用 `timeout` 或 `breakOnSigint` 选项会创建若干新的事件循环及对应线程，有非零的性能消耗。
- `vm.runInDebugContext()` 稳定性为 0（失效），调试上下文和 `Debug` 对象本质上从属于 V8 调试器，可能在没有事先警告的情况下被改变甚至移除；`Debug` 对象另外也可通过 `--expose_debug_as` 命令行选项获得。
- `new vm.Script()` 只编译不执行，编译结果与全局对象无关，只在每次执行时绑定到对应对象。

### async_hooks (异步钩子)

async_hooks 模块提供了注册回调的 API，用于跟踪 Node.js 应用内部创建的异步资源的生命周期（稳定性：1 - 实验性）。

#### 核心 API 表格

| API | 入参说明 | 返回值/说明 |
| --- | --- | --- |
| `async_hooks.createHook(callbacks)` | `callbacks` `<Object>`，可含 `init`/`before`/`after`/`destroy`/`promiseResolve`，全部可选 | 返回 `<AsyncHook>` 实例；所有回调均可选，例如只需跟踪清理时只传 `destroy` |
| `asyncHook.enable()` | 无 | 返回 `<AsyncHook>` 引用；启用回调。AsyncHook 实例**默认是禁用的**，必须显式调用 |
| `asyncHook.disable()` | 无 | 返回 `<AsyncHook>` 引用；从全局回调池中禁用，禁用后不会被再次调用，直到重新启用 |
| `async_hooks.executionAsyncId()` | 无 | 返回 `<number>`，当前执行上下文的 asyncId（v8.2.0 起由 `currentId` 改名） |
| `async_hooks.triggerAsyncId()` | 无 | 返回 `<number>`，导致当前回调被调用的那个资源的 ID |
| `init(asyncId, type, triggerAsyncId, resource)` | `asyncId` `<number>` 唯一 ID；`type` `<string>` 资源类型；`triggerAsyncId` `<number>` 触发者 ID；`resource` `<Object>` 资源引用 | 当一个可能发出异步事件的类被构造时调用；此时资源可能尚未完成构造，字段未必都已填充 |
| `before(asyncId)` / `after(asyncId)` | `asyncId` `<number>` | 资源回调执行前/后调用；对 handle（如 TCPWrap）可调用 0-N 次，对 request（如 FSReqWrap）恰好调用 1 次 |
| `destroy(asyncId)` | `asyncId` `<number>` | AsyncWrap 实例被销毁时调用 |
| `promiseResolve(asyncId)` | `asyncId` `<number>` | 仅对 promise 资源，当 `Promise` 构造函数的 `resolve` 被调用时触发 |
| `new AsyncResource(type[, options])` | `type` `<string>`；`options` 含 `triggerAsyncId`（默认 `executionAsyncId()`）、`requireManualDestroy`（默认 `false`） | 实例化即触发 `init` 钩子 |
| `asyncResource.emitBefore()` / `emitAfter()` / `emitDestroy()` | 无 | 返回 `<undefined>`；分别触发 before / after / destroy 回调 |
| `asyncResource.asyncId()` / `asyncResource.triggerAsyncId()` | 无 | 返回该 AsyncResource 实例的唯一 ID / 触发 ID |

#### 精确签名

```js
async_hooks.createHook(callbacks)   // -> AsyncHook
asyncHook.enable() // -> AsyncHook
asyncHook.disable()                  // -> AsyncHook
async_hooks.executionAsyncId()       // -> number
async_hooks.triggerAsyncId()         // -> number

new AsyncResource(type[, options])
asyncResource.emitBefore()           // -> undefined
asyncResource.emitAfter()            // -> undefined
asyncResource.emitDestroy()          // -> undefined
asyncResource.asyncId()              // -> number
asyncResource.triggerAsyncId()       // -> number
```

#### Demo：跟踪异步资源的生命周期

```js
const async_hooks = require('async_hooks');
const fs = require('fs');
const util = require('util');

// 在 AsyncHooks 回调里调试时必须用同步写日志，否则 console.log() 会造成无限递归
function debug(...args) {
  fs.writeSync(1, `${util.format(...args)}\n`);
}

// ---------- 1. 统计各类异步资源的创建与销毁 ----------
const counts = Object.create(null);

const hook = async_hooks.createHook({
  init(asyncId, type, triggerAsyncId, resource) {
    counts[type] = (counts[type] || 0) + 1;
  },
  destroy(asyncId) {
    // 资源销毁时清理
  },
  before(asyncId) {
    //回调执行前
  },
  after(asyncId) {
    // 回调执行后
  },
  promiseResolve(asyncId) {
    // 仅 promise 资源
  }
});

hook.enable(); // AsyncHook 实例默认禁用，必须显式启用

setTimeout(() => {
  fs.open(__filename, 'r', (err, fd) => {
    debug('fs.open 回调中的 executionAsyncId =', async_hooks.executionAsyncId());
    debug('fs.open 回调中的 triggerAsyncId =', async_hooks.triggerAsyncId());
    debug('资源统计:', util.inspect(counts));
    hook.disable();
  });
}, 10);

// ---------- 2. 演示 triggerAsyncId 与 executionAsyncId 的区别 ----------
const hook2 = async_hooks.createHook({
  init(asyncId, type, triggerAsyncId) {
    const eid = async_hooks.executionAsyncId();
    debug(`${type}(${asyncId}): trigger: ${triggerAsyncId} execution: ${eid}`);
  }
});
hook2.enable();
require('net').createServer(() => {}).listen(8080, () => {
  hook2.disable();
});

// ---------- 3. 自定义异步资源：继承 AsyncResource ----------
class DBQuery extends AsyncResource {
  constructor(db) {
    super('DBQuery');
    this.db = db;
  }

  getInfo(query, callback) {
    this.db.get(query, (err, data) => {
      this.emitBefore();
      callback(err, data);
      this.emitAfter();
    });
  }

  close() {
    this.db = null;
    this.emitDestroy();
  }
}
```

#### 注意事项

- AsyncHook 实例**默认处于禁用状态**，必须显式调用 `enable()` 才会执行回调；常用写法是 `async_hooks.createHook(callbacks).enable()`。
- **不要在 AsyncHooks 回调里使用 `console.log()`**：`console.log()` 本身是异步操作，会触发 AsyncHooks 回调，从而造成无限递归。调试时应改用同步的 `fs.writeSync(1, msg)`（1 是 stdout 的文件描述符）。
- 任何 AsyncHook 回调抛出的异常都会打印堆栈并退出进程：退出路径类似未捕获异常，但所有 `uncaughtException` 监听器会被移除以强制进程退出（除非使用 `--abort-on-uncaught-exception`，此时会打印堆栈并留下 core 文件）。原因是这些回调运行在对象生命周期中易出问题的时刻。
- `init` 在类构造期间触发，此时资源可能尚未完成构造，`resource` 的所有字段未必都已填充，不能假设它已完全可用。
- `executionAsyncId()` 反映的是**执行时序**，`triggerAsyncId()` 反映的是**因果关系**（谁触发了这个资源），两者含义不同，不可混用。
- `AsyncResource` 中 `before` 和 `after` 调用必须按调用顺序成对回退（unwind），否则会抛出不可恢复的异常并导致进程 abort。
- 资源类型 `type` 是字符串（如 `FSEVENTWRAP`、`FSREQWRAP`、`HTTPPARSER`、`TCPWRAP`、`TIMERWRAP`、`PROMISE` 等），一般对应资源构造函数的名称；使用公共嵌入 API 可以自定义类型，但可能发生名称冲突，建议使用唯一前缀（如 npm 包名）。
- `promiseResolve` 只会对 promise 资源触发，对应 `Promise` 构造函数中 `resolve` 函数的调用。
- `AsyncResource` 的 `requireManualDestroy` 默认 `false`，即对象被垃圾回收时自动触发 `emitDestroy()`；通常无需设置。

---

## 五、模块速查表

按“想干什么 → 用哪个模块”检索：

| 需求 | 模块 / API |
| --- | --- |
| 拼接文件路径 | `path.join()` / `path.resolve()` |
| 取文件名 / 扩展名 | `path.basename()` / `path.extname()` |
| 读文件 | `fs.readFile()` / `fs.promises.readFile()` |
| 写文件 | `fs.writeFile()` / `fs.writeFileSync()` |
| 监听文件变化 | `fs.watch()` / `fs.watchFile()` |
| 处理二进制 | `Buffer` / `buffer.transcode()` |
| 流式读写大文件 | `fs.createReadStream()` / `createWriteStream()` |
| 压缩 / 解压 | `zlib.gzip()` / `zlib.gunzip()` / `zlib.createGzip()` |
| 自定义事件 | `EventEmitter` + `emit` / `on` / `once` |
| 延时任务 | `setTimeout` / `setInterval` / `setImmediate` |
| 读取命令行参数 | `process.argv` |
| 读取环境变量 | `process.env` |
| 退出码 / 信号 | `process.exitCode` / `process.on('exit')` |
| 单元断言 | `assert.ok()` / `assert.strictEqual()` |
| HTTP 服务 | `http.createServer()` |
| HTTP 客户端 | `http.request()` / `https.request()` |
| TCP 服务 | `net.createServer()` |
| UDP 收发 | `dgram.createSocket()` |
| 域名解析 | `dns.lookup()` / `dns.resolve4()` |
| 哈希 / HMAC | `crypto.createHash()` / `crypto.createHmac()` |
| 随机数 / 令牌 | `crypto.randomBytes()` / `crypto.randomUUID()` |
| 对称加密 | `crypto.createCipheriv()`（AES-256-GCM） |
| 密码派生 | `crypto.pbkdf2Sync()` |
| 签名 / 验签 | `crypto.sign()` / `crypto.verify()` |
| 执行外部命令 | `child_process.exec()` / `execFile()` / `spawn()` |
| 多进程 | `cluster.fork()` / `cluster.isPrimary` |
| 命令行交互 | `readline.createInterface()` |
| 性能监控 | `perf_hooks.performance.now()` / `monitorEventLoopDelay` |

---

## 六、在本项目 koa-demo 中的落地

本仓库使用 Koa + Sequelize + MySQL，Node 内置模块的实际使用位置：

| 位置 | 用到的内置能力 |
| --- | --- |
| `server.js` | `app.listen(3000)` 走 Koa（底层 `http.createServer`）；`crypto.randomUUID()` 生成请求 id |
| `config/index.js` | `dotenv` 读 `.env`，本质是 `process.env` |
| `utils/cryptoUtils.js` | `crypto.createHash('md5')` / `crypto.randomBytes` / `jsencrypt`（RSA） |
| `database/connectMysql.js` | `mysql2` 连接池，事件驱动 |
| `logs/` | `fs.appendFile` / `fs.mkdir` 写日志 |
| `static/` | `koa-static` 基于 `fs.createReadStream` + `path.join` 映射磁盘路径 |

改造建议（把内置能力用在项目里）：

1. **日志**：用 `fs.createWriteStream` + `path.join(__dirname, '../logs')` 落盘，避免 `appendFileSync` 阻塞事件循环。
2. **请求体大小限制**：`koa-bodyparser` 的 `formLimit` / `jsonLimit` 默认 1mb，配合 `http` 层的 `requestTimeout`。
3. **优雅退出**：监听 `process.on('SIGTERM')` → `server.close()` → `sequelize.close()`，不要直接 `process.exit()`。
4. **健康检查**：新增 `/health` 路由，用 `os.loadavg()` / `process.memoryUsage()` 输出指标。
5. **多进程**：用 `cluster` 或 `pm2` 启动多实例，注意 `pm2.yaml` 配置与 `cluster.isPrimary` 判断。

```js
// 优雅退出示例（server.js 参考）
const server = app.listen(3000);

function shutdown(signal) {
  console.log(`收到 ${signal}，开始优雅关闭...`);
  server.close(async () => {
    await sequelize.close(); // 关闭数据库连接
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref(); // 兜底强制退出
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('未捕获异常:', err);
  shutdown('uncaughtException');
});
```

---

## 七、学习路线建议

1. **第 1 阶段（基础）**：`path` → `fs` → `events` → `buffer`/`stream` → `url`/`querystring`
   目标：能用 Node 写出「读配置 → 处理数据 → 写结果」的脚本。
2. **第 2 阶段（服务）**：`http` → `events` → `process`/`os` → `net`/`dns`
   目标：能用原生 `http` 写一个带路由、静态文件、JSON 解析的 API 服务（体会为什么需要 Koa/Express）。
3. **第 3 阶段（工程）**：`crypto` → `child_process` → `cluster` → `stream` → `zlib`
   目标：能做鉴权加密、子进程调用与多进程部署。
4. **第 4 阶段（深入）**：`async_hooks` → `perf_hooks` → `vm` → `v8`
   目标：能定位异步链路问题、做性能采样与内存分析。

配套练习建议：

- 用 `fs` + `stream` 实现一个日志切割工具（`createReadStream` → `createGzip` → 写入归档）。
- 用 `net` 写一个 TCP echo 服务，用 `dgram` 写一个 UDP 心跳上报。
- 用 `crypto` 实现「密码加盐哈希 + AES-GCM 加密文件」工具。
- 用 `child_process.spawn` 调用 ffmpeg 裁剪视频，处理进度输出（backpressure）。
- 用 `cluster` + `http` 做压测，观察多核下的吞吐差异。
