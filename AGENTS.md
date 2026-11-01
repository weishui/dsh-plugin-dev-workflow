# AGENTS.md — dsh-plugin-dev-workflow

给 AI 编码代理（DSH / Claude Code / Codex 等）的项目工作指南。人也可以读。

## 这个项目是什么

DSH 插件：把研发对话变成「Request → Feedback → Task → Verify → Completion」的可验证闭环，
记录落在本项目 `<workspace>/.dsh-dev/` 的 append-only JSONL 里，并带一个只读 Web 看板。

- 包名：`dsh-plugin-dev-workflow`，已开源（GitHub `yuna78/dsh-plugin-dev-workflow`）并发布 npm。
- 运行环境：Node.js `>=22.19.0`，宿主 DSH `>=0.2.1-rc.2 <0.3.0`（peer）。
- 模块体系：纯 ESM（`"type": "module"`），**零运行时依赖**——不要引入 `dependencies`。

## 文件地图（改哪里）

| 文件 | 角色 |
| --- | --- |
| `index.js` | host 侧插件入口：`defineDevTools`（dev_* 工具）、`installReminder` / `renderReminder`（每 5 步的运行期提醒）、JSONL 存储层 |
| `client.js` | Web 看板客户端（`./client` 导出），只调一个 GET 路由，只读 |
| `index.js` 中的 `registerBoardRoute` / `readBoard` | 看板 host 侧：校验 `root` 是真实目录，只读已知 JSONL，host 只截断分页（已完成 30 / 需求 40 / 待办 20） |
| `cordis.patch.yml` | 两层挂载：顶层 `insert` 宿主级挂载本包本体（`dev-workflow-host`，tools/reminder 关、只读看板路由开）；preset「研发助手 · Dev Assistant」（`dev-assistant-tools` 等，随会话挂载） |
| `package.json` → `dsh.bundle` / `dsh.client` | 插件打包与 Web 客户端注入声明 |
| `verify/smoke.mjs` | 唯一门禁（`npm test`）：文件齐全、契约字段、行为测试、双文件 `node --check` |
| `verify/preview.mjs` | 用真实记录离线渲染 `docs/preview-board.png` |
| `assets/` | `icon.svg`（npm/市场）、`icon-180.png`（市场条目位图）、`workflow-infographic.svg`（README 头图） |
| `docs/log/` | 每次发版的记录：版本渠道、门禁结果、踩坑。发版时**新增一篇**，不改旧的 |
| `docs/preview-board.png` | README 引用的看板截图，布局改动后用 `verify/preview.mjs` 重新生成 |
| `.dsh-dev/` | 本项目自己吃狗粮产生的运行数据，**已在 .gitignore**，永远不要提交、不要手改其 JSONL 内容 |

## 常用命令

```bash
npm test                 # = node verify/smoke.mjs，收口前必须全绿
node --check index.js && node --check client.js   # 语法检查（smoke 内含）
npm pack --dry-run       # 发版前核对 tarball 内容与体积
node verify/preview.mjs  # 可选：重新渲染看板截图
```

## 调试（宿主侧）

- **看板入口没出现的排查顺序**：① 取宿主 index HTML，看 `__DSH_BOOT__` 的 entries 里
  有没有 `dsh-plugin-dev-workflow` 行——没有就是组合层排除（检查 `dev-workflow-host`
  挂载），而不是加载失败；② 有行再看 client bundle 与 board 路由。插件列表「无报错」
  不代表正常：组合跳过是静默的。
- **起探针实例**：CLI 禁止操作桌面 App 的 profile（`profile "desktop" is managed
  exclusively by the Electron application`）。用 `DSH_HOME=/tmp/dsh-home dsh
  --from-default-profile web --profile probe --dump-config` 复制模板、`dsh plugin
  --profile probe add <本仓库路径>` 装 link:、再 `DSH_HOME=/tmp/dsh-home dsh --profile
  probe --port <空闲端口>` 起实例，启动输出里拿带 token 的 URL 验证页面与路由。
  全程不碰用户正在跑的 App；用完杀进程。
