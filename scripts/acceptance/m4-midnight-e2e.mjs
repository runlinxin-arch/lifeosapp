// M4 跨零点验证：跨零点后「今天」页卡片归属是否自动切到新的一天
//
// 修复前的现象：应用挂着过夜，「今天」页卡片仍按昨天计算归属，数据会落到错误的日期上。
//
// 做法同 m3-midnight-e2e.mjs：文档启动前替换页面的 Date，让"现在"从真实今天 23:59:50
// 起按正常速度流逝，约 11 秒后应用真的经历一次跨零点（时钟保持 1 倍速，避免定时器语义被扭曲）。
//
// 运行前置：应用以 --remote-debugging-port=9222 启动，且数据目录由 LIFEOS_DATA_DIR 指向临时目录

// 安全闸门：本脚本会写入数据，必须由验收 runner 指定临时数据目录，避免污染真实数据
if (!process.env.LIFEOS_DATA_DIR) {
  console.error('拒绝运行：未设置 LIFEOS_DATA_DIR。')
  console.error('请先设置 LIFEOS_DATA_DIR=<临时目录> 并以该目录启动应用（见 scripts/acceptance/m4-all.ps1）。')
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
const waitFor = async (expr, timeoutMs = 30000) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expr)) return true
    await sleep(300)
  }
  return false
}

const HELPERS = `
  window.__goto = (name) => { [...document.querySelectorAll('aside button')].find(b => b.textContent.includes(name))?.click(); };
  window.__set = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  true;
`

// ---------- 1. 读出应用真实「今天」，据此算出跨零点后的日期 ----------
const D0 = await evaluate(`(() => {
  const p = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
})()`)
const D1 = await evaluate(`(() => {
  const p = (n) => String(n).padStart(2, '0');
  const d = new Date('${D0}T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
})()`)
console.log(`真实今天 ${D0} → 跨零点后应为 ${D1}`)
console.log('')

// ---------- 2. 注入可控时钟（23:59:50 起，1 倍速） ----------
const BASE = `${D0}T23:59:50`
const INJECT = `
(() => {
  try {
    const RealDate = Date;
    const base = new RealDate(${JSON.stringify(BASE)}).getTime();
    const t0 = performance.now();
    const fakeNow = () => base + (performance.now() - t0);
    class FakeDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(fakeNow());
        else super(...args);
      }
      static now() { return fakeNow(); }
    }
    window.Date = FakeDate;
    window.__injectState = 'ok';
  } catch (e) {
    window.__injectState = 'error: ' + (e && e.message ? e.message : String(e));
  }
})();
`
await send('Page.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT })
await send('Page.reload', { ignoreCache: true })
await sleep(2500)
const injectState = await evaluate(`window.__injectState ?? '(未执行)'`)
if (injectState !== 'ok') { console.error('注入失败：' + injectState); ws.close(); process.exit(1) }
console.log(`已注入可控时钟（起点 ${BASE}，与真实时间同速）`)

await evaluate(HELPERS)
await waitFor(`!!document.querySelector('aside')`, 10000)

// ---------- 3. 阶段一：跨零点前给 D0 播种，卡片归属应停在 D0 ----------
const iso0 = await evaluate(`(() => { const g = new Date('${D0}T00:00:00').getDay(); return String(g === 0 ? 7 : g); })()`)
await evaluate(`(async () => {
  const api = window.lifeos;
  await api.diet.upsertMeal({ date: '${D0}', type: 'breakfast', items: [{ name: '燕麦', calories: 150, protein: 5, carbs: 27, fat: 3 }] });
  await api.fit.createPlan({ name: '【零点】计划', schedule: { '${iso0}': '腿' } });
  await api.fit.createLog({ date: '${D0}', content: [] });
  return true;
})()`)
// 卡片在挂载时按需加载，先离开再回来才会读到刚播种的数据（应用默认就停在今天页）
await evaluate(`__goto('日程'); true`)
await sleep(600)
await evaluate(`__goto('今天'); true`)
const cardReady = await waitFor(`(document.querySelector('[data-today-card="diet"]')?.querySelector('[data-diet-recorded]')?.getAttribute('data-diet-recorded')) === '1'`, 8000)
const cardBefore = await evaluate(`({
  recorded: document.querySelector('[data-diet-recorded]')?.getAttribute('data-diet-recorded'),
  kcal: document.querySelector('[data-diet-calories]')?.getAttribute('data-diet-calories'),
  planned: document.querySelector('[data-fitness-planned]')?.getAttribute('data-fitness-planned')
})`)
check('跨零点前：卡片归属于 D0（已记录 1 餐 / 150 kcal / 今天该练「腿」）',
  cardReady && cardBefore.recorded === '1' && cardBefore.kcal === '150' && cardBefore.planned === '腿',
  JSON.stringify(cardBefore))

// 等真的跨过零点（卡片须在于跨零点前后都保持挂载，才谈得上"自动刷新"）
const cardsCrossed = await waitFor(`document.querySelector('[data-diet-recorded]')?.getAttribute('data-diet-recorded') === '0'`, 30000)
const cardAfter = await evaluate(`({
  recorded: document.querySelector('[data-diet-recorded]')?.getAttribute('data-diet-recorded'),
  kcal: document.querySelector('[data-diet-calories]')?.getAttribute('data-diet-calories'),
  planned: document.querySelector('[data-fitness-planned]')?.getAttribute('data-fitness-planned')
})`)
check('**跨零点后：卡片归属自动切到新的一天**（已记录 0 餐 / 0 kcal / 今天无安排）',
  cardsCrossed && cardAfter.recorded === '0' && cardAfter.kcal === '0' && cardAfter.planned === '',
  JSON.stringify(cardAfter))

// ---------- 4. 卡片与页面在跨零点后仍可用 ----------
await evaluate(`__goto('今天'); true`)
await sleep(1200)
check('跨零点后「今天」页卡片仍正常渲染',
  await evaluate(`!!document.querySelector('[data-today-card="fitness"]') && !!document.querySelector('[data-today-card="diet"]')`))

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
