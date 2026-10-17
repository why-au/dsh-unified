# 替换清单：从 dsh-unified-channels 换到 @dsh-unified/dsh-plugin

本清单依据 2026-10-17 在**隔离副本**上完成的替换演练编写，已核实你当前 desktop 的实际状态。

> 演练已在副本上完整跑通：移除旧 bundle → 装入本插件 → 启动 → 原凭据直接生效（账号 `留恋`、18 个模型、额度 1018/1100）。

---

## 一、替换前：先知道会失去什么

### 需要重新登录的（重要）

| 渠道 | 现状 | 替换后 |
|------|------|--------|
| **订阅渠道**（Codex / Claude / Grok …） | 旧插件凭据存在 `$DSH_HOME/plugins/subscriptions/auth.json`（实测只有 1 个 `codex`） | **本插件不读该文件，需要重新登录** |
| **Trae** | 无 `connect-auth/`，无有效快照 | 需重新配置 |
| **Qoder** | 无 `connect-auth/` | 需重新配置 |
| **WorkBuddy** | `.workbuddy1-auth.json`（实测账号 `留恋`） | **无需重登，直接生效** ✅ |
| **Zen（匿名）** | — | 无需登录 ✅ |

### 不需要担心的

- `$DSH_HOME/plugins/subscriptions/{models,proxy}.json` 是缓存与代理配置，不是凭据。
- 你的 desktop 补丁（`cordis.patch.yml`）**没有**任何指向旧插件条目 id 的覆盖项，无需迁移。

---

## 二、备份（必做）

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = "D:\work\plugin\backup-desktop-$stamp"
New-Item -ItemType Directory -Path $bk -Force | Out-Null

# profile 配置（不含 node_modules）
Copy-Item 'D:\why\Cache\.dsh\profiles\desktop\package.json' $bk
Copy-Item 'D:\why\Cache\.dsh\profiles\desktop\cordis.patch.yml' $bk
Copy-Item 'D:\why\Cache\.dsh\profiles\desktop\cordis.yml' $bk -ErrorAction SilentlyContinue

# 渠道状态与凭据
Get-ChildItem 'D:\why\Cache\.dsh' -Force -File |
  Where-Object { $_.Name -match '^\.(workbuddy|trae|qoder)' } |
  Copy-Item -Destination $bk

# 旧订阅凭据（含 login 信息，注意保管）
Copy-Item 'D:\why\Cache\.dsh\plugins\subscriptions' $bk -Recurse -ErrorAction SilentlyContinue
```

> 早前演练前已生成一份备份：`backup-desktop-20261017-013414`。可保留作为第二份。

**备份含敏感信息**：`plugins/subscriptions/auth.json` 与 `.workbuddy1-auth.json` 是明文凭据。备份目录不要放进版本库、云同步盘或共享位置；确认替换成功后再决定是否删除。

---

## 三、停止 desktop（必做）

替换时 desktop **必须在停止状态**，否则文件占用会导致安装失败。

1. 关闭 DeepSeek Harness 桌面窗口。
2. 确认没有残留进程：

```powershell
Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'" |
  Where-Object { $_.CommandLine -notmatch '--profile (web|drill|unified)' } |
  Select-Object ProcessId
```

> 上面只列出**桌面宿主**进程；若仍有输出，说明桌面端还在跑。

---

## 四、执行替换

```powershell
# 1) 移除旧聚合 bundle（会自动从 dsh.profile.bundles 注销）
dsh plugin --profile desktop remove dsh-unified-channels

# 2) 装入本插件（按你的实际产物路径）
dsh plugin --profile desktop add D:\work\plugin\dsh-unified-dsh-plugin-0.1.7.tgz

# 3) 核对：应只剩 id: dsh-unified，不再有四个上游条目
dsh --profile desktop --dump-config | Select-String 'dsh-unified|dsh-connect|llm-subscriptions|opencode2dsh'
```

期望输出只有：

```
- id: dsh-unified
  name: '@dsh-unified/dsh-plugin'
```

---

## 五、启动后逐项验收

启动桌面端，然后：

### 1. 面板出现
左侧栏底部应出现「渠道中心」入口；插件页应有本插件卡片与配置页。

### 2. WorkBuddy 直接可用（关键验证点）
渠道中心应显示 `workbuddy1`：**已登录、账号 `留恋`、18 个模型、额度约 1018/1100**。

若显示 `unavailable: fetch failed` → 说明 provider 未注册，见下方「排错」。

### 3. 订阅用量条（0.1.6 新增，需验收）

订阅配置页「输入框额度指示器」默认选择「当前订阅 · 多窗口与重置倒计时」。重新登录订阅后，选中该订阅模型，输入框下方统计行应显示订阅名称、已用百分比、可用的重置倒计时。也可改为「全部订阅」，在使用 WorkBuddy 等模型时继续查看所有订阅。点击徽标展开账号与采样时间；无额度数据应显示「额度未知」。这部分已通过离线组件和数据测试，尚未在你的 desktop 中安装/视觉验收。

### 4. 模型选择器
Model 选择器中应能看到 WorkBuddy 的模型；本插件不改变宿主模型选择器位置。

### 5. 重新登录订阅渠道
在插件配置页登录 Codex / Claude / 等（**这是预期内的重登**，不是故障）。

### 6. 确认旧入口已消失
- 旧插件的设置卡片/路由不再出现；
- 访问 `/dsh-subscriptions/health` 仍可用（本插件沿用该命名空间作兼容）。

---

## 六、排错

| 现象 | 原因 | 处理 |
|------|------|------|
| 所有渠道显示 `unavailable: fetch failed` | 面板连错端口（已在 0.1.5 修复）或 provider 未注册 | 确认用的是 **≥0.1.5**；查启动日志有无 `channel apply failed` |
| WorkBuddy 显示未登录 | 凭据文件在 `$DSH_HOME` 但被移动/删除 | 确认 `D:\why\Cache\.dsh\workbuddy1-auth.json` 存在 |
| 面板完全不出现 | profile 未加载本插件 | `--dump-config` 确认 `id: dsh-unified` 存在 |
| 插件装不上 | 版本检查或 desktop 仍在运行 | 先停桌面端；`dsh plugin --profile desktop list` 看当前已装包 |
| 想退回 | — | 见下 |

---

## 七、回退

```powershell
dsh plugin --profile desktop remove '@dsh-unified/dsh-plugin'
dsh plugin --profile desktop add 'D:\why\Cache\.dsh\local-packages\dsh-unified-channels-0.1.0-opencode.4.tgz'
```

再把备份里的 `package.json` / `cordis.patch.yml` 覆盖回去，重启桌面端。

> 旧插件的凭据文件（`plugins/subscriptions/auth.json`、`.workbuddy1-auth.json`）**本插件不会删除**，回退后仍可用。

---

## 八、本次未验证的部分

- **没有向真实上游发过推理请求**：演练证明了凭据可读、provider 注册成功、模型目录加载（18 个），但未实际发 prompt 验证补全。
- **没有浏览器视觉验收**：无浏览器自动化工具，布局观感需你亲自看。
- **未触发 token 刷新**：演练时凭据有效期到 2026-11（刷新阈值 5 分钟），故未发生刷新，未轮换你账号的 token。
