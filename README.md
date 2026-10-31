# DSH Dev Workflow

<p align="center">
  <img src="assets/icon.svg" width="96" height="96" alt="DSH Dev Workflow icon">
</p>

<h1 align="center">DSH Dev Workflow</h1>

<p align="center">
  <strong>把研发对话变成可验证、可交接、可复盘的闭环。</strong><br>
  Request → Feedback → Task → Verify → Completion
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-plugin-dev-workflow"><img src="https://img.shields.io/npm/v/dsh-plugin-dev-workflow?color=0ea5e9&label=npm" alt="npm version"></a>
  <a href="https://github.com/yuna78/dsh-plugin-dev-workflow/actions"><img src="https://img.shields.io/github/actions/workflow/status/yuna78/dsh-plugin-dev-workflow/ci.yml?label=CI" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-22c55e" alt="MIT license"></a>
</p>

> 一个面向 DSH 的轻量研发交付助手。它记录决策与证据，但不会把普通聊天自动变成长期记忆。

## 为什么用它？

AI coding 很快，交付却常常缺少上下文：需求散落在聊天里、反馈没有原话、任务没有验收、测试结果无法追溯。

DSH Dev Workflow 提供一条明确的证据链：

| 阶段 | 记录什么 | 结果 |
| --- | --- | --- |
| **Request** | 用户原话、范围、验收标准 | 不再“凭感觉开工” |
| **Feedback** | 原始反馈、决策、影响 | 变化可追踪 |
| **Task** | 最小任务、依赖、风险 | 工作可交接 |
| **Verify** | 实际命令、退出码、结果 | 不用“应该通过”冒充证据 |
| **Completion** | 变更、验证、风险、下一步 | 收口可审计 |

## 安装

### DSH Add plugin

在 DSH 的 **Add plugin** 中搜索：

```text
dsh-plugin-dev-workflow
```

### Plugin manager

```text
plugin_manager install_bundle target=dsh-plugin-dev-workflow
```

### 本地开发

```text
plugin_manager install_bundle target=<本目录绝对路径>
```

安装后新建会话，选择 **研发助手 · Dev Assistant**。不要手写 profile 的 `package.json` 或 `cordis.patch.yml`。

## 工具箱

- `dev_context_get` — 读取项目上下文、未完成任务与最近反馈
- `dev_request_capture` — 保留用户原话并登记验收条件
- `dev_feedback_record` — 记录反馈与决策，不自动升级为长期规范
- `dev_task_plan` — 创建带依赖、风险和验收条件的任务
- `dev_verify` — 记录验证命令与真实退出码
- `dev_complete` — 生成带证据的完成总结
- `dev_knowledge_promote` — 仅在用户明确确认后沉淀知识

## 兼容性

- DSH：`>=0.2.1-rc.2 <0.3.0`
- Node.js：`>=22.19.0`
- 当前版本：`0.1.0`

## 数据与隐私边界

默认在当前项目写入 `.dsh-dev/`，使用 append-only JSONL 保存：

```text
requests.jsonl       feedback.jsonl       tasks.jsonl
verifications.jsonl  completions.jsonl    knowledge.jsonl
```

这些记录可能包含用户原话、任务描述、命令、文件名和项目上下文。它们只保存在本地，本插件不会上传数据；请勿写入密钥、客户资料或其他敏感信息，并确保 `.dsh-dev/` 不提交到 Git。

本 MVP 不提供任意 shell、自动提交、依赖安装或任意跨项目读取。验证工具只记录调用方传入的退出码；没有通过验证的总结不会标记为 `succeeded`。

## 开发

```bash
node verify/smoke.mjs
node --check index.js
npm pack --dry-run
```

## 路线图

- [ ] 真实宿主执行器与验证证据绑定
- [ ] 完成任务自动更新状态
- [ ] 路径边界校验与敏感信息检测
- [ ] 干净 profile 安装测试与 CI

## 项目链接

- Repository: https://github.com/yuna78/dsh-plugin-dev-workflow
- Issues: https://github.com/yuna78/dsh-plugin-dev-workflow/issues
- npm: https://www.npmjs.com/package/dsh-plugin-dev-workflow

## License

[MIT](LICENSE)
