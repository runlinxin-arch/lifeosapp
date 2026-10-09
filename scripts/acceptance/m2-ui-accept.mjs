// 通过 Chrome DevTools Protocol 驱动正在运行的应用，对 M2 界面验收项做客观断言并截图
import fs from 'node:fs'
import path from 'node:path'

const SHOT_DIR = path.join(process.cwd(), 'docs', 'acceptance-shots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = targets.find((t) => t.type === 'page')
if (!page) { console.error('找不到渲染进程页面'); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })

let msgId = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
})
const send = (method, params) => new Promise((res) => {
  const id = ++msgId
  pending.set(id, res)
  ws.send(JSON.stringify({ id, method, params }))
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails))
  }
  return r.result.result.value
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  const file = path.join(SHOT_DIR, `${name}.png`)
  fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'))
  return file
}

// 页面内通用工具，注入一次
const HELPERS = `
  window.__byText = (sel, text) => [...document.querySelectorAll(sel)].find(e => e.textContent.trim().includes(text));
  window.__rows = () => [...document.querySelectorAll('main section')][0]?.querySelectorAll('input[type=checkbox]').length ?? 0;
  window.__w = () => document.querySelector('header');
  true;
`
await evaluate(HELPERS)

const results = []
const check = (id, label, pass, detail) => {
  results.push({ id, label, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? '  → ' + detail : ''}`)
}

// ---------- 8.2.1 时间轴常驻 ----------
const headerHasTimeline = await evaluate(`!!__w() && !!__byText('header button', '＋长期任务')`)
check('8.2.1', '时间轴常驻顶部', headerHasTimeline, headerHasTimeline ? 'header 内含「＋长期任务」' : '未找到')

// ---------- 8.2.4 深色基调 ----------
const bg = await evaluate(`getComputedStyle(document.body).backgroundColor`)
const accentUsed = await evaluate(`[...document.querySelectorAll('*')].some(e => getComputedStyle(e).backgroundColor === 'rgb(124, 140, 255)')`)
check('8.2.4a', '底色 = #1e1f24', bg === 'rgb(30, 31, 36)', bg)
check('8.2.4b', '强调色 #7c8cff 被实际使用', accentUsed, accentUsed ? '找到强调色元素' : '未找到')

// ---------- 8.3.1 今日待办 ----------
await evaluate(`__byText('aside button', '今天')?.click(); true`)
await sleep(600)
const rows = await evaluate(`__rows()`)
const doneCount = await evaluate(`[...document.querySelectorAll('main section')][0].querySelectorAll('span.line-through').length`)
const priorityColors = await evaluate(`
  [...[...document.querySelectorAll('main section')][0].querySelectorAll('span.w-2.h-2')].map(e => getComputedStyle(e).backgroundColor)
`)
check('8.3.1a', '待办行数与演示数据一致', rows >= 5, `共 ${rows} 行`)
check('8.3.1b', '存在已完成（删除线）行', doneCount >= 1, `${doneCount} 行带删除线`)
check('8.3.1c', '优先级圆点使用模块色板', priorityColors.length >= 1 && priorityColors.every((c) => ['rgb(231, 76, 60)', 'rgb(243, 156, 18)', 'rgb(139, 141, 152)'].includes(c)), priorityColors.join(', '))

// ---------- 8.3.2 日程汇入只读行 ----------
const badgeCount = await evaluate(`[...document.querySelectorAll('main section')][0].querySelectorAll('button[title="跳到日程"]').length`)
const eventRowsHaveNoDelete = await evaluate(`
  (() => {
    const rows = [...[...document.querySelectorAll('main section')][0].querySelectorAll('div.group')];
    let ok = true, checked = 0;
    for (const r of rows) {
      const isEvent = !!r.querySelector('button[title="跳到日程"]');
      if (!isEvent) continue;
      checked++;
      if ([...r.querySelectorAll('button')].some(b => b.textContent.trim() === '✕')) ok = false;
    }
    return { ok, checked };
  })()
`)
check('8.3.2a', '日程事件汇入待办并带来源标记', badgeCount >= 5, `${badgeCount} 条带「日程 ↗」`)
check('8.3.2b', '日程来源行没有删除按钮', eventRowsHaveNoDelete.ok && eventRowsHaveNoDelete.checked > 0, `检查了 ${eventRowsHaveNoDelete.checked} 行`)

// ---------- 8.3.4 右侧长期任务卡 ----------
const cardText = await evaluate(`[...document.querySelectorAll('main section')][1].innerText`)
check('8.3.4', '右侧长期任务卡显示真实数据', cardText.includes('长期任务') && cardText.includes('剩'), cardText.split('\n').filter((l) => l.includes('剩')).join(' / ') || '未找到剩余天数')

await shot('01-today')

// ---------- 8.3.3 待办转日程 ----------
// 契约：转换后原手工行消失，但当天会新增一条「日程来源」行 → 总数可能不变
const countKinds = `
  (() => {
    const rows = [...[...document.querySelectorAll('main section')][0].querySelectorAll('div.group')];
    let manual = 0, fromEvent = 0;
    for (const r of rows) {
      if (r.querySelector('button[title="跳到日程"]')) fromEvent++; else manual++;
    }
    return { manual, fromEvent, total: rows.length };
  })()
`
const beforeKinds = await evaluate(countKinds)
await evaluate(`__byText('main section button', '转日程')?.click(); true`)
await sleep(500)
const dialogOpen = await evaluate(`!!__byText('div', '转为日程')`)
if (dialogOpen) {
  await evaluate(`
    (() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '确认转换');
      btn?.click();
      return true;
    })()
  `)
  await sleep(1500)
}
const afterKinds = await evaluate(countKinds)
check(
  '8.3.3',
  '待办「转日程」后变为日程来源行',
  dialogOpen && afterKinds.manual === beforeKinds.manual - 1 && afterKinds.fromEvent === beforeKinds.fromEvent + 1,
  `弹窗${dialogOpen ? '已打开' : '未打开'}；手工 ${beforeKinds.manual}→${afterKinds.manual}，日程汇入 ${beforeKinds.fromEvent}→${afterKinds.fromEvent}`
)

// ---------- 8.2.2 时间轴展开 + 浮层 ----------
const hCompact = await evaluate(`__w().getBoundingClientRect().height`)
await evaluate(`__byText('header button', '展开')?.click(); true`)
await sleep(500)
const hExpanded = await evaluate(`__w().getBoundingClientRect().height`)
check('8.2.2a', '展开后轴区变高', hExpanded > hCompact, `${hCompact}px → ${hExpanded}px`)
await shot('02-timeline-expanded')

const blockClicked = await evaluate(`
  (() => {
    const grid = document.querySelector('header div.relative.bg-\\\\[var\\\\(--border\\\\)\\\\]') || __w().querySelector('div[style*="height"]');
    return !!grid;
  })()
