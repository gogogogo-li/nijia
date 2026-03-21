# OneHoldem Telegram 机器人登录 + 游戏接入技术方案

## 1. 目标与范围

目标是在 Telegram 内完成以下闭环：
- 用户通过 Telegram Bot 点击入口进入游戏（Mini App）。
- 用户无需外部钱包签名即可登录 OneHoldem（可选保留 zkLogin 地址映射能力）。
- 登录后可正常获取大厅牌桌列表、加入房间并开始游戏。
- 兼容现有 `auth-service`、`hall-service`、`lobby-service` 的 JWT 鉴权链路。

本方案覆盖：
- Telegram 侧（Bot + Mini App）能力设计
- 后端接口设计与改造点
- 鉴权、安全、风控
- 分阶段实施计划与验收标准

不覆盖：
- 游戏玩法引擎规则改造（牌局逻辑本身不改）
- Telegram Stars/支付集成（可在后续迭代）

---

## 2. 现状评估（基于当前仓库）

当前代码已具备可复用基础：
- `packages/auth-service/src/routes/auth.ts`
  - 已有 Web3、zkLogin、JWT/Refresh Token 流程。
  - 存在 Telegram 登录草稿代码，但大部分为注释态，未形成完整可用链路。
- `packages/common/src/utils/jwt.ts`
  - 已引入 `@telegram-apps/init-data-node`，并有 `verifyTelegramJwt()`。
  - Telegram Init Data 校验函数为注释态，建议重构并启用为正式函数。
- `packages/hall-service/src/routes/hall.ts`
  - `/join` 使用统一 `authenticate()` 校验 JWT，拿到 token 后进入 `RoomService.joinRoom(...)`。
- `packages/lobby-service/src/rooms/LobbyRoom.ts`
  - `onAuth` 通过 `verifyJWT()` 校验 token，说明只要签发 OneHoldem JWT，即可进入现有实时大厅/牌桌系统。

结论：
- “在 Telegram 中玩游戏”技术上可直接复用现有后端鉴权与进房链路。
- 核心缺口在“Telegram 身份 -> OneHoldem Token”的标准化与安全落地。

---

## 3. 总体架构

```text
Telegram User
  -> Telegram Bot (/start, menu button, deep link)
  -> Telegram Mini App (WebView, 携带 initData)
  -> auth-service (/auth/telegram/miniapp-login)
     - 校验 initData 签名和时效
     - 查找/创建本地用户
     - 签发 OneHoldem accessToken + refreshToken
  -> hall-service (/hall/table-list, /hall/join)
  -> Colyseus (lobby-service/friend-service/hall-service rooms)
```

设计原则：
- Telegram 仅作为身份提供方，不替代业务 JWT。
- 业务统一继续使用 OneHoldem JWT（避免改动所有下游服务）。
- Telegram 用户首次登录时自动建档并补齐昵称/头像策略。

---

## 4. 鉴权与账号模型设计

## 4.1 账号标识策略

建议新增/规范以下字段（若已存在则只补约束）：
- `provider`: `telegram`
- `providerUserId`: Telegram `user.id`（字符串）
- `walletAddress`: 两种可选策略
  - A. **推荐短期**：系统生成稳定虚拟地址（或 deterministic address）
  - B. **兼容现有 zk 流程**：基于 `sub + salt` 生成映射地址（当前代码已有能力）

建议落地：
- 使用 `provider + providerUserId` 作为唯一键（必须加唯一索引）。
- 不把 Telegram `username` 作为唯一标识（可变更且可能为空）。

## 4.2 Token 签发策略

不新增新 token 体系，继续复用：
- `generateJWT(walletAddress, userId)`（1h）
- `generateRefreshToken(walletAddress, userId)`（7d）

好处：
- `authenticate()`、`verifyJWT()`、`hall-service`、`lobby-service` 无需协议变更。

## 4.3 Telegram Init Data 校验

后端必须执行：
- 校验 `initData` HMAC 签名（基于 Bot Token）
- 校验 `auth_date` 时效（建议 <= 300s）
- 校验解析后 `user.id` 存在

建议在 `packages/common/src/utils/jwt.ts` 新增正式函数：
- `validateTelegramInitData(initData: string): TelegramUserPayload | null`

---

## 5. 接口方案

## 5.1 新增接口：Mini App 登录

- `POST /auth/telegram/miniapp-login`

请求：
```json
{
  "initData": "query_id=...&user=...&auth_date=...&hash=..."
}
```

响应：
```json
{
  "token": "access_token",
  "refreshToken": "refresh_token",
  "user": {
    "id": "123",
    "walletAddress": "0x...",
    "nickname": "tg_xxx",
    "avatar": "https://..."
  },
  "isNewUser": true
}
```

处理流程：
1. 解析并校验 `initData`。
2. 读取 Telegram 用户资料（id, username, first_name, photo_url）。
3. 使用 `provider=telegram + providerUserId` 查询用户。
4. 不存在则创建用户（昵称冲突自动处理）。
5. 生成并返回 OneHoldem `token/refreshToken`。
6. 写入 Redis 用户缓存 `user:{walletAddress}`。

## 5.2 兼容接口：刷新与登出

沿用现有：
- `POST /auth/refreshToken`
- `POST /auth/logout`

无需 Telegram 特化。

## 5.3 大厅与进房

沿用现有：
- `GET /hall/table-list`（或 `GET /hall/tables`）
- `POST /hall/join`（Bearer token）