- **npm 缓存 EPERM**（`~/.npm/_cacache` root-owned）：加 `--cache /tmp/npm-cache-probe`
  绕开，不要 sudo chown 用户的缓存。

## 硬性约定（smoke 会抓的）

1. **`package.json` 的 `files` 白名单**：新增要随包发布的文件必须加进去，否则 tarball 缺文件。
   `AGENTS.md`、`docs/`、`verify/` 不进包——这是有意的，别加。
2. **版本三件套必须同步**：改版本号时，`package.json.version`、`CHANGELOG.md` 的 `## [x.y.z]` 小节、
   README 中的版本号（兼容性一节）三处一致，smoke 逐项校验。
3. **client 契约**：`dsh.client.platform` 必须是 `web`，`./client` 必须导出 `client.js`，二者缺一不可。
4. **preset patch 必须保留这些行**（smoke 逐行断言）：`dsh-plugin-dev-workflow`、
   `dsh-tool-bash`、`dsh-tool-pwsh`、`dsh-tool-fs`、`dsh-agent-instructions` 与
   `id: dev-assistant`——Web shell 禁用了 host 工具行，preset 不能执行命令就永远
   满足不了 `dev_verify` 的契约。
5. **icon 契约**：`pkg.icon === 'assets/icon.svg'` 且 `assets/icon.svg` 在 `files` 里。
6. **宿主顶层挂载不可删**：`cordis.patch.yml` 顶层 `insert` 里的 `dev-workflow-host`
   （`name: 'dsh-plugin-dev-workflow'`）是看板 UI 进页面模块图的唯一通道。client 模块
   组合只认宿主树里「包名 + 活 fiber」的 loader 条目；本包只随 preset 挂载时宿主层
   没有 fiber，组合**静默跳过**——无报错、插件列表无异常、重启无效（0.2.3 之前正是
   这个坑，见 `docs/log/2026-11-01-0.2.3.md`）。smoke 目前只断言行存在，不校验挂载
   层级；删掉这一条不会红，但入口会消失。这条挂载还是 board 路由的**唯一所有者**：
   preset 内嵌挂载带 `board: false`，两边都开会被 connection 判「already registered」，
   后挂载的 fiber 激活失败（0.2.4 用户实报，0.2.5 修复）。

## 行为约定（smoke 之外，但同样硬）

- **记录是 append-only**：dev_* 工具只追加 JSONL，不回写、不改历史；看板只读，
  完成状态来自 `completions.jsonl`，`dev_complete` 从不改 `tasks.jsonl`。
- **不伪造证据**：没跑过的命令、没被用户确认的偏好，一律不得写成记录或文档。
- **不越权**：不做跨项目读取、不自动安装依赖、不自动 `git commit` / `npm publish`；
  发版由人工带 2FA OTP 执行（npm 是 `auth-and-writes`，CLI 写操作必须 `--otp`）。
- **敏感信息**：示例与测试数据必须脱敏；`.dsh-dev/` 内容不得出现在文档或提交里。
- **host 侧防御式编程**：`workingDirectory.get()` 需要活的 Session 对象
  （传 `exec.agent.id` 字符串会在投影缓存里炸），新工具拿 cwd 时沿用 `safeRoot()` 的写法。

## 提交与发版

- Conventional Commits，英文：`feat(board): …`、`fix(preset): …`、`docs: …`、`chore(release): …`；主分支 `main`。
- 改动用户可见行为时同步 `CHANGELOG.md`（Keep a Changelog 风格）。
- 发版完整 SOP（双仓、隐私扫描、tag + Release、npm --otp、awesome 收录、市场索引）见
  `dsh-plugin-open-source` skill 与 `docs/log/` 里最近一篇发版记录；发完必须新增一篇 log。
- README 的安装/看板说明是用户文档，功能改动要跟着更新，别让它落后于代码。

## 验证清单（收口前自查）

- [ ] `npm test` 全绿
- [ ] 新增的发布文件进了 `files` 白名单（或不该发布）
- [ ] 动了版本号 → CHANGELOG / README 同步
- [ ] 动了看板布局 → `verify/preview.mjs` 重出截图
- [ ] 没有把 `.dsh-dev/` 或密钥带进任何提交