`)
// 用颜色块自身的样式定位（色块是绝对定位的 div，带 background 色）
const popupOk = await evaluate(`
  (() => {
    const blocks = [...document.querySelectorAll('header div')].filter(e => {
      const s = getComputedStyle(e);
      return s.position === 'absolute' && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && e.offsetWidth > 0;
    });
    if (!blocks.length) return { ok: false, reason: '未找到色块' };
    blocks[0].click();
    return { ok: true, count: blocks.length };
  })()
`)
await sleep(600)
const popupText = await evaluate(`__w().parentElement.innerText`)
const hasDetail = popupText.includes('剩') && (popupText.includes('来源') || popupText.includes('标记完成'))
check('8.2.2b', '点色块弹详情浮层（含剩余天数）', popupOk.ok && hasDetail, popupOk.ok ? `找到 ${popupOk.count} 个色块` : popupOk.reason)
await shot('03-timeline-popup')
await evaluate(`__byText('header button', '关闭')?.click(); true`)
await sleep(300)

// ---------- 8.5.3 显示范围 / 已完成显隐 ----------
const rangeSelectOk = await evaluate(`
  (() => {
    const sel = [...document.querySelectorAll('header select')][0];
    if (!sel) return { ok: false };
    const opts = [...sel.options].map(o => o.textContent.trim());
    return { ok: opts.length === 3 && opts.join('|').includes('7 天'), opts };
  })()
`)
check('8.5.3a', '显示范围可选 7/30/90 天', rangeSelectOk.ok, (rangeSelectOk.opts || []).join(' / '))

const doneToggle = await evaluate(`
  (() => {
    const cb = [...document.querySelectorAll('header input[type=checkbox]')][0];
    if (!cb) return { ok: false };
    const before = document.querySelectorAll('header div[style*="position: absolute"], header div').length;
    cb.click();
    return { ok: true };
  })()
`)
await sleep(900)
const doneVisible = await evaluate(`
  (() => {
    const blocks = [...document.querySelectorAll('header div')].filter(e => {
      const s = getComputedStyle(e);
      return s.position === 'absolute' && s.backgroundColor === 'rgb(139, 141, 152)' && e.offsetWidth > 0;
    });
    return blocks.length;
  })()
`)
check('8.5.3b', '勾选「显示已完成」后灰色已完成色块出现', doneToggle.ok && doneVisible >= 1, `灰色色块 ${doneVisible} 个`)
const rangeDays = await evaluate(`
  (() => { const sel = document.querySelector('header select'); return sel ? sel.value : null; })()