返回 `sessionId` 后，Mini App 连接 Colyseus 房间继续游戏。

---

## 6. 机器人与前端（Mini App）设计

## 6.1 Bot 侧

建议指令：
- `/start`：返回欢迎文案 + “开始游戏”按钮
- 按钮使用 `web_app` 打开 Mini App URL
- 支持深链参数：`/start table_<roomId>`（可选）

## 6.2 Mini App 启动流程

1. 前端读取 `window.Telegram.WebApp.initData`
2. 调用 `/auth/telegram/miniapp-login` 换取业务 JWT
3. 存储 `token/refreshToken`
4. 请求大厅列表
5. 选择牌桌并调用 `/hall/join`
6. 带 token 连接游戏房间

## 6.3 断线与恢复

- access token 过期：用 refresh token 自动刷新
- 刷新失败：重新走 `miniapp-login`
- WebSocket 断线：指数退避重连，重连前先检查 token 有效性

---

## 7. 安全与风控要求

必须项：
- 不信任前端传入的 Telegram user 字段，后端只信任签名校验后的数据。
- `initData` 必须有时效校验与重放防护（可记录 `query_id` 短期去重）。
- 登录接口加限流（按 IP + providerUserId 双维度）。
- 关键行为日志必须包含 `playerId`，房间行为附带 `roomId`（遵循现有日志规范）。

建议项：
- Bot Token 全部移入 Secret Manager（禁止明文传播、禁止打印）。
- 异常登录行为告警（高频失败、跨区异常、设备指纹突变）。

---

## 8. 数据库与缓存改造建议

数据库：
- `users` 表增加/确认字段
  - `provider`（varchar）
  - `provider_user_id`（varchar）
- 增加唯一索引：`uniq_provider_user(provider, provider_user_id)`

缓存：
- 登录成功后继续写 `user:{walletAddress}` hash
- 可新增 `telegram:user:{providerUserId} -> walletAddress` 映射缓存，降低 DB 查询

---

## 9. 代码改造清单（建议）

1. `packages/common/src/utils/jwt.ts`
- 新增 `validateTelegramInitData(initData)`
- 明确返回结构与异常分支

2. `packages/auth-service/src/routes/auth.ts`
- 新增 `POST /telegram/miniapp-login`
- 复用用户创建、默认头像、token 签发逻辑
- 增加关键日志（失败原因 + playerId）

3. `packages/common/src/repository/userRepo.ts`（如需）
- 新增 `getUserByProvider(provider, providerUserId)` 查询
- 新增/复用创建方法支持 provider 字段

4. `docs/` 下接口文档
- 增加 Telegram 登录 API 文档与错误码

5. `test_case/telegram-login-game/`
- 增加接口测试与时效/签名失败用例

---

## 10. 分阶段实施计划

## Phase 1（1-2 天）：后端登录链路打通
- 完成 `miniapp-login` 接口
- 完成 Init Data 校验
- 完成用户创建/查询与 token 签发
- Postman 自测 + 基础日志验证

验收：
- Telegram Mini App 首次进入可拿到 `token/refreshToken`
- 可调用 `/hall/table-list`、`/hall/join`

## Phase 2（2-3 天）：Mini App 接入与进房
- 前端接入 Telegram SDK 启动逻辑
- 完成 token 刷新与断线重连
- 联调 Colyseus 进房与桌内消息

验收：
- Telegram 内可完成“登录 -> 进桌 -> 开始游戏”全流程

## Phase 3（1-2 天）：安全加固与灰度
- 限流、重放防护、告警
- 灰度开关（按白名单 bot/user）
- 监控看板与回滚预案

验收：
- 通过压测与安全检查
- 线上灰度稳定

---

## 11. 测试方案

功能测试：
- 首次登录创建账号
- 老用户重复登录复用账号
- token 刷新、登出、再次登录
- 进入大厅、加入牌桌、断线重连

安全测试：
- 篡改 initData hash
- 超时 auth_date
- 重放同一 initData
- 高频请求限流命中

回归测试：
- Web3 登录、zkLogin 登录不受影响
- 现有 `hall-service` 与 `lobby-service` 鉴权行为一致

---

## 12. 风险与应对

风险 1：Telegram 字段不稳定（username/photo 变更）
- 应对：唯一身份只用 `providerUserId`

风险 2：initData 被重放
- 应对：时间窗 + query_id 去重 + 限流

风险 3：昵称冲突导致建号失败
- 应对：昵称生成策略 `tg_<id后缀>` + 自动重试

风险 4：上线初期异常峰值
- 应对：灰度开关 + 观测告警 + 快速回滚到“仅 Web3 登录”

---

## 13. 上线清单（Checklist）

- [ ] BotFather 配置 Mini App URL、域名白名单
- [ ] 生产环境 Secret 注入（Bot Token/JWT Secret）
- [ ] DB 索引上线（provider + provider_user_id）
- [ ] `miniapp-login` 接口灰度开关
- [ ] 监控项：登录成功率、401 比例、join 成功率、房间连接成功率
- [ ] 回滚脚本与应急联系人确认

---

## 14. 最小可行落地版本（MVP）

MVP 建议只做：
- Telegram Mini App 登录换 OneHoldem JWT
- 大厅列表 + 加入房间 + 基础牌局可玩
- 不做支付，不做复杂社交任务体系

这样可以最快验证业务价值，并且与现有后端耦合最小。
