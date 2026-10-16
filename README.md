# dsh-unified

**聚合 20+ AI 平台的统一 DSH（DeepSeek Harness）插件** —— 一个插件搞定所有模型渠道：国际订阅、中文大模型、国产 IDE 渠道、免费匿名通道，标配多账号轮换池、统一签到面板、零泄露 OAuth。

> 由四个开源 DSH 插件聚合而来（详见 [NOTICE.md](NOTICE.md)，均为 MIT 许可）

## ✨ 功能

| 能力 | 说明 |
|------|------|
| **20+ 平台聚合** | 一个插件接入所有模型渠道，模型选择器统一选 |
| **多账号轮换池** | 429/额度耗尽自动切号（SWITCH_CODES + 家族级冷却 + warmup 探针自愈）|
| **统一签到面板** | 一屏看所有渠道状态/额度/签到，一键领完所有每日奖励 |
| **零泄露认证** | OAuth PKCE，token 只进 DSH 凭据库，白名单代理防 SSRF |
| **免费匿名通道** | OpenCode Zen 免登录免 key（CLI 伪装层端到端实测通过）|
| **额度预测** | burn rate / pacing risk，提前切号避免撞限 |

## 📦 平台清单

**订阅类（OAuth PKCE 登录，免 API key）**
- ChatGPT（Codex Responses 协议）· Claude（Pro/Max）· Grok（X Premium）· GitHub Copilot（device flow）· Google Antigravity

**中文大模型（API key，OpenAI 兼容）**
- 通义 Qwen · 文心 ERNIE · 智谱 GLM · 月之暗面 Kimi · 讯飞 Spark

**免费匿名**
- OpenCode Zen（big-pickle / mimo-v2.6-flash-free / nemotron-3.5-lightning-free，每日实测验证）

**国产 IDE 渠道（扫码登录 + 回环 shim + 每日签到）**
- WorkBuddy（个人×2 / 企业版）· Trae · Qoder CN

**其他订阅**
- Cursor · JetBrains · Cody · Kiro · Perplexity · Replit

## 🚀 安装

```bash
# 从 npm（发布后）
dsh plugin --profile web add @dsh-unified/dsh-plugin

# 或从源码打包
git clone https://github.com/why-au/dsh-unified
cd dsh-unified
pnpm install
pnpm pack
dsh plugin --profile web add ./dsh-unified-dsh-plugin-<version>.tgz
```

安装后在 DSH 中：
1. **Settings → Subscriptions**：OAuth 登录各订阅平台
2. **左侧栏「渠道中心」**：查看所有渠道状态、一键签到
3. **模型选择器**：所有平台的模型统一选择

## 🏗️ 架构

```
dsh-unified（Cordis 插件）
│
├── lib/vendors/         ← 17 内置 vendor（统一接口：id/listModels/usage/streamOnce）
│    codex claude grok copilot antigravity qwen ernie glm kimi spark
│    cursor jetbrains cody kiro perplexity replit + zen（匿名）
│
├── lib/channels/        ← 国产 IDE 渠道（独立 provider 插件）
│    workbuddy/ trae/ qoder/
│
├── lib/core/            ← 底座引擎
│    rotate（轮换池）· quarantine（冷却状态机）· forecast（额度预测）
│    cascade（级联回退）· oauth/jwt/crypto（认证）· subscriptions（白名单服务）
│
├── lib/panel.js         ← 统一面板（状态/签到/模型筛选聚合，HTTP 扇出）
└── lib/index.js         ← 编排入口（apply：底座 + 三渠道 + 面板，全部隔离 try/catch）
```

## 🔧 开发

```bash
pnpm install
node test/zen-smoke.mjs      # zen 匿名通道端到端测试（无需任何 key）
node --check lib/*.js        # 语法检查
```

## 📋 开发进度

- [x] 骨架 + 依赖树（0.1.7-rc.2 系列）
- [x] zen 匿名通道（端到端实测）
- [x] connect 三渠道移植（workbuddy/trae/qoder）
- [x] 统一面板（状态/签到聚合）
- [x] vendor 额度状态（usage 接入面板）
- [x] README + npm 打包
- [ ] 真机 DSH 部署验证
- [ ] npm 发布

## 📄 许可与署名

MIT。聚合自四个上游项目（详见 [NOTICE.md](NOTICE.md)）：
`@goodandready/dsh-subscriptions` · `dsh-connect` · `dsh-plugin-subscriptions` · `opencode2dsh`