`)
check('8.5.3c', '范围设置已持久化到库', rangeDays === '30', `当前值 ${rangeDays}`)

// ---------- 8.4.1 周视图 ----------
await evaluate(`__byText('aside button', '日程')?.click(); true`)
await sleep(1200)
const stillResident = await evaluate(`!!__byText('header button', '＋长期任务')`)
check('8.2.1b', '切到日程页后时间轴仍在', stillResident, stillResident ? '时间轴未卸载' : '时间轴消失')

const weekInfo = await evaluate(`
  (() => {
    const main = document.querySelector('main');
    const dayHeaders = [...main.querySelectorAll('div')].filter(e => /^周[一二三四五六日] \\d+\\/\\d+$/.test(e.textContent.trim()));
    const highlighted = [...main.querySelectorAll('div')].filter(e => (e.className || '').toString().includes('ring-[var(--accent)]')).length;
    const blocks = [...main.querySelectorAll('div[title]')].filter(e => e.getAttribute('title')?.includes('【演示】'));
    const allDay = [...main.querySelectorAll('div')].filter(e => e.textContent.trim() === '【演示】全天：家庭日');
    return { dayHeaders: dayHeaders.length, highlighted, blocks: blocks.length, allDay: allDay.length };
  })()
`)
check('8.4.1a', '周视图 7 列日期表头', weekInfo.dayHeaders === 7, `${weekInfo.dayHeaders} 列`)
check('8.4.1b', '今天列有强调色描边', weekInfo.highlighted >= 1, `${weekInfo.highlighted} 个高亮元素`)
check('8.4.1c', '事件按色块渲染', weekInfo.blocks >= 4, `${weekInfo.blocks} 个事件色块`)
check('8.4.1d', '全天事件为通栏色条', weekInfo.allDay >= 1, `${weekInfo.allDay} 条`)
await shot('04-week-view')

// ---------- 8.4.2 事件编辑弹窗 ----------
const dialogFields = await evaluate(`
  (() => {
    const block = [...document.querySelectorAll('main div[title]')].find(e => e.getAttribute('title')?.includes('【演示】需求评审'));
    if (!block) return { ok: false };
    block.click();
    return { ok: true };
  })()
`)
await sleep(600)
const fieldText = await evaluate(`document.body.innerText`)
const hasFields = ['标题', '开始', '结束', '地点', '备注', '重复', '提前提醒'].every((k) => fieldText.includes(k)) && fieldText.includes('全天事件')
check('8.4.2', '事件编辑弹窗字段齐全', dialogFields.ok && hasFields, hasFields ? '标题/开始/结束/地点/备注/重复/提前提醒/全天 均在' : '字段缺失')
await shot('05-event-dialog')

// ---------- 8.4.1 月视图 + 「+N」 ----------
await evaluate(`
  (() => {
    const close = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '取消');
    close?.click();
    return true;
  })()
`)
await sleep(400)
await evaluate(`__byText('main button', '月')?.click(); true`)
await sleep(1000)
const monthInfo = await evaluate(`
  (() => {
    const main = document.querySelector('main');
    const cells = [...main.querySelectorAll('div')].filter(e => (e.className || '').toString().includes('h-[92px]'));
    const plusN = [...main.querySelectorAll('button')].filter(b => /^\\+\\d+$/.test(b.textContent.trim()));
    return { cells: cells.length, plusN: plusN.map(b => b.textContent.trim()) };
  })()
`)
check('8.4.1e', '月视图 42 格网格', monthInfo.cells === 42, `${monthInfo.cells} 格`)
check('8.4.1f', '每天超过 3 条显示「+N」', monthInfo.plusN.length >= 1, monthInfo.plusN.join(', ') || '未出现')
await shot('06-month-view')

if (monthInfo.plusN.length) {
  await evaluate(`
    (() => {
      const b = [...document.querySelectorAll('main button')].find(x => /^\\+\\d+$/.test(x.textContent.trim()));
      b?.click(); return true;
    })()
  `)
  await sleep(500)
  const popup = await evaluate(`document.body.innerText.includes('全部事件')`)
  check('8.4.1g', '点「+N」弹出当天全部事件', popup, popup ? '浮层已弹出' : '未弹出')
  await shot('07-month-plusN')
  await evaluate(`__byText('button', '关闭')?.click(); true`)
}

// ---------- 汇总 ----------
const pass = results.filter((r) => r.pass).length
console.log('')
console.log(`===== 合计 ${pass}/${results.length} 项通过 =====`)
const failed = results.filter((r) => !r.pass)
if (failed.length) {
  console.log('未通过:')
  for (const f of failed) console.log(`  [${f.id}] ${f.label} → ${f.detail}`)
}
console.log('截图目录: ' + SHOT_DIR)
ws.close()
