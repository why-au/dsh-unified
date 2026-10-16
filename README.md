# dsh-unified

面向 DeepSeek Harness（DSH）的模型渠道聚合插件，包含订阅/API key vendor、多账号轮换与渠道状态面板。代码中存在集成不等于对应服务当前可用；登录方式、模型目录、额度与签到能力取决于服务商和部署环境。

> 聚合来源与 MIT 署名见 [NOTICE.md](NOTICE.md)。当前仍需独立测试 profile 的真机 DSH 验证，不承诺“所有平台可用”或“零泄露”。

## 功能与范围

- 订阅/API key 渠道：Codex、Claude、Grok、Copilot、Antigravity、Qwen、ERNIE、GLM、Kimi、Spark、Cursor、JetBrains、Cody、Kiro、Perplexity、Replit 等 vendor 实现。不是所有渠道都使用 OAuth PKCE，也不是所有订阅都可免 API key 接入。
- IDE 渠道：WorkBuddy、Trae、Qoder；各自登录、目录与签到能力不同。
- OpenCode Zen：无需账号槽位或假 token 即注册匿名通道；远端策略、模型及访问权限可能随时变化，不能将本地单元测试等同于每日端到端可用性验证。匿名通道共用一个限流身份；若多个 Zen 槽位配置代理，按槽位顺序选择第一个非空 `proxyUrl`，不会通过多槽位轮换绕过限流。
- 多账号轮换、冷却、额度预测与可选跨渠道回退。模型只会在配置及渠道状态允许时出现，不保证展示全部平台模型。
- 统一渠道中心与订阅配置 UI；实际显示取决于宿主版本、插件 profile 和客户端服务。

## 安全与数据边界

凭据通常由宿主 credentials 服务或各渠道自己的存储机制管理，而非保证所有渠道只写入同一凭据库。手工令牌输入会经过浏览器；备份导出会把加密凭据载荷交给浏览器，备份口令也通过请求交给宿主。OAuth、代理、日志脱敏及加密备份都不能保证“零泄露”。

配置里的敏感字段（例如 `antigravityClientSecret`）是 **volatile** 设置：宿主会把它们以**明文**持久化到该 profile 的 `cordis.patch.yml`。接口回显时会打码，但落盘不是加密存储。不要把长期有效的私密凭据放进这些配置字段；优先使用宿主 credentials 服务或渠道自身的凭据机制，并注意 profile 目录的备份与共享风险。

- 只在可信设备和浏览器中操作；远程访问应使用经过认证的 HTTPS，避免将插件管理端口暴露到不可信网络。
- 浏览器、宿主进程、依赖及被授权的远端服务均属于信任边界。不要向 issue 粘贴令牌、Cookie、授权码、未审阅的诊断或代理 URL。
- 手工检查诊断输出后再分享。显示脱敏并不等于凭据静态加密，也不代表所有错误消息都可公开。
- 启用代理或跨渠道回退前，确认目标可信并理解请求内容会发往何处；不要把回退理解为同一服务商内切换。

## 安装（手工步骤，本次开发验证不执行安装）

需要兼容当前 package peerDependencies 的 DSH 环境及 Node/pnpm。本包当前声明并已针对 DSH `0.2.0-rc.2` 的插件接口核对；换用其他宿主版本前请先对照 `peerDependencies`。请先使用隔离的测试 profile，备份原有配置，不覆盖正在使用的安装或凭据。以下以 `web` profile 为示例；实际 CLI 参数以该版本 `dsh plugin --help` 为准。

```bash
# 源码打包：进入此仓库目录后执行
pnpm install
pnpm test
pnpm pack

# 在准备好的测试 DSH 环境安装生成的包（替换实际文件名）
dsh plugin --profile web add ./dsh-unified-dsh-plugin-0.1.0.tgz
```

只有确认 npm 已实际发布该版本后，才使用：

```bash
dsh plugin --profile web add @dsh-unified/dsh-plugin
```

安装后根据宿主要求重启对应 profile，再刷新其已有 Web 页面。不要另起一个前端开发服务器来代替宿主验证。

### 前端接入契约

现代 DSH 的 clientModules 根据宿主 Loader 已激活的包扫描 package 元数据：

1. `dsh.client.platform` 为 `web`，`exports["./client"]` 指向随包发布的 `lib/client.bundle.js`。`pnpm build:client` 将订阅和渠道中心两个源码工厂组合为单一宿主入口；`pnpm test` 和打包前会自动构建。
2. `dsh.client.inject` 声明 `slots`、`locale`、`sessions`；`external` 声明 React、React DOM（渠道弹层 portal）和可选 UI primitives，以便宿主准备依赖工厂。
3. 客户端通过 `window.__ModuleLoader__.load` 注册工厂，模块 ID 必须与包名 `@dsh-unified/dsh-plugin` 一致。执行脚本只注册，宿主实际加载工厂后才注册 UI。
4. bundle 配置 seat 使用包名，row 配置 seat 使用 `@dsh-unified/dsh-plugin#dsh-unified`。`dsh-subscriptions` 仍是兼容的 HTTP/locale 命名空间，不是已发布包的身份。

