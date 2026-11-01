import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { defineDevTools, installReminder, renderReminder } from '../index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const required = ['index.js', 'cordis.patch.yml', 'README.md', 'CHANGELOG.md', 'LICENSE', 'assets/icon.svg'];
for (const file of required) {
  if (!existsSync(join(root, file))) throw new Error(`missing required file: ${file}`);
}
if (pkg.name !== 'dsh-plugin-dev-workflow') throw new Error(`unexpected package name: ${pkg.name}`);
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('invalid dsh.bundle.patch');
if (pkg.icon !== 'assets/icon.svg') throw new Error('icon must be declared');
if (!pkg.files?.includes('assets/icon.svg')) throw new Error('icon must be included in files');
if (!pkg.files?.includes('CHANGELOG.md')) throw new Error('CHANGELOG.md must ship in the package');
// Release notes and docs must name the published version, or consumers retag wrongly.
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
if (!readme.includes(pkg.version)) throw new Error(`README.md does not mention version ${pkg.version}`);
if (!changelog.includes(`## [${pkg.version}]`)) throw new Error(`CHANGELOG.md has no section for ${pkg.version}`);
const check = spawnSync(process.execPath, ['--check', join(root, 'index.js')], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status ?? 1);

// --- preset composition: the web shell disables host-plane tool rows, so a
// preset that cannot run commands can never satisfy dev_verify's contract.
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
for (const row of ['dsh-plugin-dev-workflow', 'dsh-tool-bash', 'dsh-tool-pwsh', 'dsh-tool-fs', 'dsh-agent-instructions']) {
  if (!patch.includes(row)) throw new Error(`preset is missing required row: ${row}`);
}
if (!patch.includes('id: dev-assistant')) throw new Error('preset id dev-assistant missing');

// --- behaviour: tools must run against a real host-shaped execution context ---
const dir = mkdtempSync(join(tmpdir(), 'dsh-dev-smoke-'));
try {
  // Mimic @deepseek-ai/dsh-session-projection: stateOf(session) reads the live
  // Session object. Passing a string id is exactly the regression this guards.
  const session = { header: { cwd: dir }, snapshotEvents() { return []; } };
  const ctx = {
    workingDirectory: {
      get(candidate) {
        if (typeof candidate?.snapshotEvents !== 'function') {
          throw new TypeError('session.snapshotEvents is not a function');
        }
        return candidate.header.cwd;
      },
    },
  };
  const exec = { agent: { id: 'session-smoke', session } };
  const tools = new Map(defineDevTools(ctx).map((tool) => [tool.name, tool]));
  for (const name of ['dev_context_get', 'dev_request_capture', 'dev_feedback_record', 'dev_task_plan', 'dev_verify', 'dev_complete', 'dev_knowledge_promote']) {
    if (!tools.has(name)) throw new Error(`missing tool: ${name}`);
  }

  const request = await tools.get('dev_request_capture').execute(
    { rawQuote: '把登录页的错误提示改得更清楚', acceptance: ['空密码显示字段级提示'] },
    exec,
  );
  if (request.status !== 'captured') throw new Error(`request not captured: ${request.status}`);

  const feedback = await tools.get('dev_feedback_record').execute(
    { rawQuote: '文案要短一些', requestId: request.id, category: 'quality', decision: 'accept' },
    exec,
  );
  if (feedback.status !== 'recorded') throw new Error(`feedback not recorded: ${feedback.status}`);

  const task = await tools.get('dev_task_plan').execute(
    { requestId: request.id, title: '更新登录错误提示', acceptance: ['单元测试覆盖两种错误分支'] },
    exec,
  );
  if (task.status !== 'queued') throw new Error(`task not queued: ${task.status}`);

  const verify = await tools.get('dev_verify').execute(
    { taskId: task.id, command: 'npm test -- smoke', exitCode: 0, summary: 'all green' },
    exec,
  );
  if (verify.status !== 'passed') throw new Error(`verification not passed: ${verify.status}`);

  const complete = await tools.get('dev_complete').execute({ taskId: task.id, summary: '登录错误提示已更新' }, exec);
  if (complete.status !== 'waiting-user') throw new Error(`completion should await user ack: ${complete.status}`);

  const context = await tools.get('dev_context_get').execute({}, exec);
  if (context.context.tasks.length !== 1) throw new Error('context did not report the task');
  if (context.context.feedback.length !== 1) throw new Error('context did not report the feedback');

  // --- runtime reminder: the persona paragraph is one line at the top of a
  // long context. A real session proved it is not enough (dev_context_get at
  // +1s, dev_request_capture only at +86s), so the reminder must ride in the
  // request history — and it must carry the counts it claims.
  if (!/^\s*reminder:\s*true$/m.test(patch)) throw new Error('preset must enable the runtime reminder');
  if (!/^\s*reminderEverySteps:\s*5$/m.test(patch)) throw new Error('preset must declare reminderEverySteps');
  for (const directive of ['dev_request_capture', 'dev_feedback_record', '前 2 次工具调用内必须']) {
    if (!patch.includes(directive)) throw new Error(`persona is missing the ordering directive: ${directive}`);
  }

  const listeners = [];
  installReminder({ on(event, listener) { listeners.push({ event, listener }); return () => listeners.pop(); } }, { reminderEverySteps: 5 });
  if (listeners.length !== 1) throw new Error('reminder must register exactly one pre-step listener');
  if (listeners[0].event !== 'agent/pre-step') throw new Error(`reminder hooked ${listeners[0].event}`);
  const preStep = listeners[0].listener;
  const turnStep = (step) => preStep({ agent: { session: { header: { cwd: dir } } }, step }, async () => ({ kind: 'continue', messages: [] }));

  const firstStep = await turnStep(1);
  if (firstStep.messages.length !== 1) throw new Error('reminder missing on step 1');
  const injected = firstStep.messages[0];
  if (injected.role !== 'user') throw new Error(`reminder must be a user-role message, got ${injected.role}`);
  const injectedText = injected.content[0].text;
  for (const needle of ['运行期提醒', '需求 1', '反馈 1', '任务 1', 'dev_verify', '不得写成记录']) {
    if (!injectedText.includes(needle)) throw new Error(`reminder text is missing ${needle}`);
  }
  if (injected.source?.kind !== 'dev-assistant') throw new Error('reminder must attribute its source');

  if ((await turnStep(3)).messages.length !== 0) throw new Error('reminder must be throttled between reminder steps');
  if ((await turnStep(6)).messages.length !== 1) throw new Error('reminder must repeat at the configured interval');

  const rejected = await preStep({ agent: { session: { header: { cwd: dir } } }, step: 1 }, async () => ({ kind: 'reject' }));
  if (rejected.kind !== 'reject') throw new Error('reminder must not disturb a rejecting pre-step');

  if (!renderReminder({ requests: 0, tasks: 0, feedback: 0, verifications: 0, completions: 0 }).includes('任务数为 0 时不要先写代码')) {
    throw new Error('reminder must warn when no task exists');
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`smoke passed: ${pkg.name}@${pkg.version}`);
