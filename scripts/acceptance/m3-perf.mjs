// M3 大数据量性能验证
// 前置：node scripts/dev/seed-perf-data.mjs，然后以 --remote-debugging-port=9222 启动应用
const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = targets.find((t) => t.type === 'page')
if (!page) { console.error('无渲染页面'); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
let id = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
})
const send = (method, params) => new Promise((res) => {
  const i = ++id
  pending.set(i, res)
  ws.send(JSON.stringify({ id: i, method, params }))
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error')
  return r.result.result.value
}
const fs = await import('node:fs')
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`docs/acceptance-shots/${name}.png`, Buffer.from(r.result.data, 'base64'))
}

// 注入测量工具
await evaluate(`
  window.__time = async (fn) => { const t0 = performance.now(); await fn(); return +(performance.now() - t0).toFixed(1); };
  window.__goto = (name) => { [...document.querySelectorAll('aside button')].find(b => b.textContent.includes(name))?.click(); };
  /** 触发一个动作，等到条件成立并稳定两帧，返回耗时(ms)；超时返回 null */
  window.__measure = async (trigger, predicate, timeoutMs = 20000) => {
    const t0 = performance.now();
    trigger();
    const deadline = t0 + timeoutMs;
    while (performance.now() < deadline) {
      if (predicate()) {
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return +(performance.now() - t0).toFixed(1);
      }
      await new Promise(r => requestAnimationFrame(r));
    }
    return null;
  };
  window.__nodes = () => document.querySelectorAll('*').length;
  window.__heapMB = () => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null);
  true;
`)

const fresh = async () => {
  await send('Page.reload', { ignoreCache: true })
  await sleep(4000)
  await evaluate(`
    window.__time = async (fn) => { const t0 = performance.now(); await fn(); return +(performance.now() - t0).toFixed(1); };
    window.__goto = (name) => { [...document.querySelectorAll('aside button')].find(b => b.textContent.includes(name))?.click(); };
    window.__measure = async (trigger, predicate, timeoutMs = 20000) => {
      const t0 = performance.now();
      trigger();
      const deadline = t0 + timeoutMs;
      while (performance.now() < deadline) {
        if (predicate()) {
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          return +(performance.now() - t0).toFixed(1);
        }
        await new Promise(r => requestAnimationFrame(r));
      }
      return null;
    };
    window.__nodes = () => document.querySelectorAll('*').length;
    window.__heapMB = () => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null);
    true;
  `)
}

const report = { ipc: {}, ui: {}, interact: {}, mem: {}, dom: {} }

console.log('===== 一、数据层（单次 IPC 查询耗时）=====')
const ipc = await evaluate(`(async () => {
  const L = window.lifeos;
  const out = {};
  const t = async (label, fn) => { out[label] = await window.__time(fn); };
  await t('insp.list() 1000 条', () => L.insp.list());
  await t('insp.listTags()', () => L.insp.listTags());
  await t('insp.listBoards()', () => L.insp.listBoards());
  await t('insp.boardStats()', () => L.insp.boardStats());
  await t('learn.listItems() 300 条', () => L.learn.listItems());
  await t('learn.listSessions() 2000 条', () => L.learn.listSessions('2025-01-01', '2026-12-31'));
  await t('dev.listProjects() 21 个', () => L.dev.listProjects());
  await t('dev.listProjectStats()', () => L.dev.listProjectStats());
  await t('dev.listAllTasks() 800 条', () => L.dev.listAllTasks());
  await t('dev.listSessions() 800 条', () => L.dev.listSessions());
  await t('dev.listSnippets()', () => L.dev.listSnippets());
  await t('dev.listNotes()', () => L.dev.listNotes());
  const projs = await L.dev.listProjects();
  const stress = projs.find(p => p.name === '压力测试项目');
  out['__stressId'] = stress ? stress.id : null;
  await t('dev.listTasks(压力项目 300 条)', () => L.dev.listTasks(stress.id));
  await t('dev.listBugs(压力项目)', () => L.dev.listBugs(stress.id));
  return out;
})()`)
const stressId = ipc.__stressId
delete ipc.__stressId
report.ipc = ipc
for (const [k, v] of Object.entries(ipc)) console.log(`  ${String(v).padStart(8)} ms  ${k}`)

console.log('')
console.log('===== 二、页面渲染耗时（导航点击 → 内容出现并稳定两帧）=====')
await fresh()

