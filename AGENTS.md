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
| `cordis.patch.yml` | preset「研发助手 · Dev Assistant」的 patch：工具行 + persona + pre-step 提醒注入 |
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

## 硬性约定（smoke 会抓的）

1. **`package.json` 的 `files` 白名单**：新增要随包发布的文件必须加进去，否则 tarball 缺文件。
   `AGENTS.md`、`docs/`、`verify/` 不进包——这是有意的，别加。
2. **版本三件套必须同步**：改版本号时，`package.json.version`、`CHANGELOG.md` 的 `## [x.y.z]` 小节、
   README 中的版本号（兼容性一节）三处一致，smoke 逐项校验。
3. **client 契约**：`dsh.client.platform` 必须是 `web`，`./client` 必须导出 `client.js`，二者缺一不可。
4. **preset patch 必须保留这些行**：`dsh-tool-bash`、`dsh-tool-pwsh`、`dsh-tool-fs`、
   `dsh-agent-inject` 相关行与 `id: dev-assistant`——Web shell 禁用了 host 工具行，
   preset 不能执行命令就永远满足不了 `dev_verify` 的契约。
5. **icon 契约**：`pkg.icon === 'assets/icon.svg'` 且 `assets/icon.svg` 在 `files` 里。

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
