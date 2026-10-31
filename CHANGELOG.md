# Changelog

本项目的所有重要变更都记录在这里。版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

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