report.ui.inspiration = await evaluate(`window.__measure(
  () => window.__goto('设计灵感'),
  () => document.querySelectorAll('[data-insp-card]').length > 0
)`)
report.dom.inspirationCards = await evaluate(`document.querySelectorAll('[data-insp-card]').length`)
report.dom.inspirationNodes = await evaluate(`window.__nodes()`)
report.mem.afterInspiration = await evaluate(`window.__heapMB()`)
console.log(`  ${String(report.ui.inspiration).padStart(8)} ms  灵感页（${report.dom.inspirationCards} 张卡片，DOM ${report.dom.inspirationNodes} 节点，JS 堆 ${report.mem.afterInspiration} MB）`)
await shot('27-perf-inspiration-1000')

report.ui.devList = await evaluate(`window.__measure(
  () => window.__goto('开发'),
  () => document.querySelector('main').innerText.includes('压力测试项目')
)`)
report.dom.devProjects = await evaluate(`document.querySelectorAll('main button').length`)
console.log(`  ${String(report.ui.devList).padStart(8)} ms  开发页项目列表（21 个项目卡片）`)

report.ui.kanban300 = await evaluate(`window.__measure(
  () => { [...document.querySelectorAll('main button')].find(b => b.textContent.includes('压力测试项目'))?.click(); },
  () => document.querySelectorAll('[data-devcard]').length >= 300
)`)
report.dom.kanbanCards = await evaluate(`document.querySelectorAll('[data-devcard]').length`)
report.dom.kanbanNodes = await evaluate(`window.__nodes()`)
console.log(`  ${String(report.ui.kanban300).padStart(8)} ms  压力看板（${report.dom.kanbanCards} 张卡片，DOM ${report.dom.kanbanNodes} 节点）`)
await shot('28-perf-kanban-300')

report.ui.learning = await evaluate(`window.__measure(
  () => window.__goto('自我学习'),
  () => document.querySelector('main').innerText.includes('学习清单')
)`)
console.log(`  ${String(report.ui.learning).padStart(8)} ms  学习页（300 个学习项）`)

report.ui.today = await evaluate(`window.__measure(
  () => window.__goto('今天'),
  () => document.querySelector('[data-today-card="learning"]') !== null
)`)
console.log(`  ${String(report.ui.today).padStart(8)} ms  「今天」页（跨模块聚合卡片）`)

console.log('')
console.log('===== 三、交互响应 =====')
await fresh()
await evaluate(`window.__goto('设计灵感'); true`)
await evaluate(`(async () => { for (let i = 0; i < 200; i++) { if (document.querySelectorAll('[data-insp-card]').length > 0) break; await new Promise(r => setTimeout(r, 50)); } })()`)

const inspTotal = await evaluate(`/(\\d+) 条/.exec(document.querySelector('main').innerText)?.[1]`)
report.dom.inspTotal = Number(inspTotal)
console.log(`  （当前灵感总数 ${inspTotal} 条，作为筛选基线）`)

report.interact.keywordFilter = await evaluate(`window.__measure(
  () => {
    const el = [...document.querySelector('main').querySelectorAll('input')].find(i => i.placeholder.includes('搜索文字'));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    // 带前缀搜索：只有「性能灵感 777」含该子串（「性能灵感 1777」不含），任意规模下都恰好 1 条
    setter.call(el, '性能灵感 777');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  () => /(\\d+) 条/.exec(document.querySelector('main').innerText)?.[1] === '1'
)`)
console.log(`  ${String(report.interact.keywordFilter).padStart(8)} ms  灵感关键词筛选（${inspTotal} 条 → 命中 1 条并重渲染）`)

report.interact.clearFilter = await evaluate(`window.__measure(
  () => { [...document.querySelector('main').querySelectorAll('button')].find(b => b.textContent.trim() === '清除筛选')?.click(); },
  () => /(\\d+) 条/.exec(document.querySelector('main').innerText)?.[1] === '${inspTotal}'
)`)
console.log(`  ${String(report.interact.clearFilter).padStart(8)} ms  清除筛选（恢复 ${inspTotal} 条渲染）`)