不需要在 host `apply()` 中再次注入脚本或注册重复的静态资源路由。只有 `./client` export 而没有 `dsh.client` 元数据不足以让现代宿主发现 UI。

包还必须能被宿主当作 profile 层加载：`dsh.bundle.patch` 指向 `cordis.patch.yml`，而该文件是顶层数组的 `insert` overlay（不再是旧的 `version/services/entry` 结构）。缺少它时安装器只会把它当作普通依赖，插件不会激活。安装后安装器会自动把包名加入该 profile 的 `dsh.profile.bundles`。

### 安装验收清单（已在隔离 profile 执行一次，见 VALIDATION.md）

- 插件管理器显示 `@dsh-unified/dsh-plugin`，宿主无依赖解析/激活失败；不要只检查插件清单是否存在。
- 刷新页面后，检查宿主 boot graph / 网络中的插件 bundle 是否包含该包；控制台不应出现 module factory missing 或上游包 ID 冲突。
- 打开此包的配置详情，确认订阅卡片可见；检查「渠道中心」面板入口和输入区额度/订阅 UI。布局入口可能随宿主版本变化，不假定存在独立的 Settings → Subscriptions 页。
- 先不提供真实凭据，确认配置读取失败时有可见反馈；随后仅在自愿提供测试凭据的隔离环境中，逐个验证登录、保存/重启持久化、模型列表与请求。不要凭某一渠道成功宣称全部可用。
- 卸载/禁用并刷新，确认入口消失；保留安装版本、宿主版本及脱敏错误作为验证记录。

### 已执行的隔离验收（0.2.0-rc.2）

在独立 `DSH_HOME` 与独立 profile 中完成，未使用真实凭据、未改动正在使用的 profile：

1. `dsh plugin --profile <test> add <tgz>` 成功后，安装器**自动**把本包加入该 profile 的 `dsh.profile.bundles`；早前版本需要在包里声明 `dsh.bundle`，现已修正。
2. 启动后页面 HTTP 200，boot graph 含 `@dsh-unified/dsh-plugin`；其 `plugins/??…/client.js` 资源 200，且同时包含订阅 UI 与渠道中心两个工厂。
3. 后端路由 `/plugins/dsh-unified/status|settings`、`/dsh-subscriptions/health|config|status` 均 200；Zen 匿名渠道显示为已登录且无需凭据。
4. 通过 `/dsh-subscriptions/config`（GET/PUT + revision）写入配置成功，重启后仍保留；敏感字段回显为掩码。

浏览器内的实际渲染、布局与 React 挂载仍需人工确认：本次没有浏览器自动化工具，HTTP 与资源检查不能替代视觉验收。

## 架构

- `lib/index.js`：host 编排入口，挂接订阅底座、三个 IDE 渠道和面板。
- `lib/client.js`：宿主模块加载器消费的客户端工厂及订阅配置 UI。
- `lib/vendors/`：vendor 实现；`lib/channels/`：独立 IDE 渠道。
- `lib/panel.js`：统一面板及 HTTP 聚合。
- `lib/rotate.js`、`lib/quarantine.js`、`lib/forecast.js`、`lib/cascade.js` 等：轮换、冷却、预测和回退逻辑（位于 lib 根目录，不是 lib/core）。

## 开发与验证

```bash
pnpm install
pnpm test
pnpm check                    # 递归 JavaScript 语法检查（不是类型检查）
node --test test/client-integration.test.mjs
node --check lib/client.js
node --check lib/index.js

# 可选远端冒烟：会访问真实 Zen 服务；不属于离线测试
pnpm smoke:zen
```

客户端测试使用 Node VM 中的宿主契约桩，检查 manifest、模块 ID、延迟工厂、UI 注册和清理；不启动服务器、不登录、不读取用户凭据。它不能替代真实浏览器/DSH 部署验证。语法检查同样不证明依赖、网络或服务商协议可用。

GitHub Actions 配置会在 Windows/Linux 上执行锁定依赖安装、离线测试、语法检查和打包。远端 CI 结果应以实际运行记录为准，本地验证记录见 [VALIDATION.md](VALIDATION.md)。

## 许可与署名

MIT。聚合自四个上游项目（见 [NOTICE.md](NOTICE.md)）：
`@goodandready/dsh-subscriptions` · `dsh-connect` · `dsh-plugin-subscriptions` · `opencode2dsh`。
