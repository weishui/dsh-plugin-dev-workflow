/**
 * 看板预览（`npm run preview`，可选步骤）。
 *
 * 目的：在没有浏览器会话、也不重启 dsh web 的前提下，用**线上那套东西**排一张图：
 *   - 数据：`readBoard()` 读本仓库真实的 `.dsh-dev/`（不是手写 mock）
 *   - 结构：`client.js` 的 `__board.columnNode()` / `collect()`（不是重画一遍）
 *   - 样式：`client.js` 的 `__board.CSS`（不是另写一份）
 * 只有顶栏是静态复刻（线上顶栏由 React 组件持有状态），CSV 类名与线上一致。
 *
 * 流程：生成 HTML → headless Chrome 截图 → 写入 docs/preview-board.png。
 * 依赖：node: 内置模块 + 本机 Chrome（PW_CHROME / DW_CHROME 可覆盖路径）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readBoard } from '../index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'preview-board.png');
const CHROME = process.env.DW_CHROME || process.env.PW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WIDTH = 1440;
const HEIGHT = 940;
const MIN_BYTES = 30 * 1024;

if (!existsSync(CHROME)) {
  console.error(`preview: Chrome not found at ${CHROME} (set DW_CHROME to override)`);
  process.exit(2);
}

// --- load the real client module through the shell's loader wrapper ----------
let registered = null;
const win = {
  localStorage: { getItem: () => null, setItem: () => {} },
  __ModuleLoader__: { load(definition) { registered = definition; } },
};
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useRef: (value) => ({ current: value }),
};
new Function('window', 'require', readFileSync(join(ROOT, 'client.js'), 'utf8'))(win, () => fakeReact);
if (!registered) throw new Error('client.js did not register with the module loader');
const view = registered.factory(() => fakeReact).__board;

// --- real records, real view model -----------------------------------------
const board = readBoard(ROOT);
if (board.counts.requests + board.counts.tasks === 0) {
  console.error(`preview: ${ROOT}.dsh-dev has no records yet — record something first`);
  process.exit(2);
}
const collected = view.collect(board, 'all');

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Render the element tree `columnNode()` returns, and nothing invented. */
function render(node) {
  if (node === null || node === undefined || node === false) return '';
  if (Array.isArray(node)) return node.map(render).join('');
  if (typeof node === 'string' || typeof node === 'number') return escape(node);
  const { type, props } = node;
  if (props?.dangerouslySetInnerHTML) return `<${type}>${props.dangerouslySetInnerHTML.__html}</${type}>`;
  const attributes = Object.entries(props ?? {})
    .filter(([name, value]) => name !== 'children' && value !== false && value !== null && value !== undefined && typeof value !== 'object')
    .map(([name, value]) => ` ${name === 'className' ? 'class' : name}="${escape(value)}"`)
    .join('');
  return `<${type}${attributes}>${render(props?.children ?? [])}</${type}>`;
}

const header = `
<div class="dw-bar">
  <span class="dw-title">研发看板</span>
  <span class="dw-sub">${escape(board.projectId)} · ${escape(board.root)}</span>
  <span class="dw-spacer"></span>
  <div class="dw-chips" role="tablist">
    <button type="button" class="dw-chip" data-on="0">进行中<b>${collected.counts.open}</b></button>
    <button type="button" class="dw-chip" data-on="0">已完成<b>${collected.counts.closed}</b></button>
    <button type="button" class="dw-chip" data-on="1">全部<b>${collected.counts.all}</b></button>
  </div>
  <select class="dw-select"><option>${escape(board.root.split('/').pop())}</option></select>
  <button type="button" class="dw-refresh">刷新</button>
</div>`;

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>研发看板预览</title>
<style>
html,body{margin:0;height:100%;background:#0f1319}
body{padding:0}
.dw-board{height:auto;min-height:${HEIGHT}px}
</style>
<style>${view.CSS}</style>
</head><body>
<div class="dw-board">${header}
<div class="dw-cols">${collected.columns.map((column) => render(view.columnNode(column))).join('')}</div>
</div>
</body></html>`;

const work = mkdtempSync(join(tmpdir(), 'dw-preview-'));
const page = join(work, 'board.html');
const profile = join(work, 'chrome-profile');
writeFileSync(page, html);
mkdirSync(join(ROOT, 'docs'), { recursive: true });

const shot = spawnSync(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=2',
  `--window-size=${WIDTH},${HEIGHT}`,
  `--user-data-dir=${profile}`,
  `--screenshot=${OUT}`,
  `file://${page}`,
], { stdio: 'inherit' });

const bytes = existsSync(OUT) ? statSync(OUT).size : 0;
rmSync(work, { recursive: true, force: true });
if (shot.status !== 0) {
  console.error(`preview: Chrome exited ${shot.status}`);
  process.exit(shot.status ?? 1);
}
if (bytes < MIN_BYTES) {
  console.error(`preview: screenshot is only ${bytes} bytes — page probably did not render`);
  process.exit(1);
}
console.log(`preview ok: ${OUT} (${(bytes / 1024).toFixed(0)} kB, ${board.counts.requests} 需求 / ${board.counts.tasks} 任务)`);