report.interact.tagFilter = await evaluate(`window.__measure(
  () => { [...document.querySelector('main').querySelectorAll('button')].find(b => b.textContent.trim() === '配色')?.click(); },
  () => { const n = /(\\d+) 条/.exec(document.querySelector('main').innerText)?.[1]; return n && n !== '${inspTotal}'; }
)`)
const tagCount = await evaluate(`/(\\d+) 条/.exec(document.querySelector('main').innerText)?.[1]`)
console.log(`  ${String(report.interact.tagFilter).padStart(8)} ms  灵感标签筛选（→ ${tagCount} 条）`)

// 看板拖拽一次（含重排 + 全量重渲染）
report.interact.kanbanMove = await evaluate(`(async () => {
  window.__goto('开发');
  for (let i = 0; i < 200; i++) { if (document.querySelector('main').innerText.includes('压力测试项目')) break; await new Promise(r => setTimeout(r, 50)); }
  [...document.querySelectorAll('main button')].find(b => b.textContent.includes('压力测试项目'))?.click();
  for (let i = 0; i < 400; i++) { if (document.querySelectorAll('[data-devcard]').length >= 300) break; await new Promise(r => setTimeout(r, 50)); }
  const before = [...document.querySelectorAll('[data-kanban-column="doing"] [data-devcard]')].map(d => d.innerText.split('\\n')[0].trim());
  const card = document.querySelector('[data-kanban-column="todo"] [data-devcard]');
  const title = card.innerText.split('\\n')[0].trim();
  const t0 = performance.now();
  const dt = new DataTransfer();
  card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  const col = document.querySelector('[data-kanban-column="doing"]');
  const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientY: 300, clientX: 200 };
  col.dispatchEvent(new DragEvent('dragover', opts));
  col.dispatchEvent(new DragEvent('drop', opts));
  card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  for (let i = 0; i < 400; i++) {
    const now = [...document.querySelectorAll('[data-kanban-column="doing"] [data-devcard]')].map(d => d.innerText.split('\\n')[0].trim());
    if (now.length === before.length + 1) { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return +(performance.now() - t0).toFixed(1); }
    await new Promise(r => setTimeout(r, 20));
  }
  return null;
})()`)
console.log(`  ${String(report.interact.kanbanMove).padStart(8)} ms  看板拖拽一次（300 张卡片全量重渲染）`)

report.mem.final = await evaluate(`window.__heapMB()`)

// 滚动流畅度：连续滚动 N 步，统计每帧耗时（反映"卡不卡"）
console.log('')
console.log('===== 四、滚动流畅度（每帧耗时，16.7ms ≈ 60fps）=====')
await fresh()
await evaluate(`window.__goto('设计灵感'); true`)
await evaluate(`(async () => { for (let i = 0; i < 200; i++) { if (document.querySelectorAll('[data-insp-card]').length > 0) break; await new Promise(r => setTimeout(r, 50)); } })()`)
report.interact.inspScroll = await evaluate(`(async () => {
  const el = [...document.querySelectorAll('main div')].find(d => d.scrollHeight > d.clientHeight + 200 && d.querySelector('[data-insp-card]'));
  if (!el) return null;
  const frames = [];
  let last = performance.now();
  const t0 = last;
  for (let i = 0; i < 40; i++) {
    el.scrollTop += 400;
    await new Promise(r => requestAnimationFrame(() => { const now = performance.now(); frames.push(now - last); last = now; r(); }));
  }
  const total = performance.now() - t0;
  const sorted = [...frames].sort((a, b) => a - b);
  return { total: +total.toFixed(1), avg: +(total / frames.length).toFixed(1), p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1), worst: +sorted[sorted.length - 1].toFixed(1), frames: frames.length };
})()`)
const sc = report.interact.inspScroll
console.log(`  灵感页 1000 张卡片滚动 40 步：平均 ${sc.avg} ms/帧，P95 ${sc.p95} ms，最差 ${sc.worst} ms（共 ${sc.total} ms）`)

console.log('')
console.log('===== 五、资源占用 =====')
console.log(`  渲染进程 JS 堆: ${report.mem.final} MB`)
console.log(`  灵感页 DOM 节点: ${report.dom.inspirationNodes}`)
console.log(`  看板 DOM 节点: ${report.dom.kanbanNodes}`)

fs.writeFileSync('docs/acceptance-shots/perf-report.json', JSON.stringify(report, null, 2))
console.log('')
console.log('明细已写入 docs/acceptance-shots/perf-report.json')
ws.close()
