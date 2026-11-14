# MySQL 实战教程（含 Node.js 接入）

> 适用版本：MySQL 8.0 / 8.4 LTS（8.4 为当前主流 LTS）
> 阅读建议：第 1～4 章按顺序看，第 5～8 章按需查，第 9 章是 Node 落地代码

---

## 目录

1. [环境与连接](#1-环境与连接)
2. [建库建表与数据类型](#2-建库建表与数据类型)
3. [CRUD 与查询进阶](#3-crud-与查询进阶)
4. [索引与执行计划](#4-索引与执行计划)
5. [事务、锁与 MVCC](#5-事务锁与-mvcc)
6. [权限、备份与运维](#6-权限备份与运维)
7. [性能优化清单](#7-性能优化清单)
8. [常见错误码对照](#8-常见错误码对照)
9. [Node.js + mysql2 实战](#9-nodejs--mysql2-实战)
10. [学习路径与练习](#10-学习路径与练习)

---

## 1. 环境与连接

### 1.1 三种本地起服务的方式

**方式 A：Docker（最省事，不污染系统）**

```bash
docker run -d --name mysql8 \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=123456 \
  -e MYSQL_DATABASE=app \
  -e TZ=Asia/Shanghai \
  -v mysql_data:/var/lib/mysql \
  mysql:8.4
```

**方式 B：包管理器安装**

```bash
# macOS
brew install mysql
brew services start mysql

# Ubuntu / Debian
sudo apt install mysql-server
sudo systemctl start mysql

# Windows：官方 MySQL Installer，安装时勾选 Server + Workbench
```

**方式 C：集成环境**：XAMPP / phpStudy / Laragon，自带 MySQL，端口偶有冲突（改 3307 常见）。

### 1.2 第一次登录

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p
```

登录后先确认版本与字符集：

```sql
SELECT VERSION();                    -- 8.4.x
SHOW VARIABLES LIKE 'character_set_%';
SHOW VARIABLES LIKE 'collation_%';
```

期望 `character_set_server = utf8mb4`，collation 为 `utf8mb4_0900_ai_ci`（8.0 默认）。

### 1.3 四个必须知道的连接参数

| 参数 | 说明 | 常见坑 |
|---|---|---|
| `host` | 主机地址 | **写 `127.0.0.1` 而不是 `localhost`**。Node 17+ 会优先解析到 IPv6 `::1`，而 MySQL 默认只监听 127.0.0.1，表现为 `ECONNREFUSED ::1:3306` |
| `port` | 默认 3306 | 集成环境常改成 3307/3308 |
| `user` / `password` | 账号 | MySQL 8 默认认证插件 `caching_sha2_password`，老驱动不支持会报 1251 |
| `database` | 库名 | 不指定就只能执行 `SHOW DATABASES` 这类实例级命令 |

### 1.4 socket 连接（Linux/macOS 本地专用）

TCP 之外还有 Unix socket，本地连本机时可以绕过网络栈：

```bash
mysql -u root -p --socket=/tmp/mysql.sock
# Ubuntu/Debian 常见：/var/run/mysqld/mysqld.sock
# XAMPP（macOS）：/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock
```

编程连接时对应 `socketPath` 参数。

---

## 2. 建库建表与数据类型

### 2.1 建库

```sql
CREATE DATABASE app
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE app;
```

**为什么必须 utf8mb4**：`utf8`（实为 utf8mb3）最多 3 字节，存不下 emoji、部分生僻字，插入会报 `1366 Incorrect string value`。utf8mb4 才是完整 UTF-8。

### 2.2 一张规范的表

```sql
CREATE TABLE users (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  name        VARCHAR(32)     NOT NULL                COMMENT '昵称',
  email       VARCHAR(128)    NOT NULL                COMMENT '邮箱',
  status      TINYINT         NOT NULL DEFAULT 0      COMMENT '0正常 1禁用',
  balance     DECIMAL(12,2)   NOT NULL DEFAULT 0.00   COMMENT '余额',
  profile     JSON            NULL                    COMMENT '扩展信息',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_email (email),
  KEY idx_name_status (name, status)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '用户表';
```

建表六条硬规则：

1. **主键用 `BIGINT UNSIGNED AUTO_INCREMENT`**，别用业务字段做主键；InnoDB 是聚簇索引，主键即数据组织方式，主键乱序插入会造成页分裂。
2. **金额用 `DECIMAL`**，绝不用 `FLOAT`/`DOUBLE`（二进制浮点存不准 0.1）。
3. **时间用 `DATETIME`**，除需要自动时区转换时用 `TIMESTAMP`（后者范围只到 2038 年）。
4. **状态用 `TINYINT`**，配注释写清枚举含义；`ENUM` 改动要 DDL，不如 TINYINT 灵活。
5. **每张表必备 `created_at` / `updated_at`**，排障时它们能救命。
6. **字符集显式声明**，不要依赖服务端默认值（不同环境可能不一致）。

### 2.3 数据类型速查

| 类型 | 字节 | 取值范围 / 注意 |
|---|---|---|
| `TINYINT` | 1 | -128~127；无符号 0~255 |
| `SMALLINT` / `MEDIUMINT` / `INT` / `BIGINT` | 2/3/4/8 | BIGINT 无符号上限 1.8e19 |
| `DECIMAL(M,D)` | 变长 | 精确小数，M 总位数、D 小数位 |
| `FLOAT` / `DOUBLE` | 4 / 8 | 近似值，禁止用于金额 |
| `CHAR(n)` | n | 定长，适合 MD5、国家码 |
| `VARCHAR(n)` | 变长 | n 是**字符数**不是字节数；索引长度受限 |
| `TEXT` / `LONGTEXT` | 变长 | 不能直接建索引（需前缀索引），查询不进内存临时表时会走磁盘 |
| `DATETIME` | 5~8 | 不带时区，`DATETIME(3)` 支持毫秒 |
| `TIMESTAMP` | 4 | 带时区转换，1970~2038 |
| `JSON` | 变长 | 自动校验格式，支持 `->` 取值，5.7.8+ |
| `BLOB` | 变长 | 二进制；图片别入库，存路径 |

**VARCHAR 的最大长度**：受行大小 65535 字节限制，utf8mb4 下理论 16383 字符，实际建议单列不超过 2000，超长文本用 TEXT。

### 2.4 修改表结构（8.0 的 online DDL）

```sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL AFTER email;

-- 显式指定算法，避免锁表
ALTER TABLE users ADD COLUMN age TINYINT NULL, ALGORITHM=INSTANT;   -- 仅加列到末尾
ALTER TABLE users ADD INDEX idx_phone (phone), ALGORITHM=INPLACE, LOCK=NONE;

-- 改字符集（会重建表，务必低峰执行）
ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

`ALGORITHM=INSTANT` 只改元数据，毫秒级；`INPLACE` 允许并发读写；不支持时会报错，此时再考虑 `COPY`（锁写）。

---

## 3. CRUD 与查询进阶

### 3.1 增删改查基础

```sql
-- 增
INSERT INTO users (name, email, status) VALUES ('张三', 'zs@example.com', 0);
INSERT INTO users (name, email) VALUES ('李四', 'ls@example.com'), ('王五', 'ww@example.com');

-- 查
SELECT id, name, email FROM users WHERE status = 0 ORDER BY id DESC LIMIT 10;

-- 改
UPDATE users SET status = 1 WHERE id = 3;

-- 删
DELETE FROM users WHERE id = 3;
```

**一次插入多行**优于循环单条插入：一次网络往返、一个事务、一批日志。

### 3.2 聚合与分组

```sql
SELECT status, COUNT(*) AS cnt, AVG(balance) AS avg_balance
FROM users
GROUP BY status
HAVING cnt > 5;

-- 8.0 默认开启 ONLY_FULL_GROUP_BY：SELECT 里的非聚合列必须出现在 GROUP BY 中
-- 需要"每组取一条"时，用窗口函数而不是 MySQL 方言 GROUP BY + 非聚合列
```

### 3.3 JOIN

```sql
SELECT u.id, u.name, o.order_no, o.amount
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.status = 0;
```

| 类型 | 语义 |
|---|---|
| `INNER JOIN` | 两边都匹配才保留 |
| `LEFT JOIN` | 左表全保留，右表无匹配补 NULL |
| `RIGHT JOIN` | 反之（可用 LEFT 调换表序替代） |
| `CROSS JOIN` | 笛卡尔积，慎用 |

**LEFT JOIN 的经典陷阱**：把右表条件写在 `WHERE` 里会退化成 INNER JOIN（因为 NULL 不满足条件），必须写在 `ON` 里：

```sql
-- ❌ 只返回有已完成订单的用户
LEFT JOIN orders o ON o.user_id = u.id WHERE o.status = 'done'

-- ✅ 所有用户，没完成的订单字段为 NULL
LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'done'
```

### 3.4 子查询与 CTE

```sql
-- 子查询
SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE amount > 100);

-- CTE（8.0+），可读性优于嵌套子查询
WITH big_orders AS (
  SELECT user_id, SUM(amount) AS total
  FROM orders GROUP BY user_id
)
SELECT u.name, b.total
FROM users u JOIN big_orders b ON b.user_id = u.id
ORDER BY b.total DESC;
```

**递归 CTE**（树形结构、生成序列）：

```sql
WITH RECURSIVE seq (n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 10
)
SELECT * FROM seq;

-- 递归深度上限 cte_max_recursion_depth（默认 1000）
```

### 3.5 窗口函数（8.0 核心特性）

```sql
SELECT
  id, dept, salary,
  ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rn,
  RANK()       OVER (PARTITION BY dept ORDER BY salary DESC) AS rk,
  SUM(salary)  OVER (PARTITION BY dept)                      AS dept_total,
  LAG(salary)  OVER (PARTITION BY dept ORDER BY id)          AS prev_salary
FROM emp;
```

- `ROW_NUMBER`：连续序号，无并列
- `RANK`：并列跳号（1,1,3）
- `DENSE_RANK`：并列不跳号（1,1,2）
- 与 `GROUP BY` 的区别：窗口函数**不折叠行**，每行都保留

**每组取最新一条**（业务超高频）：

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM orders
) t WHERE rn = 1;
```

### 3.6 JSON 字段

```sql
-- 插入
INSERT INTO users (name, email, profile) VALUES ('赵六', 'zl@example.com',
  '{"age": 28, "tags": ["vip", "beta"]}');

-- 取值：-> 返回 JSON，->> 返回文本
SELECT profile->'$.age'        AS age_json,
       profile->>'$.age'       AS age_text
FROM users WHERE id = 4;

-- 条件
SELECT * FROM users WHERE profile->>'$.age' > '25';
SELECT * FROM users WHERE JSON_CONTAINS(profile->'$.tags', '"vip"');

-- 修改
UPDATE users SET profile = JSON_SET(profile, '$.age', 30) WHERE id = 4;
```

**JSON 列不能直接建普通索引**，两种做法：

```sql
-- 1) 生成列 + 索引（8.0 推荐）
ALTER TABLE users
  ADD COLUMN age INT GENERATED ALWAYS AS (profile->>'$.age') STORED,
  ADD INDEX idx_age (age);

-- 2) 8.0.17+ 多值索引（针对数组）
ALTER TABLE users ADD INDEX idx_tags ((CAST(profile->'$.tags' AS CHAR(20) ARRAY)));
```

### 3.7 分页的正确做法

```sql
-- 小数据量：OFFSET 够用
SELECT * FROM orders ORDER BY id DESC LIMIT 0, 20;

-- 深分页：OFFSET 越大越慢（要扫过前 N 行）
-- 改为"游标/keyset 分页"
SELECT * FROM orders WHERE id < 100000 ORDER BY id DESC LIMIT 20;
```

深分页的本质是 `LIMIT offset, n` 必须先丢弃 offset 行，百万级时是灾难。按自增主键或时间游标翻页才是 O(1)。

---

## 4. 索引与执行计划

### 4.1 索引的物理结构

InnoDB 用 **B+ 树**：

- 非叶子节点只存 key 和子页指针，扇出大（一个 16KB 页可存上千个 key），树高通常 3 层就能覆盖千万行；
- 叶子节点存**完整行数据**（聚簇索引）或**主键值**（二级索引），并用双向链表串联，范围查询只需顺序扫叶子链。

由此得到两个直接推论：

1. **主键查询最快**：聚簇索引叶子就是行本身，一次树查找。
2. **二级索引要"回表"**：先在二级索引找到主键，再回聚簇索引取整行 —— 两次查找。

### 4.2 索引类型

```sql
-- 主键（聚簇索引，一张表只能有一个）
PRIMARY KEY (id)

-- 唯一索引
UNIQUE KEY uk_email (email)

-- 普通索引
KEY idx_status (status)

-- 联合索引（注意列顺序）
KEY idx_name_status (name, status)

-- 前缀索引（长字符串列）
KEY idx_email_prefix (email(12))

-- 全文索引（中文需 ngram 分词器）
FULLTEXT KEY ft_content (content) WITH PARSER ngram;

-- 函数索引（8.0.13+）
KEY idx_lower_name ((LOWER(name)))
```

### 4.3 联合索引与最左前缀

索引 `(a, b, c)` 相当于建了 `(a)`、`(a,b)`、`(a,b,c)` 三个索引，但**不能**用于 `(b)`、`(b,c)`、`(a,c)`（`a,c` 只能用到 `a`）。

```sql
-- 索引 (name, status)
WHERE name = 'x'                  -- ✅ 用 name
WHERE name = 'x' AND status = 0   -- ✅ 两个都用
WHERE status = 0                  -- ❌ 用不上（跳过最左列）
WHERE name LIKE 'x%'              -- ✅ 前缀匹配可用
WHERE name LIKE '%x'              -- ❌ 前导模糊失效
```

**列顺序原则**：等值条件在前、范围条件在后、选择性高的在前。`(status, created_at)` 通常比 `(created_at, status)` 更适合"按状态筛 + 按时间排"的场景。

### 4.4 覆盖索引

如果查询需要的列全在索引里，就**不需要回表**：

```sql
-- 索引 (name, status)，查询只取这两列
SELECT name, status FROM users WHERE name = '张三';
-- Extra: Using index  ← 覆盖索引
```

所以高频查询可以专门建"宽索引"，把常用返回列带上，用空间换 IO。

### 4.5 EXPLAIN 怎么读

```sql
EXPLAIN SELECT * FROM users WHERE name = '张三' AND status = 0;
EXPLAIN FORMAT=JSON SELECT ...;         -- 更详细
EXPLAIN ANALYZE SELECT ...;             -- 8.0.18+，真实执行并给出耗时
```

| 列 | 关注点 |
|---|---|
| `type` | 访问类型，性能从好到坏：`system` > `const` > `eq_ref` > `ref` > `range` > `index` > `ALL`。出现 `ALL` 即全表扫 |
| `possible_keys` / `key` | 候选索引 / 实际用的索引；`key` 为 NULL 说明没走索引 |
| `key_len` | 用了索引的前几个字节，可推断联合索引用到第几列 |
| `rows` | 预估扫描行数，越大越危险 |
| `filtered` | 扫描后剩余比例 |
| `Extra` | 关键信号，见下表 |

| Extra | 含义 | 处理 |
|---|---|---|
| `Using index` | 覆盖索引，最优 | 保持 |
| `Using where` | 服务层再过滤 | 检查条件是否能进索引 |
| `Using index condition` | 索引条件下推（ICP） | 正常，说明部分条件在存储层过滤 |
| `Using temporary` | 用了临时表 | 常见于 `GROUP BY` / `DISTINCT` / 子查询，需优化 |
| `Using filesort` | 额外排序 | 让 `ORDER BY` 列进索引，或调整索引顺序 |
| `Using join buffer` | 被驱动表没索引 | 给 JOIN 字段建索引 |

### 4.6 索引失效的七个原因

1. **列被函数包裹**：`WHERE DATE(created_at) = '2026-11-12'` → 改成范围查询 `created_at >= '2026-11-12' AND created_at < '2026-11-13'`。
2. **隐式类型转换**：`phone` 是 VARCHAR，却写 `WHERE phone = 13800138000`（数字）→ 索引失效。字符串列必须传字符串。
3. **前导模糊**：`LIKE '%abc'`。
4. **OR 两侧未都建索引**：只要有一侧没索引，整体退化为全表扫。
5. **联合索引跳过最左列**。
6. **`!=` / `NOT IN` / `IS NOT NULL`**：不一定失效，但优化器常判定回表成本高于全表扫。
7. **统计信息过期**：`ANALYZE TABLE users;` 刷新。

### 4.7 索引不是越多越好

代价：每次写入都要维护所有索引（写放大）、占用缓冲池、优化器选择成本上升。经验值：**单表索引不超过 5~6 个**，联合索引优先于多个单列索引。

---

## 5. 事务、锁与 MVCC

### 5.1 ACID 与 InnoDB 的落地方式

| 特性 | 实现机制 |
|---|---|
| 原子性 A | undo log（回滚日志） |
| 一致性 C | 由 A+I+D 共同保证，外加约束（外键、唯一索引） |
| 隔离性 I | 锁 + MVCC |
| 持久性 D | redo log（重做日志）+ 刷盘 |

**关键认知**：`redo log` 保证崩溃恢复，`binlog` 保证主从复制与备份，两者通过 **两阶段提交** 保持一致。

### 5.2 四种隔离级别

```sql
SELECT @@transaction_isolation;                                  -- 查看（8.0 变量名）
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;          -- 会话级
SET GLOBAL TRANSACTION ISOLATION LEVEL REPEATABLE READ;          -- 全局
```

| 级别 | 脏读 | 不可重复读 | 幻读 |
|---|---|---|---|
| READ UNCOMMITTED | 可能 | 可能 | 可能 |
| READ COMMITTED | 不会 | 可能 | 可能 |
| **REPEATABLE READ（默认）** | 不会 | 不会 | 快照读不会，当前读仍可能 |
| SERIALIZABLE | 不会 | 不会 | 不会 |

**互联网业务常用 RC**：减少间隙锁、降低死锁概率，靠业务层幂等兜底。金融强一致场景保留 RR。

### 5.3 MVCC 原理（面试与实战都要懂）

每行隐藏两个字段：`DB_TRX_ID`（最后修改的事务 ID）、`DB_ROLL_PTR`（指向 undo log 的指针）。

读的时候按以下规则判断版本可见性：

- 事务 ID 小于当前活跃事务最小 ID → 可见；
- 大于等于当前事务 ID → 不可见，沿 `roll_pointer` 找上一个版本；
- 在活跃列表中 → 不可见。

**Read View 生成时机决定隔离级别**：

- `READ COMMITTED`：**每条语句**生成一个 Read View → 同一事务两次查询可能看到不同结果；
- `REPEATABLE READ`：**事务第一次快照读**时生成，整个事务复用 → 可重复读。

### 5.4 快照读 vs 当前读

| 类型 | SQL | 是否加锁 |
|---|---|---|
| 快照读 | 普通 `SELECT` | 不加锁，走 MVCC |
| 当前读 | `SELECT ... FOR UPDATE` / `FOR SHARE`、`UPDATE`、`DELETE`、`INSERT` | 加锁，读最新版本 |

```sql
START TRANSACTION;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;   -- 排他锁
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;
```

8.0 用 `FOR SHARE` 取代了旧的 `LOCK IN SHARE MODE`。

**加锁必须走索引**：`WHERE` 没命中索引时，`FOR UPDATE` 会锁全表（更准确说是锁所有扫描到的记录 + 间隙），这是线上事故高发点。

### 5.5 锁的粒度与间隙锁

| 锁 | 说明 |
|---|---|
| 记录锁 Record Lock | 锁单行 |
| 间隙锁 Gap Lock | 锁索引记录之间的"空隙"，防插入 |
| 临键锁 Next-Key Lock | 记录锁 + 前面的间隙，RR 下范围查询的默认形态 |
| 插入意向锁 | 插入前的间隙锁，与 Gap Lock 冲突 |

**间隙锁只在 RR 且使用非唯一索引做范围条件时出现**。唯一索引等值查询会退化为记录锁，不锁间隙。这也是 RC 更少死锁的原因。

### 5.6 死锁

```sql
SHOW ENGINE INNODB STATUS;    -- LATEST DETECTED DEADLOCK 段落
```

成因：两个事务以相反顺序加锁，形成等待环。InnoDB 有死锁检测（`innodb_deadlock_detect`），检测到就回滚代价较小的事务，报 `1213 Deadlock found`。

**规避手段**：

1. 统一加锁顺序（比如永远按主键升序更新）；
2. 事务尽量短，不要在事务里做 RPC / 文件 IO；
3. 降隔离级别到 RC；
4. 用 `SELECT ... FOR UPDATE NOWAIT`（8.0）快速失败，或用 `SKIP LOCKED` 做任务队列；
5. 业务层对 1213 做重试（通常重试 2~3 次即可）。

```sql
-- 用 SKIP LOCKED 实现"抢任务"，避免所有 worker 抢同一行
SELECT * FROM jobs WHERE status = 0 ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED;
```

### 5.7 事务的正确写法

```sql
START TRANSACTION;
-- 只放必要的 DML，不做网络请求
UPDATE inventory SET stock = stock - 1 WHERE sku = 'A001' AND stock >= 1;
INSERT INTO orders (sku, qty) VALUES ('A001', 1);
COMMIT;
-- 失败：ROLLBACK;
```

三个纪律：

1. **事务内不做外部调用**（HTTP、消息队列），否则持锁时间不可控；
2. **检查 `UPDATE` 的 `affectedRows`**，扣减库存这类操作要靠它判断是否成功（`WHERE stock >= 1` 保证不会扣成负数）；
3. **长事务是大忌**：会拖住 undo 清理、撑大 history list、加剧锁冲突。监控 `information_schema.innodb_trx` 里 `trx_started` 超过 60 秒的事务。

---

## 6. 权限、备份与运维

### 6.1 账号与权限

```sql
-- 建业务账号（不要用 root 连应用）
CREATE USER 'app'@'%' IDENTIFIED WITH caching_sha2_password BY 'StrongPwd@2026';
GRANT SELECT, INSERT, UPDATE, DELETE ON app.* TO 'app'@'%';
GRANT EXECUTE ON PROCEDURE app.calc_bonus TO 'app'@'%';
FLUSH PRIVILEGES;

-- 只读账号（报表、BI）
CREATE USER 'readonly'@'%' IDENTIFIED BY 'Read@2026';
GRANT SELECT ON app.* TO 'readonly'@'%';

-- 查权限
SHOW GRANTS FOR 'app'@'%';
```

`'app'@'%'` 与 `'app'@'localhost'` 是**两个不同账号**，各自独立授权 —— 这是 `1045 Access denied` 的高频原因。

### 6.2 关键配置

`my.cnf` / `my.ini`（Linux 常为 `/etc/mysql/my.cnf`）：

```ini
[mysqld]
character-set-server = utf8mb4
collation-server     = utf8mb4_0900_ai_ci
default-time-zone    = '+08:00'

innodb_buffer_pool_size = 4G        # 建议物理内存的 50%~70%
innodb_log_file_size    = 512M
max_connections         = 500
wait_timeout            = 28800     # 空闲 8 小时断开，应用侧要配 keepAlive

slow_query_log      = ON
slow_query_log_file = /var/log/mysql/slow.log
long_query_time     = 1             # 超过 1 秒记慢日志
log_queries_not_using_indexes = OFF # 开了会刷爆日志，按需临时开
```

**`innodb_buffer_pool_size` 是 MySQL 最重要的一个参数**，绝大多数读都在它里面完成，配置过小会让磁盘 IO 成为瓶颈。

### 6.3 慢查询分析

```bash
# 用官方工具聚合慢日志
mysqldumpslow -s t -t 10 /var/log/mysql/slow.log

# 或 pt-query-digest（Percona Toolkit，更专业）
pt-query-digest /var/log/mysql/slow.log
```

### 6.4 备份与恢复

```bash
# 逻辑备份（中小库，InnoDB 用 --single-transaction 保证一致性且不锁表）
mysqldump -u root -p --single-transaction --routines --triggers --events \
  --default-character-set=utf8mb4 app > app_$(date +%F).sql

# 恢复
mysql -u root -p app < app_2026-11-12.sql

# 物理备份（大库，Percona XtraBackup）
xtrabackup --backup --target-dir=/backup/full --user=root --password=xxx
```

注意：`mysqldump` 是**逻辑**备份，大库恢复很慢；TB 级请用 XtraBackup 或文件系统快照。

### 6.5 监控要看什么

```sql
SHOW PROCESSLIST;                              -- 当前连接与执行中的 SQL
SHOW ENGINE INNODB STATUS\G                    -- 锁、死锁、缓冲池
SELECT * FROM information_schema.innodb_trx;   -- 长事务
SHOW STATUS LIKE 'Threads_connected';          -- 连接数水位
SHOW STATUS LIKE 'Innodb_buffer_pool_read%';   -- 命中率
```

命中率 `Innodb_buffer_pool_read_requests / (read_requests + reads)` 低于 95% 说明缓冲池不够。

---

## 7. 性能优化清单

按"收益/成本"排序，逐条排查：

**SQL 层**

1. 用 `EXPLAIN` 确认没出现 `type=ALL`；
2. 消除 `Using filesort` 与 `Using temporary`；
3. 大表分页改游标分页；
4. 避免 `SELECT *`，只取需要的列（可能命中覆盖索引）；
5. 批量操作合并（`INSERT ... VALUES (...),(...)`、`IN` 批量）；
6. `COUNT(*)` 大表慎用，改为估算（`SHOW TABLE STATUS`）或维护计数表。

**索引层**

7. 高频查询列建索引，低选择性列（如性别、状态只有 2 值）单独建索引意义不大；
8. 联合索引按"等值在前、范围在后"排；
9. 用覆盖索引消灭回表；
10. 定期 `ANALYZE TABLE` 更新统计信息。

**架构层**

11. 读写分离（主写从读，注意主从延迟，强一致读走主库）；
12. 热点数据加 Redis 缓存，注意缓存穿透/击穿/雪崩；
13. 大字段（TEXT/BLOB）拆表，避免拖慢主表扫描；
14. 分库分表（最后手段，优先索引和缓存）。

**规范层**

15. 禁止 `SELECT *`、禁止无 `WHERE` 的 `UPDATE`/`DELETE`；
16. 所有 SQL 必须参数化，禁止拼接；
17. 事务内禁止外部调用；
18. 生产变更走 review + 低峰 + 可回滚。

---

## 8. 常见错误码对照

| 错误码 | 消息 | 常见原因 | 处理 |
|---|---|---|---|
| 1045 | Access denied for user | 密码错 / 账号 host 不匹配 | 核对 `'user'@'host'`，本地用 `127.0.0.1` |
| 1049 | Unknown database | 库不存在 | `CREATE DATABASE` 或检查拼写 |
| 1054 | Unknown column | 列名/别名错 | 检查 SELECT 与 WHERE 的列名 |
| 1062 | Duplicate entry | 唯一索引冲突 | 插入前查重，或用 `INSERT ... ON DUPLICATE KEY UPDATE` |
| 1064 | Syntax error | SQL 语法错 | 看报错位置附近，注意缺逗号/括号 |
| 1213 | Deadlock found | 死锁 | 统一加锁顺序 + 业务重试 |
| 1205 | Lock wait timeout exceeded | 等锁超时（默认 50s） | 缩短事务、查长事务、`innodb_lock_wait_timeout` |
| 1265 / 1264 | Data truncated / Out of range | 值超列范围 | 检查字段长度与类型 |
| 1366 | Incorrect string value | 字符集不匹配（emoji/生僻字） | 表与连接都改 utf8mb4 |
| 1451 / 1452 | FK constraint fails | 外键约束 | 先插父表或先删子表 |
| 1251 | Client does not support authentication | 老驱动 + caching_sha2_password | 升级驱动（Node 用 mysql2） |
| 2003 | Can't connect to MySQL server | 服务未启动/端口不通/防火墙 | 查 `ss -ltn`、`systemctl status mysql` |
| 2013 | Lost connection during query | 超时/大查询/网络中断 | 拆分查询、调 `net_read_timeout` |

---

## 9. Node.js + mysql2 实战

### 9.1 安装与连接池

```bash
npm i mysql2
```

```js
// db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: '127.0.0.1',              // 不要写 localhost（IPv6 问题）
  port: 3306,
  user: 'app',
  password: 'StrongPwd@2026',
  database: 'app',
  charset: 'utf8mb4',
  timezone: '+08:00',
  dateStrings: true,              // 时间返回字符串，避免时区换算
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,          // 规避 wait_timeout 断连
  keepAliveInitialDelay: 0,
  decimalNumbers: false,          // 金额保持字符串，防精度丢失
});

module.exports = pool;
```

### 9.2 `pool.query` 的返回结构

```js
const [rows, fields] = await pool.query('SELECT id, name FROM users WHERE status = ?', [0]);
```

| SQL | `rows` 形态 |
|---|---|
| `SELECT` | 对象数组 `[{...}]` |
| `INSERT` | ResultSetHeader：`{ insertId, affectedRows, info }` |
| `UPDATE` / `DELETE` | ResultSetHeader：`{ affectedRows, changedRows, info }` |
| 多语句 | 嵌套数组，每语句一份结果 |

通用判断：

```js
const [result] = await pool.query(sql, params);
if (Array.isArray(result)) {
  // SELECT：result.length 是行数
} else {
  // 写操作：result.affectedRows / result.insertId
}
```

### 9.3 增删改查封装

```js
// 查
async function findUserById(id) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, status FROM users WHERE id = ?',
    [id]
  );
  return rows[0] ?? null;
}

// 增
async function createUser({ name, email }) {
  const [result] = await pool.execute(
    'INSERT INTO users (name, email) VALUES (?, ?)',
    [name, email]
  );
  return { id: result.insertId };
}

// 改
async function disableUser(id) {
  const [result] = await pool.execute(
    'UPDATE users SET status = 1 WHERE id = ? AND status = 0',
    [id]
  );
  return result.affectedRows === 1;   // 幂等判断靠 affectedRows
}

// 删
async function deleteUser(id) {
  const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
  return result.affectedRows > 0;
}
```

### 9.4 事务

```js
async function transfer(fromId, toId, amount) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [r1] = await conn.execute(
      'UPDATE accounts SET balance = balance - ? WHERE id = ? AND balance >= ?',
      [amount, fromId, amount]
    );
    if (r1.affectedRows !== 1) throw new Error('余额不足');

    await conn.execute(
      'UPDATE accounts SET balance = balance + ? WHERE id = ?',
      [amount, toId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();       // 必须 release，不是 end()
  }
}
```

三个要点：`getConnection` 后必须 `release()`；`try/catch/finally` 三段式；业务错误也走 `rollback`。

### 9.5 分页与批量

```js
// 普通分页
async function page(offset, size) {
  const [rows] = await pool.query(
    'SELECT * FROM orders ORDER BY id DESC LIMIT ?, ?',
    [offset, size]
  );
  return rows;
}

// 游标分页（深分页首选）
async function pageByCursor(lastId, size) {
  const [rows] = await pool.query(
    'SELECT * FROM orders WHERE id < ? ORDER BY id DESC LIMIT ?',
    [lastId, size]
  );
  return rows;
}

// 批量插入（注意多一层数组）
async function batchInsert(items) {
  const values = items.map(it => [it.name, it.email]);
  const [result] = await pool.query(
    'INSERT INTO users (name, email) VALUES ?',
    [values]
  );
  return result.affectedRows;
}
```

`execute` 不支持 `VALUES ?` 的二维数组写法，批量必须用 `query`。

### 9.6 与 Koa 结合的最小服务

```js
const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('@koa/bodyparser');
const pool = require('./db');

const app = new Koa();
const router = new Router({ prefix: '/api' });

app.use(bodyParser());

router.get('/users/:id', async (ctx) => {
  const [rows] = await pool.execute(
    'SELECT id, name, email FROM users WHERE id = ?',
    [ctx.params.id]
  );
  if (!rows.length) { ctx.status = 404; ctx.body = { message: 'not found' }; return; }
  ctx.body = rows[0];
});

router.post('/users', async (ctx) => {
  const { name, email } = ctx.request.body ?? {};
  if (!name || !email) { ctx.status = 400; ctx.body = { message: 'name/email required' }; return; }
  const [result] = await pool.execute(
    'INSERT INTO users (name, email) VALUES (?, ?)',
    [name, email]
  );
  ctx.status = 201;
  ctx.body = { id: result.insertId };
});

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = { code: ctx.status, message: err.status ? err.message : 'Internal Error' };
    if (!err.status) console.error(err);
  }
});

app.use(router.routes()).use(router.allowedMethods());
app.listen(3002);
```

### 9.7 参数化与安全

```js
// ✅ 参数化，驱动负责转义
await pool.execute('SELECT * FROM users WHERE name = ?', [name]);

// ❌ 拼接，注入风险
await pool.query(`SELECT * FROM users WHERE name = '${name}'`);
```

表名、列名不能用 `?` 绑定，必须来自**白名单**：

```js
const SORTABLE = new Set(['id', 'created_at', 'amount']);
if (!SORTABLE.has(sortBy)) throw new Error('invalid sort field');
await pool.query(`SELECT * FROM orders ORDER BY ${sortBy} DESC LIMIT ?`, [limit]);
```

### 9.8 优雅关闭

```js
process.on('SIGTERM', async () => {
  await pool.end();      // 等待在用连接归还后关闭
  process.exit(0);
});
```

---

## 10. 学习路径与练习

### 10.1 四阶段路径

| 阶段 | 目标 | 关键内容 |
|---|---|---|
| 1. 能用 | 独立建库建表、写 CRUD | 第 1～3 章 + 数据类型 |
| 2. 能查 | 读懂 EXPLAIN、建对索引 | 第 4 章 + 慢日志 |
| 3. 能稳 | 事务、锁、隔离级别 | 第 5 章 + 死锁排查 |
| 4. 能扛 | 优化、备份、监控 | 第 6～7 章 + 读写分离 |

### 10.2 练习（附答案要点）

**练习 1**：`users(id, name, status, created_at)`，查"状态 0 且按创建时间倒序的前 20 条"，写出索引并解释为什么。

> 要点：`KEY idx_status_created (status, created_at)`。等值列在前、排序列在后，可同时满足过滤和排序，避免 `Using filesort`。

**练习 2**：`orders(user_id, amount, status)` 百万行，`SELECT * FROM orders WHERE user_id = 1 ORDER BY id DESC LIMIT 10` 很慢，怎么优化？

> 要点：建 `(user_id, id)` 联合索引；`ORDER BY id` 走索引有序性，无需排序；若返回列多，考虑覆盖索引。

**练习 3**：两个事务互相等待对方持有的行锁，报 1213。如何定位和修复？

> 要点：`SHOW ENGINE INNODB STATUS` 看 `LATEST DETECTED DEADLOCK`；统一加锁顺序（按主键升序）；缩短事务；RC 隔离；业务对 1213 重试。

**练习 4**：为什么 `WHERE phone = 13800138000`（phone 是 VARCHAR）用不上索引？

> 要点：隐式类型转换把字符串列转成数字比较，索引列被"函数化"，失效。传 `'13800138000'`。

**练习 5**：`SELECT COUNT(*) FROM orders` 在千万行表上很慢，还有哪些替代方案？

> 要点：维护计数表（写入时 +1/-1）；`SHOW TABLE STATUS` 估算；近似统计用 `information_schema.tables`；业务上接受最终一致。

### 10.3 推荐工具

| 工具 | 用途 |
|---|---|
| MySQL Workbench / DBeaver / Navicat | 图形客户端 |
| `EXPLAIN ANALYZE` | 真实执行计划 |
| Percona Toolkit（`pt-query-digest`） | 慢日志聚合分析 |
| `sysbench` | 压测 |
| `mysqlslap` | 并发基准测试 |

---

## 附录：一页速查

```sql
-- 看表结构
SHOW CREATE TABLE users\G
-- 看索引
SHOW INDEX FROM users;
-- 看表大小
SELECT table_name, ROUND(data_length/1024/1024) AS data_mb,
       ROUND(index_length/1024/1024) AS index_mb, table_rows
FROM information_schema.tables WHERE table_schema = 'app';
-- 看当前执行
SHOW FULL PROCESSLIST;
-- 杀连接
KILL <id>;
-- 刷新统计
ANALYZE TABLE users;
-- 重建表（回收空间）
OPTIMIZE TABLE users;
```

> （注：部分内容由豆包 AI 生成）