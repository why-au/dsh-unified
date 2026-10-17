# dsh-unified

面向 DeepSeek Harness（DSH）的模型渠道聚合插件，包含订阅/API key vendor、多账号轮换与渠道状态面板。代码中存在集成不等于对应服务当前可用；登录方式、模型目录、额度与签到能力取决于服务商和部署环境。

> 聚合来源与 MIT 署名见 [NOTICE.md](NOTICE.md)。当前仍需独立测试 profile 的真机 DSH 验证，不承诺“所有平台可用”或“零泄露”。

## 功能与范围

- 订阅/API key 渠道：Codex、Claude、Grok、Copilot、Antigravity、Qwen、ERNIE、GLM、Kimi、Spark、Cursor、JetBrains、Cody、Kiro、Perplexity、Replit 等 vendor 实现。不是所有渠道都使用 OAuth PKCE，也不是所有订阅都可免 API key 接入。
- IDE 渠道：WorkBuddy、Trae、Qoder；各自登录、目录与签到能力不同。
- OpenCode Zen：无需账号槽位或假 token 即注册匿名通道；远端策略、模型及访问权限可能随时变化，不能将本地单元测试等同于每日端到端可用性验证。匿名通道共用一个限流身份；若多个 Zen 槽位配置代理，按槽位顺序选择第一个非空 `proxyUrl`，不会通过多槽位轮换绕过限流。
- 多账号轮换、冷却、额度预测与可选跨渠道回退。模型只会在配置及渠道状态允许时出现，不保证展示全部平台模型。
- 统一渠道中心与订阅配置 UI；实际显示取决于宿主版本、插件 profile 和客户端服务。

## 输入框下方的订阅额度（0.1.6）

默认模式为「当前订阅 · 多窗口与重置倒计时」：在 composer 底部统计行显示如 `Codex 4h 59m 0% · 5d 12h 78%`。百分比表示**已用**，时间表示距窗口重置；不再用全局最近请求猜当前会话的订阅。模型服务暂不可用时，当前订阅模式不显示其他会话的数据。

在订阅配置页的「输入框额度指示器」切换：当前订阅、全部订阅、关闭，或保留的简易剩余百分比/进度条/耗尽预测模式。点击底部徽标展开全部账号与窗口、采样时间。默认当前订阅模式不会在 WorkBuddy 等非订阅模型下冒出 Codex 额度；要一直查看其他订阅请选「全部订阅」。

- Codex、Claude、Grok、Antigravity：现有适配器支持多窗口数据；倒计时仅在上游提供重置时间时展示，模型级额度只匹配当前模型，不用其他模型的百分比代替。
- Kimi、GLM、Cursor、Kiro：目前主要是汇总百分比，不保证能显示多窗口或重置时间。
- Copilot：仅支持现有适配器能读取的百分比字段，不承诺完整 premium 请求额度。
- 其他订阅或上游未返回额度：显示「额度未知」，不会虚构 0%。无额度接口不等于无限额度。
- 读取账号存储中已有快照，不额外高频请求上游；每分钟拉本地状态、每 10 秒刷新倒计时，较早采样与读取失败会提示。新功能已做模拟组件/数据链路测试，仍需桌面浏览器视觉验收；没有逐平台联网验证。

## 安全与数据边界

凭据通常由宿主 credentials 服务或各渠道自己的存储机制管理，而非保证所有渠道只写入同一凭据库。手工令牌输入会经过浏览器；备份导出会把加密凭据载荷交给浏览器，备份口令也通过请求交给宿主。OAuth、代理、日志脱敏及加密备份都不能保证“零泄露”。

配置里的敏感字段（例如 `antigravityClientSecret`）是 **volatile** 设置：宿主会把它们以**明文**持久化到该 profile 的 `cordis.patch.yml`。接口回显时会打码，但落盘不是加密存储。不要把长期有效的私密凭据放进这些配置字段；优先使用宿主 credentials 服务或渠道自身的凭据机制，并注意 profile 目录的备份与共享风险。

- 只在可信设备和浏览器中操作；远程访问应使用经过认证的 HTTPS，避免将插件管理端口暴露到不可信网络。
- 浏览器、宿主进程、依赖及被授权的远端服务均属于信任边界。不要向 issue 粘贴令牌、Cookie、授权码、未审阅的诊断或代理 URL。
- 手工检查诊断输出后再分享。显示脱敏并不等于凭据静态加密，也不代表所有错误消息都可公开。
- 启用代理或跨渠道回退前，确认目标可信并理解请求内容会发往何处；不要把回退理解为同一服务商内切换。

### IDE 渠道的凭据落点（迁移/清理前必读）

这三家 IDE 渠道不走宿主凭据库，而是在 `$DSH_HOME` 下按文件保存。替换或卸载旧插件前，先分清哪些文件属于**本插件/上游插件**、哪些属于**桌面应用**：

| 路径 | 归属 | 删除插件时 |
|------|------|-----------|
| `$DSH_HOME/connect-auth/<id>.json` | 插件落点（网页粘贴凭据写入处） | 可删，需重新登录 |
| `$DSH_HOME/.workbuddy<N>-auth.json` | 插件落点（**扫码登录**写入的副本） | 可删，需重新扫码 |
| `$DSH_HOME/.workbuddy<N>-catalog.json` 等 `.workbuddy*` 状态文件 | 插件落点（目录/探针/可见性缓存，非凭据） | 可删 |
| `$DSH_HOME/connect-channels.json` | 本插件的渠道注册表 | 可删 |
| `%LOCALAPPDATA%\CodeBuddyExtension\...\workbuddy-desktop.info` | **WorkBuddy 桌面应用**自己的登录态 | **保留**（应用要用） |

