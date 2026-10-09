// M3-1 Task 6/7/8 端到端界面验证（修正版：精确匹配 + 限定右侧面板，避免命中左侧列表项）
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

await evaluate(`
  window.__right = () => document.querySelectorAll('main section')[1];
  window.__btn = (t) => [...__right().querySelectorAll('button')].find(b => b.textContent.trim() === t);
  window.__btnIn = (root, t) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === t);
  window.__setInput = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  true;
`)

const TODAY = await evaluate(`(() => { const d = new Date(); const p = n => String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); })()`)
const plus = (n) => {
  const d = new Date(TODAY + 'T00:00:00'); d.setDate(d.getDate() + n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ---------- 准备 ----------
await evaluate(`[...document.querySelectorAll('aside button')].find(b => b.textContent.includes('自我学习'))?.click(); true`)
await sleep(900)
await evaluate(`
  (() => {
    const input = document.querySelector('main input[placeholder*="添加学习项"]');
    __setInput(input, '【验收】M3 学习项');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()
`)
await sleep(1200)
check('新建学习项', await evaluate(`document.querySelector('main').innerText.includes('【验收】M3 学习项')`))

await evaluate(`
  [...document.querySelectorAll('main section')][0].querySelectorAll('button').length && 
  [...[...document.querySelectorAll('main section')][0].querySelectorAll('button')].find(b => b.textContent.includes('【验收】M3 学习项'))?.click();
  true;
`)
await sleep(800)
const detailShown = await evaluate(`
  (() => { const t = __right().innerText; return { 属性: t.includes('基本属性'), 计时: t.includes('学习计时'), 长期任务: t.includes('长期任务'), 进度: t.includes('进度'), 笔记: t.includes('学习笔记') }; })()
`)
check('详情页五个区块齐全', Object.values(detailShown).every(Boolean), JSON.stringify(detailShown))

// ---------- 进度 ----------
await evaluate(`(() => { __setInput(__right().querySelectorAll('input[type=number]')[0], '30'); return true; })()`)
await sleep(900)
await evaluate(`(() => { __setInput(__right().querySelectorAll('input[type=number]')[1], '12'); return true; })()`)
await sleep(1000)
const pct = await evaluate(`(() => { const m = __right().innerText.match(/(\\d+)%/); return m ? Number(m[1]) : null; })()`)
check('进度编辑 30/12 → 40%', pct === 40, `${pct}%`)

await evaluate(`(() => { __setInput(__right().querySelectorAll('input[type=number]')[1], '99'); return true; })()`)
await sleep(1000)
const rejected = await evaluate(`__right().innerText.includes('进度不能超过总量')`)
const pctAfter = await evaluate(`(() => { const m = __right().innerText.match(/(\\d+)%/); return m ? Number(m[1]) : null; })()`)
check('进度超总量被拒绝，原值保持 40%', rejected && pctAfter === 40, `错误提示=${rejected}, 仍为 ${pctAfter}%`)

// ---------- 笔记 ----------
await evaluate(`
  (() => {
    const input = __right().querySelector('input[placeholder*="记一条笔记"]');
    __setInput(input, '第一章：词汇量 3000');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()
`)
await sleep(1000)
check('新增笔记', await evaluate(`__right().innerText.includes('第一章：词汇量 3000')`))

// ---------- 计时器 ----------
await evaluate(`__btn('开始')?.click(); true`)
await sleep(3200)
const ticking = await evaluate(`/\\d{2}:\\d{2}/.test(__right().innerText)`)
await evaluate(`__btn('停止并记录')?.click(); true`)
await sleep(1500)
// 回统计面板看今日时长
await evaluate(`__btn('返回统计')?.click(); true`)
await sleep(900)
const todayDuration = await evaluate(`
  (() => { const m = __right().innerText.match(/今日学习\\s*([^\\n]+)/); return m ? m[1].trim() : null; })()
`)
check('计时器走字 + 停止后计入今日统计', ticking && todayDuration === '1m', `走字=${ticking}, 今日=${todayDuration}`)
await shot('10-learn-timer')

// 回到详情继续
await evaluate(`
  [...[...document.querySelectorAll('main section')][0].querySelectorAll('button')].find(b => b.textContent.includes('【验收】M3 学习项'))?.click();
  true;
`)
await sleep(800)

// ---------- 标记为长期任务 ----------
const markDisabledBefore = await evaluate(`__btn('标记为长期任务')?.disabled`)
check('未设起止日期时标记按钮禁用', markDisabledBefore === true, `disabled=${markDisabledBefore}`)

await evaluate(`
  (() => {
    const dates = __right().querySelectorAll('input[type=date]');
    __setInput(dates[0], '${plus(0)}'); __setInput(dates[1], '${plus(20)}');
    return true;
  })()
`)
await sleep(1200)
await evaluate(`__btn('标记为长期任务')?.click(); true`)
await sleep(1800)
const marked = await evaluate(`
  (() => {
    const green = [...document.querySelectorAll('header div')].filter(e => {
      const s = getComputedStyle(e);
      return s.position === 'absolute' && s.backgroundColor === 'rgb(74, 222, 128)' && e.offsetWidth > 0;
    }).length;
    return { hasBadge: __right().innerText.includes('已上轴'), greenBlocks: green };
  })()
`)
check('标记后「已上轴」+ 时间轴出现学习绿块', marked.hasBadge && marked.greenBlocks >= 1, JSON.stringify(marked))
await shot('11-learn-marked')

await evaluate(`__btn('取消标记')?.click(); true`)
await sleep(1800)
const unmarked = await evaluate(`
  (() => {
    const green = [...document.querySelectorAll('header div')].filter(e => {
      const s = getComputedStyle(e);
      return s.position === 'absolute' && s.backgroundColor === 'rgb(74, 222, 128)' && e.offsetWidth > 0;
    }).length;
    return { hasBadge: __right().innerText.includes('已上轴'), greenBlocks: green };
  })()
`)
check('取消标记后色块消失', !unmarked.hasBadge && unmarked.greenBlocks === 0, JSON.stringify(unmarked))

// ---------- 删除 ----------
await evaluate(`__btn('删除')?.click(); true`)
await sleep(1500)
check('删除学习项', await evaluate(`!document.querySelector('main').innerText.includes('【验收】M3 学习项')`))

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
