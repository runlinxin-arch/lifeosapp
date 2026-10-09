// M3-2 开发模块端到端验收（随 T8–T12 逐步扩充）
// 运行前置：应用以 --remote-debugging-port=9222 启动，数据已清理
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

const results = []
const check = (label, pass, detail) => {
  results.push({ label, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? '  → ' + detail : ''}`)
}

// 页面重载会清空注入的辅助函数，因此把源码存下来以便重载后重新注入
const INJECT_SRC = `
  window.__main = () => document.querySelector('main');
  window.__left = () => document.querySelectorAll('main section')[0];
  window.__right = () => document.querySelectorAll('main section')[1];
  window.__setInput = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  window.__setSelect = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  window.__colTexts = () => [...__right().querySelectorAll('.grid.grid-cols-3 > div')].map(c => c.innerText.replace(/\\n+/g, ' | '));
  window.__cardOf = (title) => [...__right().querySelectorAll('[data-devcard]')].find(d => d.textContent.includes(title));
  window.__dropAt = (key, title) => {
    const card = __cardOf(title);
    const zone = __right().querySelector('[data-dropzone="' + key + '"]');
    if (!card || !zone) return { ok: false, card: !!card, zone: !!zone };
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    return { ok: true };
  };
  true;
`
await evaluate(INJECT_SRC)

const PROJECT = '【验收】看板项目'
const T1 = '【验收】任务一'
const T2 = '【验收】任务二'

// ============ 准备：进入开发页并新建项目 ============
await evaluate(`[...document.querySelectorAll('aside button')].find(b => b.textContent.trim().endsWith('开发'))?.click(); true`)
await sleep(1200)
await evaluate(`
  (() => {
    const input = __left().querySelector('input[placeholder*="新建项目"]');
    __setInput(input, '${PROJECT}');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()
`)
await sleep(1500)
await evaluate(`[...__left().querySelectorAll('button')].find(b => b.textContent.includes('${PROJECT}'))?.click(); true`)
await sleep(1200)

// ============ T8-1 看板三列渲染 ============
const cols = await evaluate(`__right().innerText`)
check('看板三列渲染', cols.includes('待办') && cols.includes('进行中') && cols.includes('已完成'),
  cols.split('\n').filter((l) => ['待办', '进行中', '已完成'].includes(l.trim())).join('/'))

// ============ T8-2 新建任务进入「待办」 ============
await evaluate(`
  (() => {
    const input = __right().querySelector('input[placeholder*="新建任务"]');
    __setInput(input, '${T1}');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()
`)
await sleep(1200)
await evaluate(`
  (() => {
    const input = __right().querySelector('input[placeholder*="新建任务"]');
    __setInput(input, '${T2}');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()
`)
await sleep(1200)
const col0 = await evaluate(`__colTexts()`)
check('新建任务进入「待办」列且列头计数正确', col0[0].includes(T1) && col0[0].includes(T2) && col0[0].includes('2'), col0[0])

// ============ T8-3 「移动到…」跨列 ============
await evaluate(`
  (() => {
    const card = __cardOf('${T1}');
    __setSelect(card.querySelector('select'), 'doing');
    return true;
  })()
`)
await sleep(1500)
const col1 = await evaluate(`__colTexts()`)
check('「移动到…」把任务移到「进行中」', col1[1].includes(T1) && !col1[0].includes(T1), col1.map((c, i) => `[${i}]${c.slice(0, 30)}`).join(' || '))

// ============ T8-4 拖拽（HTML5 DnD 合成事件） ============
const dragged = await evaluate(`JSON.stringify(__dropAt('done:0', '${T2}'))`)
await sleep(1500)
const col2 = await evaluate(`__colTexts()`)
check('拖拽把任务移到「已完成」', col2[2].includes(T2) && !col2[0].includes(T2),
  `${dragged} :: ` + col2.map((c, i) => `[${i}]${c.slice(0, 25)}`).join(' || '))
await shot('13-dev-kanban')

// ============ T8-5 刷新后位置保持（持久化） ============
await send('Page.reload', { ignoreCache: true })
await sleep(4500)
await evaluate(INJECT_SRC)
await evaluate(`[...document.querySelectorAll('aside button')].find(b => b.textContent.trim().endsWith('开发'))?.click(); true`)
await sleep(1500)
await evaluate(`[...__left().querySelectorAll('button')].find(b => b.textContent.includes('${PROJECT}'))?.click(); true`)
await sleep(1500)
const colAfter = await evaluate(`__colTexts()`)
check('刷新后看板位置持久', colAfter[1].includes(T1) && colAfter[2].includes(T2),
  colAfter.map((c, i) => `[${i}]${c.slice(0, 25)}`).join(' || '))

// ============ T8-6 常驻计时器 ============
await evaluate(`
  (() => {
    const card = __cardOf('${T1}');
    const btn = [...card.querySelectorAll('button')].find(b => b.textContent.trim() === '开始计时');
    btn.click();
    return true;
  })()
`)
await sleep(3200)
const timerShown = await evaluate(`
  (() => {
    const t = __right().innerText;
    return { hasTask: t.includes('${T1}'), hasClock: /\\d{2}:\\d{2}/.test(t), hasStop: t.includes('停止') };
  })()
`)
check('开始计时后右上角出现常驻计时器并走字', timerShown.hasTask && timerShown.hasClock && timerShown.hasStop, JSON.stringify(timerShown))
await shot('14-dev-timer')

await evaluate(`
  (() => {
    const btn = [...__right().querySelectorAll('button')].find(b => b.textContent.trim() === '停止');
    btn.click();
    return true;
  })()
`)
await sleep(2000)
const afterStop = await evaluate(`
  (() => {
    const card = __cardOf('${T1}');
    return { cardText: card.innerText.replace(/\\n+/g, ' | '), hasTimer: __right().innerText.includes('停止') };
  })()
`)
check('停止后记录时长且计时器消失', !afterStop.hasTimer && afterStop.cardText.includes('已计 1m'), afterStop.cardText)

// ============ T9 Bug 页签 ============
await evaluate(`
  (() => { [...__right().querySelectorAll('button')].find(b => b.textContent.trim() === 'Bug')?.click(); return true; })()
`)
await sleep(800)
const bugPanel = await evaluate(`__right().innerText`)
check('Bug 页签渲染（含状态计数）', bugPanel.includes('未修') && bugPanel.includes('修复中') && bugPanel.includes('已修复'),
  bugPanel.split('\n').slice(0, 4).join(' / '))

// 新建 Bug（默认中优先级）
await evaluate(`
  (() => {
    const input = __right().querySelector('input[placeholder*="记录一个 Bug"]');
    __setInput(input, '【验收】崩溃 Bug');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()
`)
await sleep(1500)
const bugCreated = await evaluate(`__right().innerText.includes('【验收】崩溃 Bug')`)
const bugRow = await evaluate(`
  (() => {
    const row = [...__right().querySelectorAll('div.bg-\\\\[var\\\\(--card\\\\)\\\\]')].find(d => d.innerText.includes('【验收】崩溃 Bug'));
    return row ? row.innerText.replace(/\\n+/g, ' | ') : 'not-found';
  })()
`)
check('新建 Bug 出现在列表', bugCreated, bugRow)

// 状态流转：未修 → 修复中
await evaluate(`
  (() => {
    const row = [...__right().querySelectorAll('div')].find(d => d.innerText && d.innerText.includes('【验收】崩溃 Bug') && d.querySelectorAll('button').length >= 4);
    const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '修复中');
    btn.click();
    return true;
  })()
`)
await sleep(1500)
const afterFixing = await evaluate(`
  (() => { const m = __right().innerText.match(/未修 (\\d+)[\\s\\S]*?修复中 (\\d+)/); return m ? { open: +m[1], fixing: +m[2] } : null; })()
`)
check('Bug 状态流转到「修复中」', afterFixing && afterFixing.fixing === 1 && afterFixing.open === 0, JSON.stringify(afterFixing))

// 状态流转：修复中 → 已修复
await evaluate(`
  (() => {
    const row = [...__right().querySelectorAll('div')].find(d => d.innerText && d.innerText.includes('【验收】崩溃 Bug') && d.querySelectorAll('button').length >= 4);
    const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '已修复');
    btn.click();
    return true;
  })()
`)
await sleep(1500)
const afterFixed = await evaluate(`
  (() => { const m = __right().innerText.match(/已修复 (\\d+)/); return m ? +m[1] : null; })()
`)
check('Bug 状态流转到「已修复」', afterFixed === 1, `已修复 ${afterFixed}`)

// 未修 Bug 数在项目卡片上同步（新增一条未修后应变为 1）
await evaluate(`
  (() => {
    const input = __right().querySelector('input[placeholder*="记录一个 Bug"]');
    __setInput(input, '【验收】未修 Bug');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()
`)
await sleep(1500)
const cardBugs = await evaluate(`
  (() => { const m = __left().innerText.match(/未修 Bug (\\d+)/); return m ? +m[1] : null; })()
`)
const tabBadge = await evaluate(`
  (() => {
    const tab = [...__right().querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Bug'));
    return tab ? tab.innerText.replace(/\\n/g, ' ') : 'not-found';
  })()
`)
check('项目卡片与页签徽标同步未修数', cardBugs === 1 && tabBadge.includes('1'), `卡片=${cardBugs}, 页签="${tabBadge}"`)
await shot('15-dev-bugs')

// ============ T10 计时统计页签 ============
await evaluate(`
  (() => { [...__right().querySelectorAll('button')].find(b => b.textContent.trim() === '计时统计')?.click(); return true; })()
`)
await sleep(1200)
const stats = await evaluate(`
  (() => {
    const t = __right().innerText;
    const m = t.match(/项目累计\\s*\\n?\\s*([^\\n]+)/);
    return { total: m ? m[1].trim() : null, hasTaskRow: t.includes('${T1}'), records: /计时记录\\s*\\n?\\s*(\\d+) 条/.exec(t)?.[1] };
  })()
`)
check('计时统计：项目累计与任务汇总正确', stats.total === '1m' && stats.hasTaskRow && stats.records === '1',
  JSON.stringify(stats))
await shot('16-dev-timestats')

// 删除一条计时记录 → 累计归零
await evaluate(`
  (() => {
    const btn = [...__right().querySelectorAll('button')].find(b => b.title === '删除这条记录');
    btn.click();
    return true;
  })()
`)
await sleep(1500)
const afterDel = await evaluate(`
  (() => {
    const t = __right().innerText;
    const m = t.match(/项目累计\\s*\\n?\\s*([^\\n]+)/);
    const card = __left().innerText.match(/累计 ([^\\n]+)/);
    return { total: m ? m[1].trim() : null, cardTotal: card ? card[1].trim() : null };
  })()
`)
check('删除计时记录后项目累计归零且卡片同步', afterDel.total === '0m' && afterDel.cardTotal === '0m', JSON.stringify(afterDel))

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