重要：WorkBuddy 各槽位**有意不读**桌面应用那份文件（`configuredAuthFile()` 把每个槽位钉到自己的 `connect-auth/workbuddy<N>.json`）。否则空槽位会回退去读 App 凭据，表现为"看起来已登录、其实是账号 1 的同一个号"。因此渠道中心也**不会**因为你装了桌面 App 就把该槽位判为已配置。

`trae` / `qoder` 的读取路径可由配置项（`credentialFile` / `patFile` / `sessionFile`）指回旧位置；改了配置项时请同步确认渠道仍能被列出。

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

### 界面入口挂载位置（0.2.0-rc.2 实测）

订阅界面与渠道中心被合成为同一个客户端工厂，但挂载的席位不同：

| 界面 | 席位 | 出现位置 |
|------|------|----------|
| 订阅配置 | `plugins.item`（按条目 id） | 插件页里本插件的卡片与详情页正文 |
| 渠道中心 | `sidebar.footer.action` | 左侧栏底部入口（弹出面板） |
| 渠道中心（配置页） | `plugins.detail.section`（list，带 `subject` 过滤） | 仅在本插件自己的详情页出现 |

`settings.plugin.item` 在 0.2.0-rc.2 中**已被移除**（宿主内 0 处注册、0 处渲染）；旧版本用它、新版本用 `plugins.detail.section`，两者同时注册，各自只在存在时生效。渠道中心**不能**改用 `plugins.bundle.config`：那是 keyed 席位、订阅卡片已占用本包 key，后注册者会替换先注册者，从而把订阅界面顶掉。

### 与旧插件的共存与替换

本包聚合自四个上游项目，因此**不可**与它们同时激活：会争抢相同的 provider id、`dsh-subscriptions` 设置命名空间与 `/dsh-subscriptions/*` 路由。装成 `dsh-unified-channels` 这类"安装用 bundle"的部署，需要先移除该 bundle（它插入的正是那四个上游条目）。

替换步骤（每步可回退）：

1. 备份 `$DSH_HOME/profiles/<profile>/` 与上表列出的凭据文件。
2. 先复制一份 profile 做替换演练，确认渠道列表与模型都正常。
3. 移除旧 bundle，装入本包，重启 profile。
4. 核对渠道列表：原 `connect-auth/` 下的凭据会**直接生效**，无需重新登录；只有扫码写入的 `.workbuddy<N>-auth.json` 也会被识别。
5. 确认无误后再删除旧插件残留文件。

完整的可照做清单（含备份、停服、验收、排错与回退）见 [REPLACEMENT.md](REPLACEMENT.md)。

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
5. 对着**已安装的宿主包**逐个核对席位：本插件注册的席位哪些真实存在、哪些被宿主渲染；由此发现并修正了渠道中心的失效入口。

浏览器内的实际渲染、布局与 React 挂载仍需人工确认：本次没有浏览器自动化工具，HTTP 与资源检查不能替代视觉验收。另外，**版本号不变时安装器会报 "Already up to date" 而不替换文件**；本地验证需先 `plugin remove` 再 `add`，或递增版本号。

## 架构

- `lib/index.js`：host 编排入口，挂接订阅底座、三个 IDE 渠道和面板。
- `lib/client.js`：订阅配置 UI 的客户端工厂源码。
- `lib/panel-client.js`：渠道中心的客户端工厂源码（左侧栏入口 + 面板 + 配置卡片）。
- `lib/client.bundle.js`：**生成产物**，由 `scripts/build-client.mjs` 把上面两个工厂合成为宿主加载的单一入口；`pnpm test` 会校验它与源码一致，改完源码要重新 `pnpm build:client`。
- `lib/vendors/`：vendor 实现；`lib/channels/`：独立 IDE 渠道。
- `lib/panel.js`：统一面板及 HTTP 聚合。
- `lib/rotate.js`、`lib/quarantine.js`、`lib/forecast.js`、`lib/cascade.js` 等：轮换、冷却、预测和回退逻辑（位于 lib 根目录，不是 lib/core）。

## 开发与验证

```bash
pnpm install
pnpm test                     # 先校验/重建前端产物，再跑全部离线测试
pnpm check                    # 递归 JavaScript 语法检查（不是类型检查）
pnpm build:client             # 只重建 lib/client.bundle.js（改了任一 *-client 源码后）

# 可选远端冒烟：会访问真实 Zen 服务；不属于离线测试
pnpm smoke:zen
```

客户端测试使用 Node VM 中的宿主契约桩，检查 manifest、模块 ID、延迟工厂、UI 注册和清理；不启动服务器、不登录、不读取用户凭据。它不能替代真实浏览器/DSH 部署验证。语法检查同样不证明依赖、网络或服务商协议可用。

GitHub Actions 配置会在 Windows/Linux 上执行锁定依赖安装、离线测试、语法检查和打包。远端 CI 结果应以实际运行记录为准，本地验证记录见 [VALIDATION.md](VALIDATION.md)。

## 许可与署名

MIT。聚合自四个上游项目（见 [NOTICE.md](NOTICE.md)）：
`@goodandready/dsh-subscriptions` · `dsh-connect` · `dsh-plugin-subscriptions` · `opencode2dsh`。
