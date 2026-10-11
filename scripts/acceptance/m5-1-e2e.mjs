// M5 设置页 端到端验收（对应 PRD 4.8 / 8.8）
// 运行前置：应用以 --remote-debugging-port=9222 启动，数据目录由 LIFEOS_DATA_DIR 指向临时目录
// 安全闸门：本脚本会写设置。必须由验收 runner 指定临时数据目录，避免污染真实数据
if (!process.env.LIFEOS_DATA_DIR) {
  console.error('拒绝运行：未设置 LIFEOS_DATA_DIR。')
  console.error('请用 scripts/acceptance/m5-all.ps1 运行，或先设置 LIFEOS_DATA_DIR=<临时目录> 并以该目录启动应用。')
  process.exit(2)
}

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
const CDP_TIMEOUT_MS = 15000
const send = (method, params) => new Promise((resolve, reject) => {
  const i = ++id
  const timer = setTimeout(() => {
    pending.delete(i)
    reject(new Error(`CDP ${method} timed out after ${CDP_TIMEOUT_MS}ms`))
  }, CDP_TIMEOUT_MS)
  pending.set(i, (m) => { clearTimeout(timer); resolve(m) })
  ws.send(JSON.stringify({ id: i, method, params }))
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error')
  return r.result.result.value
}

const results = []
const check = (label, pass, detail) => {
  results.push({ label, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? '  → ' + detail : ''}`)
}

await evaluate(`
  window.__setInput = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  window.__css = (k) => document.documentElement.style.getPropertyValue(k).trim();
  true;
`)

// ---------- 首屏主题注入（问题 #3 回归：主进程启动时注入主题，避免闪深色） ----------
const initThemeBg = await evaluate(`window.__lifeosTheme ? window.__lifeosTheme.bg : null`)
check('首屏主题注入生效（__lifeosTheme.bg = 深色默认）', initThemeBg === '#1e1f24', `bg=${initThemeBg}`)

// ---------- 进入设置页 ----------
await evaluate(`[...document.querySelectorAll('aside button')].find(b => b.textContent.includes('设置和数据'))?.click(); true`)
await sleep(900)
const pageShown = await evaluate(`
  (() => {
    const t = document.querySelector('main').innerText;
    return { 标题: t.includes('设置和数据'), 外观: t.includes('主题模式'), 提醒: t.includes('提醒开关'), 时间轴: t.includes('显示范围'), 数据: t.includes('导出数据包') };
  })()
`)
check('设置页四区块齐全（外观/提醒/时间轴/数据）', Object.values(pageShown).every(Boolean), JSON.stringify(pageShown))

// ---------- 主题模式：浅色切换即时生效 ----------
const darkBg = await evaluate(`__css('--bg')`)
await evaluate(`document.querySelector('[data-theme-mode="light"]').click(); true`)
await sleep(400)
const lightBg = await evaluate(`__css('--bg')`)
check('浅色模式切换即时生效（--bg 变化）', darkBg === '#1e1f24' && lightBg === '#f5f6f8', `dark=${darkBg}, light=${lightBg}`)

await evaluate(`document.querySelector('[data-theme-mode="dark"]').click(); true`)
await sleep(400)
const backBg = await evaluate(`__css('--bg')`)
check('切回深色（--bg 恢复）', backBg === '#1e1f24', `bg=${backBg}`)

// ---------- 主题色更换全局生效 ----------
await evaluate(`document.querySelector('[data-accent="#4ade80"]').click(); true`)
await sleep(400)
const accent = await evaluate(`__css('--accent')`)
check('主题色更换全局生效（--accent = #4ade80）', accent === '#4ade80', `accent=${accent}`)

// checkbox 的 accent-color 也应跟随主题色（回归问题 #2）
const cbAccent = await evaluate(`getComputedStyle(document.querySelector('header input[type=checkbox]')).accentColor`)
check('checkbox 主题色跟随 --accent（#4ade80）', cbAccent === 'rgb(74, 222, 128)', `accentColor=${cbAccent}`)

await evaluate(`document.querySelector('[data-accent="#7c8cff"]').click(); true`)
await sleep(400)

// ---------- 提醒设置 ----------
await evaluate(`(() => { const c = document.querySelector('[data-remind-enabled]'); c.click(); return c.checked; })()`)
await sleep(300)
const remindDisabled = await evaluate(`document.querySelector('[data-remind-enabled]').checked`)
check('提醒开关可关闭', remindDisabled === false, `checked=${remindDisabled}`)
await evaluate(`document.querySelector('[data-remind-enabled]').click(); true`)
await sleep(300)

await evaluate(`__setInput(document.querySelector('[data-remind-lead]'), '30'); true`)
await sleep(400)
const lead = await evaluate(`document.querySelector('[data-remind-lead]').value`)
check('提前分钟数可改为 30', lead === '30', `lead=${lead}`)

// 问题 #4 回归：0=不提醒 的语义说明在页面上可见
const remindHint = await evaluate(`document.querySelector('main').innerText.includes('0 表示不提醒')`)
check('「0=不提醒」语义说明可见', remindHint === true)

// ---------- 时间轴设置 ----------
await evaluate(`(() => { const s = document.querySelector('[data-timeline-range]'); s.value = '7'; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`)
await sleep(400)
const range = await evaluate(`document.querySelector('[data-timeline-range]').value`)
check('时间轴显示范围可改为 7 天', range === '7', `range=${range}`)

await evaluate(`(() => { const c = document.querySelector('[data-timeline-showdone]'); c.click(); return c.checked; })()`)
await sleep(300)
const showDone = await evaluate(`document.querySelector('[data-timeline-showdone]').checked`)
check('显示已完成长期任务可开启', showDone === true, `checked=${showDone}`)

// ---------- 网站风格：无效网址报错并进入手动选色 ----------
await evaluate(`__setInput(document.querySelector('[data-style-url]'), 'not-a-url'); true`)
await evaluate(`document.querySelector('[data-style-fetch]').click(); true`)
await sleep(600)
const styleErr = await evaluate(`document.querySelector('main').innerText.includes('网址格式不正确')`)
check('网站风格模仿：无效网址报错', styleErr === true)

// ---------- 浅色模式下模块色文字变深（问题 #1 回归） ----------
await evaluate(`document.querySelector('[data-theme-mode="light"]').click(); true`)
await sleep(300)
await evaluate(`[...document.querySelectorAll('aside button')].find(b => b.textContent.includes('今天'))?.click(); true`)
await sleep(900)
const learnColor = await evaluate(`
  (() => {
    const card = document.querySelector('[data-today-card="learning"]');
    const el = [...card.querySelectorAll('span.font-bold')].find(s => s.style.color !== '');
    return el ? getComputedStyle(el).color : null;
  })()
`)
check('浅色下模块色文字变深（学习绿 → 深绿 #15803d）', learnColor === 'rgb(21, 128, 61)', `color=${learnColor}`)

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
