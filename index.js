import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export const name = 'dev-assistant';
export const inject = ['tools', 'workingDirectory'];

const TYPES = ['preset', 'convention', 'goal', 'preference'];
const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const text = (value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];

function lines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}
function append(dir, file, record) {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, file), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return record;
}
function safeRoot(ctx, config, exec) {
  const session = exec?.agent?.id;
  const cwd = config.projectRoot || ctx.workingDirectory?.get?.(session) || process.cwd();
  return resolve(cwd);
}
function storeFor(ctx, config, exec) {
  const root = safeRoot(ctx, config, exec);
  const dir = resolve(config.dataRoot || join(root, '.dsh-dev'));
  mkdirSync(dir, { recursive: true });
  return { root, dir, projectId: `project_${createHash('sha256').update(root).digest('hex').slice(0, 10)}` };
}
function recordTool(name, description, parameters, execute) {
  return { name, description, parameters, output: { schema: { type: 'object' }, render: (_args, value) => text(value) }, execute };
}
function allRecords(ctx, config, exec, file) { return lines(join(storeFor(ctx, config, exec).dir, file)); }
function latest(records, key) { const map = new Map(); for (const r of records) map.set(r[key], r); return [...map.values()]; }

export function defineDevTools(ctx, config = {}) {
  const project = (exec) => storeFor(ctx, config, exec);
  return [
    recordTool('dev_context_get', '读取当前项目的目标、研发规范、用户偏好、未完成任务与最近反馈；返回有界摘要，不执行写入。', {
      type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false,
    }, async (args, exec) => {
      const p = project(exec); const limit = args?.limit ?? 10;
      const knowledge = latest(allRecords(ctx, config, exec, 'knowledge.jsonl'), 'knowledgeId').filter((x) => x.status === 'active' || x.status === 'proposed');
      const tasks = latest(allRecords(ctx, config, exec, 'tasks.jsonl'), 'taskId').filter((x) => !['succeeded', 'cancelled'].includes(x.status));
      const feedback = allRecords(ctx, config, exec, 'feedback.jsonl').slice(-limit);
      return { id: p.projectId, status: 'succeeded', projectId: p.projectId, context: { root: basename(p.root), knowledge: knowledge.slice(-limit), tasks: tasks.slice(-limit), feedback }, refs: { dataRoot: p.dir }, text: `项目 ${p.projectId}：${tasks.length} 个未完成任务，${knowledge.length} 条可引用知识。` };
    }),
    recordTool('dev_request_capture', '登记用户需求，保留原话；缺少验收条件时状态为 clarifying，不自动开工。', {
      type: 'object', required: ['rawQuote'], properties: { rawQuote: { type: 'string' }, normalized: { type: 'string' }, acceptance: { type: 'array', items: { type: 'string' } }, scope: { type: 'string' }, priority: { type: 'string' } }, additionalProperties: false,
    }, async (args, exec) => { const p = project(exec); const r = append(p.dir, 'requests.jsonl', { schemaVersion: 1, requestId: id('req'), projectId: p.projectId, rawQuote: args.rawQuote, normalized: args.normalized ?? '', acceptance: args.acceptance ?? [], scope: args.scope ?? '', priority: args.priority ?? 'normal', sourceSessionId: exec?.agent?.id ?? null, status: args.acceptance?.length ? 'captured' : 'clarifying', createdAt: now() }); return { id: r.requestId, status: r.status, refs: { file: join(p.dir, 'requests.jsonl') }, text: `已登记需求 ${r.requestId}，状态 ${r.status}。` }; }),
    recordTool('dev_feedback_record', '追加记录用户反馈原话；不会自动修改代码或晋升长期知识。', {
      type: 'object', required: ['rawQuote'], properties: { rawQuote: { type: 'string' }, requestId: { type: 'string' }, taskId: { type: 'string' }, category: { type: 'string', enum: ['bug', 'quality', 'scope', 'preference', 'process'] }, decision: { type: 'string', enum: ['accept', 'reject', 'defer', 'needs-clarification'] }, evidenceRefs: { type: 'array', items: { type: 'string' } }, impact: { type: 'string' } }, additionalProperties: false,
    }, async (args, exec) => { const p = project(exec); const r = append(p.dir, 'feedback.jsonl', { schemaVersion: 1, feedbackId: id('fb'), projectId: p.projectId, ...args, actor: 'user', createdAt: now() }); return { id: r.feedbackId, status: 'recorded', refs: { file: join(p.dir, 'feedback.jsonl') }, text: `已记录反馈 ${r.feedbackId}。` }; }),
    recordTool('dev_task_plan', '创建可执行研发任务，记录验收、依赖与风险；默认 queued，破坏性范围可标记 waiting-user。', {
      type: 'object', required: ['title', 'acceptance'], properties: { requestId: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string' }, acceptance: { type: 'array', items: { type: 'string' } }, steps: { type: 'array', items: { type: 'string' } }, dependsOn: { type: 'array', items: { type: 'string' } }, risk: { type: 'string' }, status: { type: 'string', enum: ['queued', 'waiting-user'] } }, additionalProperties: false,
    }, async (args, exec) => { const p = project(exec); const r = append(p.dir, 'tasks.jsonl', { schemaVersion: 1, taskId: id('task'), projectId: p.projectId, owner: 'agent', feedbackRefs: [], ...args, status: args.status ?? 'queued', createdAt: now(), changedRefs: [], verificationRefs: [] }); return { id: r.taskId, status: r.status, refs: { file: join(p.dir, 'tasks.jsonl') }, text: `已创建任务 ${r.taskId}：${r.title}` }; }),
    recordTool('dev_verify', '记录一次真实验证结果；调用方必须传入实际退出码，不接受伪造 succeeded。', {
      type: 'object', required: ['taskId', 'command', 'exitCode'], properties: { taskId: { type: 'string' }, command: { type: 'string' }, exitCode: { type: 'integer' }, result: { type: 'string' }, summary: { type: 'string' } }, additionalProperties: false,
    }, async (args, exec) => { const p = project(exec); const r = append(p.dir, 'verifications.jsonl', { schemaVersion: 1, verificationId: id('verify'), projectId: p.projectId, ...args, status: args.exitCode === 0 ? 'passed' : 'failed', createdAt: now() }); return { id: r.verificationId, status: r.status, refs: { file: join(p.dir, 'verifications.jsonl') }, text: `验证 ${r.status}：${args.command}` }; }),
    recordTool('dev_complete', '基于真实任务与验证记录生成完成总结；没有通过验证时只能 partial 或 blocked。', {
      type: 'object', required: ['taskId', 'summary'], properties: { taskId: { type: 'string' }, summary: { type: 'string' }, changedFiles: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } }, unresolved: { type: 'array', items: { type: 'string' } }, nextSteps: { type: 'array', items: { type: 'string' } }, userAck: { type: 'boolean' } }, additionalProperties: false,
    }, async (args, exec) => { const p = project(exec); const checks = allRecords(ctx, config, exec, 'verifications.jsonl').filter((x) => x.taskId === args.taskId); const status = checks.length && checks.every((x) => x.exitCode === 0) ? (args.userAck ? 'succeeded' : 'waiting-user') : 'partial'; const r = append(p.dir, 'completions.jsonl', { schemaVersion: 1, completionId: id('completion'), projectId: p.projectId, ...args, status, verificationRefs: checks.map((x) => x.verificationId), createdAt: now() }); return { id: r.completionId, status, refs: { file: join(p.dir, 'completions.jsonl') }, text: `完成总结 ${r.completionId}：${status}` }; }),
    recordTool('dev_knowledge_promote', '在用户明确确认后，将带来源的目标、规范或偏好追加为可撤销知识；默认 proposed。', {
      type: 'object', required: ['type', 'content', 'sourceRefs'], properties: { type: { type: 'string', enum: TYPES }, content: { type: 'string' }, scope: { type: 'string', enum: ['user', 'project', 'repo'] }, sourceRefs: { type: 'array', items: { type: 'string' } }, confirmed: { type: 'boolean' }, expiresAt: { type: 'string' } }, additionalProperties: false,
    }, async (args, exec) => { const p = project(exec); const status = args.confirmed ? 'active' : 'proposed'; const r = append(p.dir, 'knowledge.jsonl', { schemaVersion: 1, knowledgeId: id('know'), projectId: p.projectId, ...args, status, version: 1, approvedBy: args.confirmed ? 'user' : null, validFrom: now(), createdAt: now() }); return { id: r.knowledgeId, status, refs: { file: join(p.dir, 'knowledge.jsonl') }, text: `知识候选 ${r.knowledgeId}：${status}` }; }),
  ];
}

export function apply(ctx, rawConfig = {}) {
  const config = rawConfig ?? {};
  if (!config.tools) return;
  const runtime = ctx.get('tools');
  if (!runtime?.register) return;
  const disposers = defineDevTools(ctx, config).map((tool) => runtime.register(tool));
  ctx.on?.('dispose', () => disposers.forEach((dispose) => dispose?.()));
}
