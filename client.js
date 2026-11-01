/**
 * Web half of `dsh-plugin-dev-workflow`.
 *
 * Why this exists: the records are append-only JSONL, which is fine for a
 * machine and useless for a person. This renders the same records as a board —
 * 需求 / 待办 / 待确认 / 已完成 — that can be switched between 进行中 / 已完成 /
 * 全部.
 *
 * It only ever reads: the host route is GET-only and serves `<root>/.dsh-dev`,
 * so nothing here can change a record, and a broken board can never take the
 * conversation (or the `dev_*` tools) down with it.
 *
 * Written in the host's module-loader format: no build step, `require('react')`
 * provided by the shell.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-dev-workflow',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const ENDPOINT = '/api/dsh-dev-assistant.board';
    const PANEL_ID = 'dev-workflow-board';
    const ROOT_KEY = 'dsh-dev-workflow.board.root';

    const FILTERS = [
      { id: 'open', label: '进行中' },
      { id: 'closed', label: '已完成' },
      { id: 'all', label: '全部' },
    ];

    const COLUMNS = [
      { id: 'requests', title: '需求', hint: '用户原话 + 验收条件', filter: 'open' },
      { id: 'queued', title: '待办', hint: '已建任务、还没开始', filter: 'open' },
      { id: 'waiting', title: '待确认', hint: '需要你点头才能继续（waiting-user）', filter: 'open' },
      { id: 'closed', title: '已完成', hint: '有收口记录', filter: 'closed' },
    ];

    const STATUS_LABEL = {
      queued: '待办',
      'waiting-user': '待确认',
      succeeded: '已完成',
      cancelled: '已取消',
    };

    const REQUEST_LABEL = {
      captured: '已登记',
      clarifying: '待补验收',
    };

    /** Which column one task belongs to. Closed wins over its own stored status. */
    function taskColumn(task) {
      if (task.closed) return 'closed';
      if (task.status === 'waiting-user') return 'waiting';
      return 'queued';
    }

    function shorten(text, limit) {
      const value = String(text ?? '').replace(/\s+/g, ' ').trim();
      return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
    }

    function shortTime(iso) {
      if (!iso) return '';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '';
      const pad = (value) => String(value).padStart(2, '0');
      return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    /**
     * Turn one host payload into column arrays plus counts for the active filter.
     * Pure on purpose: the preview harness and the smoke test render the exact
     * same view model the browser does.
     */
    function collect(board, filter) {
      const requests = Array.isArray(board?.requests) ? board.requests : [];
      const tasks = Array.isArray(board?.tasks) ? board.tasks : [];
      const columns = {
        requests: requests.map((request) => ({
          kind: 'request',
          id: request.id,
          title: shorten(request.rawQuote, 110),
          meta: `${(request.acceptance ?? []).length} 条验收 · ${REQUEST_LABEL[request.status] ?? request.status ?? '已登记'}`,
          note: request.scope ? shorten(request.scope, 60) : '',
          time: shortTime(request.createdAt),
        })),
        queued: [],
        waiting: [],
        closed: [],
      };
      for (const task of tasks) {
        columns[taskColumn(task)].push({
          kind: 'task',
          id: task.id,
          title: shorten(task.title, 90),
          // A task closed by a completion still carries `queued` in its own
          // record, so the label follows the column, not the stored status.
          meta: `${(task.acceptance ?? []).length} 条验收 · ${task.closed ? '已完成' : (STATUS_LABEL[task.status] ?? task.status ?? '待办')}`,
          note: task.risk ? shorten(task.risk, 60) : '',
          time: shortTime(task.createdAt),
        });
      }
      const visible = (column) => filter === 'all' || column.filter === filter;
      const visibleColumns = COLUMNS.filter((column) => visible(column))
        .map((column) => ({ ...column, items: columns[column.id] ?? [] }));
      const counts = {
        open: columns.requests.length + columns.queued.length + columns.waiting.length,
        closed: columns.closed.length,
        all: columns.requests.length + columns.queued.length + columns.waiting.length + columns.closed.length,
      };
      return { columns: visibleColumns, counts };
    }

    function cardNode(item) {
      return h('article', { className: 'dw-card', 'data-kind': item.kind, 'data-id': item.id },
        h('div', { className: 'dw-card-title' }, item.title || '（无标题）'),
        h('div', { className: 'dw-card-meta' }, item.meta),
        item.note ? h('div', { className: 'dw-card-note' }, item.note) : null,
        h('div', { className: 'dw-card-foot' },
          h('code', null, item.id),
          h('span', null, item.time)));
    }

    function columnNode(column) {
      return h('section', { className: 'dw-col', 'data-col': column.id },
        h('header', { className: 'dw-col-head' },
          h('span', { className: 'dw-col-title' }, column.title),
          h('span', { className: 'dw-col-count' }, String(column.items.length))),
        h('p', { className: 'dw-col-hint' }, column.hint),
        h('div', { className: 'dw-col-body' },
          column.items.length === 0
            ? h('div', { className: 'dw-empty' }, '这一列还没有记录')
            : column.items.map(cardNode)));
    }

    // Colours are the shell's own design tokens (ui-theme), so the board follows
    // the app's light/dark setting instead of pinning one. Every token carries a
    // light fallback so the offline preview — which has no shell CSS — still
    // renders the light palette rather than an unstyled page.
    const CSS = `
.dw-board{background:var(--dsw-alias-bg-base,#ffffff);color:var(--dsw-alias-label-primary,#1b1f26);
  font:13px/1.5 ui-sans-serif,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  height:100%;display:flex;flex-direction:column;min-height:0}
.dw-bar{display:flex;gap:10px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--dsw-alias-border-l2,#0000001a);flex-wrap:wrap}
.dw-title{font-size:15px;font-weight:650;letter-spacing:.2px}
.dw-sub{color:var(--dsw-alias-label-tertiary,#81858c);font-size:12px}
.dw-spacer{flex:1}
.dw-chips{display:flex;gap:4px;background:var(--dsw-static-neutral-bluish-60,#f5f6f7);border:1px solid var(--dsw-alias-border-l2,#0000001a);border-radius:8px;padding:3px}
.dw-chip{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#61666b);font:inherit;padding:5px 11px;border-radius:6px;cursor:pointer}
.dw-chip:hover{color:var(--dsw-alias-label-primary,#1b1f26)}
.dw-chip[data-on="1"]{background:var(--dsw-static-neutral-bluish-00,#ffffff);color:var(--dsw-alias-label-primary,#1b1f26);box-shadow:0 1px 2px #0000001f}
.dw-chip b{font-weight:650;margin-left:4px;opacity:.7}
.dw-select{background:var(--dsw-static-neutral-bluish-00,#ffffff);color:var(--dsw-alias-label-primary,#1b1f26);border:1px solid var(--dsw-alias-border-l2,#0000001a);border-radius:8px;padding:6px 9px;font:inherit;max-width:320px}
.dw-refresh{background:var(--dsw-static-neutral-bluish-00,#ffffff);color:var(--dsw-alias-label-primary,#1b1f26);border:1px solid var(--dsw-alias-border-l2,#0000001a);border-radius:8px;padding:6px 11px;font:inherit;cursor:pointer}
.dw-refresh:hover{border-color:var(--dsw-static-deepseek-400,#7aaaff);color:var(--dsw-static-deepseek-600,#4868b2)}
.dw-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;padding:14px 18px 20px;overflow:auto;flex:1;min-height:0;align-items:start}
.dw-col{background:var(--dsw-specific-tip,#f9fafb);border:1px solid var(--dsw-alias-border-l2,#0000001a);border-radius:12px;padding:12px;min-height:120px}
.dw-col-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dw-col-title{font-weight:650}
.dw-col-count{font-size:12px;color:var(--dsw-alias-label-tertiary,#81858c);background:var(--dsw-static-neutral-bluish-00,#ffffff);border:1px solid var(--dsw-alias-border-l2,#0000001a);border-radius:999px;padding:0 8px}
.dw-col-hint{margin:4px 0 10px;color:var(--dsw-alias-label-tertiary,#81858c);font-size:11.5px}
.dw-col-body{display:flex;flex-direction:column;gap:8px}
.dw-card{background:var(--dsw-static-neutral-bluish-00,#ffffff);border:1px solid var(--dsw-alias-border-l2,#0000001a);border-radius:9px;padding:10px 11px;box-shadow:0 1px 2px #0000000a}
.dw-card[data-kind="request"]{border-left:3px solid var(--dsw-static-blue-450,#4d93f8)}
.dw-card-title{font-weight:600;margin-bottom:4px;word-break:break-word}
.dw-card-meta{color:var(--dsw-alias-label-tertiary,#81858c);font-size:11.5px}
.dw-card-note{color:var(--dsw-alias-label-secondary,#61666b);font-size:11.5px;margin-top:3px}
.dw-card-foot{display:flex;justify-content:space-between;gap:8px;margin-top:7px;color:var(--dsw-alias-label-tertiary,#81858c);font-size:10.5px}
.dw-card-foot code{font-size:10.5px}
.dw-empty{color:var(--dsw-alias-label-tertiary,#81858c);font-size:12px;text-align:center;padding:16px 0}
.dw-state{color:var(--dsw-alias-label-secondary,#61666b);font-size:12.5px;padding:28px 20px;line-height:1.7}
.dw-state b{color:var(--dsw-alias-label-primary,#1b1f26)}
.dw-warn{color:var(--dsw-alias-state-error-primary,#ec1313)}
`;

    function useWorkspaceStore(store) {
      const [list, setList] = React.useState(() => store?.getSnapshot?.() ?? []);
      React.useEffect(() => {
        if (!store) return undefined;
        const read = () => setList(store.getSnapshot?.() ?? []);
        read();
        if (typeof store.subscribe === 'function') return store.subscribe(read);
        return undefined;
      }, [store]);
      return Array.isArray(list) ? list : [];
    }

    function Board(props) {
      const workspaces = useWorkspaceStore(props?.workspaceStore);
      const [root, setRoot] = React.useState(() => {
        try { return window.localStorage.getItem(ROOT_KEY) || ''; } catch { return ''; }
      });
      const [board, setBoard] = React.useState(null);
      const [error, setError] = React.useState('');
      const [loading, setLoading] = React.useState(false);
      const [filter, setFilter] = React.useState('open');
      const [tick, setTick] = React.useState(0);

      // A workspace may be created (or renamed) after the panel mounted, so the
      // remembered root is resolved against the live list on every render.
      const options = workspaces.map((workspace) => ({ id: workspace.path, label: workspace.title || workspace.path }));
      const active = options.some((option) => option.id === root) ? root : options[0]?.id ?? '';

      React.useEffect(() => {
        if (!active) return undefined;
        let cancelled = false;
        setLoading(true);
        setError('');
        fetch(`${ENDPOINT}?root=${encodeURIComponent(active)}`, { cache: 'no-store' })
          .then(async (response) => {
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
            return body;
          })
          .then((body) => { if (!cancelled) setBoard(body); })
          .catch((failure) => { if (!cancelled) { setBoard(null); setError(failure?.message || '读取失败'); } })
          .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
      }, [active, tick]);

      const choose = (next) => {
        setRoot(next);
        try { window.localStorage.setItem(ROOT_KEY, next); } catch { /* storage may be blocked */ }
      };

      const view = React.useMemo(() => collect(board, filter), [board, filter]);

      if (!workspaces.length) {
        return h('div', { className: 'dw-board' }, h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('div', { className: 'dw-state' }, h('b', null, '还没有打开的工作区。'),
            h('div', null, '先在左侧打开一个项目目录，看板会读取该目录下的 .dsh-dev 记录。')));
      }

      return h('div', { className: 'dw-board' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dw-bar' },
          h('span', { className: 'dw-title' }, '研发看板'),
          h('span', { className: 'dw-sub' }, board?.projectId ? `${board.projectId} · ${board.root}` : '读取 `.dsh-dev` 记录'),
          h('span', { className: 'dw-spacer' }),
          h('div', { className: 'dw-chips', role: 'tablist' }, FILTERS.map((option) => h('button', {
            key: option.id,
            type: 'button',
            className: 'dw-chip',
            'data-on': filter === option.id ? '1' : '0',
            onClick: () => setFilter(option.id),
          }, option.label, h('b', null, String(view.counts[option.id]))))),
          h('select', {
            className: 'dw-select',
            value: active,
            'aria-label': '选择工作区',
            onChange: (event) => choose(event.target.value),
          }, options.map((option) => h('option', { key: option.id, value: option.id }, option.label))),
          h('button', { type: 'button', className: 'dw-refresh', onClick: () => setTick((value) => value + 1) }, loading ? '刷新中…' : '刷新')),
        error
          ? h('div', { className: 'dw-state' }, h('b', null, '看板读不到这台机器的记录。'), h('div', { className: 'dw-warn' }, error),
            h('div', null, '会话与 dev_* 工具不受影响；确认 dsh web 已重启到带看板版本的插件。'))
          : board === null
            ? h('div', { className: 'dw-state' }, loading ? '读取中…' : '暂无数据')
            : view.counts.all === 0
              ? h('div', { className: 'dw-state' }, h('b', null, '这个工作区还没有记录。'),
                h('div', null, '在选了「研发助手 · Dev Assistant」的会话里提一条需求，看板就会出现第一张卡片。'))
              : h('div', { className: 'dw-cols' }, view.columns.map(columnNode)));
    }

    function PanelIcon(props) {
      const size = props?.size ?? 16;
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true', fill: 'none' },
        h('rect', { x: 1.5, y: 2.5, width: 3.4, height: 11, rx: 1, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('rect', { x: 6.3, y: 2.5, width: 3.4, height: 7.5, rx: 1, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('rect', { x: 11.1, y: 2.5, width: 3.4, height: 9.5, rx: 1, stroke: 'currentColor', strokeWidth: 1.3 }));
    }

    function apply(ctx) {
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        // Resolved per render, not captured once: a profile that mounts the
        // workspace service late must still get a working dropdown, and one
        // without it gets the "no workspace" state instead of a broken panel.
        inject: () => ({ workspaceStore: ctx.get?.('workspaces')?.list }),
      }, Board));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 11,
        label: () => '研发看板',
      }, PanelIcon));
    }

    // Test / tooling surface: verify/preview.mjs renders these exact nodes with
    // this exact CSS offline, so the screenshot is not a hand-written mock.
    return {
      apply,
      inject: ['slots'],
      __board: { collect, columnNode, cardNode, taskColumn, CSS, FILTERS, COLUMNS, PANEL_ID, ENDPOINT },
    };
  },
});
