# Changelog

本项目的所有重要变更都记录在这里。版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.2.0] · 2026-11-01

### 新增

- **研发看板（Web）**：左侧边栏「研发看板」打开一个 main 面板，把 `.dsh-dev/` 的记录排成
  四列——需求 / 待办 / 待确认 / 已完成，并可按 **进行中 / 已完成 / 全部** 过滤；计数与列表
  同源。工作区下拉可切换项目。
- **只读 host 路由** `GET /api/dsh-dev-assistant.board?root=<绝对路径>`：校验 `root` 是真实
  目录后，只读取 `<root>/.dsh-dev/` 下的 requests / tasks / feedback / verifications /
  completions；非绝对路径、不存在、指向文件一律 400；响应 `cache-control: no-store`。
- **状态推导**：任务「已完成」= 自身 `succeeded/cancelled`，或在 `completions.jsonl` 里有收口
  记录（`dev_complete` 从不回写 tasks.jsonl）。
- **视觉**：编辑式排版——发丝分隔线、无卡片边框与阴影、无彩色强调条；配色改用 shell 的
  ui-theme 设计变量（浅色回退），跟随应用浅/深主题。卡片上的范围/风险字段加了标签前缀，
  标题栏只显示项目 id 与工作区目录名（完整路径进 tooltip）。
- **离线预览 harness**：`npm run preview` 用 `readBoard()` 的真实数据 + client 的同一套
  `collect()` / `columnNode()` / CSS 渲染，再用本机 Chrome 截图到 `docs/preview-board.png`。

### 打包

- `package.json` 增加 `dsh.client`（platform web）与 `exports["./client"]`，`client.js` 进 files。

### 验证

- `node verify/smoke.mjs`：新增看板用例（readBoard 计数与 closed 推导、路由 200 / 400×3、
  client 经 module-loader 包装加载、三种过滤的列数与计数一致性、空态、卡片节点类型）。
- `node verify/preview.mjs`：真实记录渲染出图（2 需求 / 5 任务）。

## [0.1.1] · 2026-11-01

### 修复

- **persona 只在长回合开头起作用**：真机会话里 `dev_context_get` 在第 1 秒就调用了，
  但 `dev_request_capture` 拖到第 86 秒、第 40 次工具调用之后才发生，`dev_feedback_record`
  整轮没触发。persona 是上下文开头的一段话，回合越长越容易被工具结果挤出注意力。
  现在插件通过 `agent/pre-step` 在**第 1 步以及之后每 5 步**往请求历史追加一条
  运行期提醒（`reminder: true` / `reminderEverySteps: 5`），带真实记录计数与执行顺序；
  提醒只读 `<project>/.dsh-dev/`，不写状态，异常时原样放行、不影响回合。
- **persona 加时序硬约束**：收到用户消息后的前 2 次工具调用内必须先登记
  （新需求 → `dev_request_capture`，对上一轮的反馈 → `dev_feedback_record`），
  任务数为 0 时不得先写业务文件。

### 验证

- `node verify/smoke.mjs`：新增运行期提醒用例（第 1 步注入、第 3 步被节流、第 6 步重复、
  reject 决策不受影响、计数与执行顺序文案齐全、source 归属为 `dev-assistant`）。
- `dsh --profile web --dump-config`：`dev-assistant-tools` 行带 `reminder: true` /
  `reminderEverySteps: 5` 正常组合进 profile。

### 打包

- `CHANGELOG.md` 进入 tarball：0.1.0 发布的包漏了这份文档（`files` 白名单早于该文件），
  0.1.1 起对齐。

## [0.1.0] · 2026-10-31

首个公开版本：把研发对话变成可验证、可交接的闭环
（Request → Feedback → Task → Verify → Completion）。

### 功能

- **研发助手 preset**（`dev-assistant`）：一段工作协议 persona + 7 个 `dev_*` 工具，
  在 DSH 新建会话时选择「研发助手 · Dev Assistant」即可使用。
- **7 个工具**：`dev_context_get`（有界上下文摘要）、`dev_request_capture`（保留用户原话与验收条件）、
  `dev_feedback_record`（记录反馈与决策）、`dev_task_plan`（任务 / 依赖 / 风险 / 验收）、
  `dev_verify`（真实命令 + 退出码）、`dev_complete`（带证据的完成总结）、
  `dev_knowledge_promote`（仅在用户明确确认后沉淀知识）。
- **项目隔离的 append-only 记录**：默认写入 `<project>/.dsh-dev/`，按 `projectId`
  （根目录路径哈希）隔离；记录只追加、不覆盖，便于审计与复盘。
- **状态机约束**：没有真实验证记录时 `dev_complete` 只能给出 `partial`，
  没有用户确认只能是 `waiting-user`；知识默认 `proposed`，确认后才 `active`。

### 修复

- **所有 `dev_*` 工具首次调用即失败**（`Error: session.snapshotEvents is not a function`）：
  `ctx.workingDirectory.get()` 需要活的 Session 对象，之前传入的是 `exec.agent.id`
  （SessionId 字符串）。改为传 `exec.agent.session`，并回退到 `session.header.cwd`。
- **preset 缺少 shell**：web 端把 host 层的 `tool-bash` / `tool-pwsh` / `tool-jobs`
  置为 disabled，改由 preset 自己声明。补上后 `dev_verify` 才能真正记录命令与退出码。
- 补 `agent-instructions`，让仓库规范（AGENTS.md / CLAUDE.md）按声明的上下文优先级真正加载。

### 验证

- `node verify/smoke.mjs` 全绿：在模拟真实宿主执行上下文的条件下跑通
  request → feedback → task → verify → complete → context，并断言 preset 组合
  （旧调用形态会让用例失败，防止回归）。
- 契约自检 `check-contract.mjs`：PASS 13 / WARN 1（纯服务插件无 `dsh.client`，符合预期）/ FAIL 0。
- `npm pack --dry-run`：7 files，仅包含 `files` 白名单内容。
