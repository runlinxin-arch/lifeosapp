// 跨零点自动刷新的可控模拟测试
//
// 做法：在文档启动前替换页面的 Date，让"现在"从一个可控起点开始（真实今天 23:59:50），
// 时间按正常速度流逝，因此约 11 秒后应用会真的经历一次跨零点。
// 同时监视 setTimeout，以验证「排程到下一个零点」与「跨零点后重新排程」。
//
// 为什么不用加速时钟：hook 的延迟是 (假时钟算出的距零点毫秒 + 1000) 交给真实 setTimeout。
// 时钟一加速，那 1 秒真实缓冲会被放大成数假小时，一次跨天后就冲到次日凌晨，
// 下一次排程直接变成"等 24 小时"，无法连续观察。倍率保持 1 才可控。
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

// ---------- 1. 读出应用的真实"今天"并播种 7 天待办 ----------
const realToday = await evaluate(`
  (() => { const d = new Date(); const p = n => String(n).padStart(2,'0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()); })()
`)
console.log(`应用当前真实日期：${realToday}`)

const seeded = await evaluate(`
  (async () => {
    const out = [];
    for (let i = 0; i <= 6; i++) {
      const d = new Date('${realToday}T12:00:00');
      d.setDate(d.getDate() + i);
      const p = n => String(n).padStart(2,'0');
      const date = d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
      const title = '【零点】第' + i + '天';
      await window.lifeos.tasks.create({ title, date, priority: 'mid' });
      out.push(title);
    }
    return out;
  })()
`)
check('播种 7 天待办', seeded.length === 7, `${seeded[0]} … ${seeded[6]}`)

// ---------- 2. 注入可控时钟 + setTimeout 监视 ----------
const BASE = `${realToday}T23:59:50`
const INJECT = `
(() => {
  try {
    const RealDate = Date;
    const base = new RealDate(${JSON.stringify(BASE)}).getTime();
    const t0 = performance.now();
    // 倍率 1：与真实时间同速流逝，保证 setTimeout 的延迟语义不被扭曲
    const fakeNow = () => base + (performance.now() - t0);
    class FakeDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(fakeNow());
        else super(...args);
      }
      static now() { return fakeNow(); }
    }
    window.Date = FakeDate;
    window.__clockNow = () => new RealDate(fakeNow());
    window.__clockText = () => window.__clockNow().toString();

    // 监视 setTimeout，只记录"较长"的定时器（排除 React 调度等短延时噪声）
    window.__timers = [];
    const realSetTimeout = window.setTimeout;
    window.setTimeout = function (fn, delay, ...rest) {
      const d = Number(delay) || 0;
      if (d >= 2000) window.__timers.push({ delay: d, at: window.__clockText() });
      return realSetTimeout(fn, delay, ...rest);
    };

    window.__injectState = 'ok';
  } catch (e) {
    window.__injectState = 'error: ' + (e && e.message ? e.message : String(e));
  }
})();
`
await send('Page.enable')
const added = await send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT })
await send('Page.reload', { ignoreCache: true })
await sleep(2500)

const injectState = await evaluate(`window.__injectState ?? '(未执行)'`)
if (injectState !== 'ok') { console.error('注入失败：' + injectState); ws.close(); process.exit(1) }
console.log(`已注入可控时钟（起点 ${BASE}，与真实时间同速）`)

await evaluate(`
  window.__day = () => {
    const t = document.querySelector('main').innerText;
    const m = /【零点】第(\\d+)天/.exec(t);
    return { day: m ? Number(m[1]) : null, hasToday: t.includes('今日待办') };
  };
  window.__timeline = () => document.querySelector('header') ? document.querySelector('header').innerText.replace(/\\n+/g, ' ') : '';
  window.__longTimers = () => (window.__timers || []).filter(t => t.delay >= 2000);
  true;
`)

// ---------- 3. 验证排程：应排出一个"距零点 + 1 秒"的定时器 ----------
const clockBefore = await evaluate(`__clockText()`)
const timersBefore = await evaluate(`__longTimers()`)
const baseline = await evaluate(`__day()`)
const timelineBefore = await evaluate(`__timeline()`)

console.log(`页面时钟：${clockBefore}`)
console.log(`已排程的定时器：${timersBefore.map((t) => `${t.delay}ms`).join(', ') || '(无)'}`)

const firstTimer = timersBefore.length > 0 ? Math.max(...timersBefore.map((t) => t.delay)) : null
check('启动时排出一个「距零点 + 1 秒缓冲」的定时器',
  firstTimer !== null && Math.abs(firstTimer - 11000) <= 1500,
  `最大延迟 ${firstTimer}ms（期望约 11000ms）`)

check('基线：跨零点前「今天」页显示第 0 天的待办',
  baseline.hasToday && baseline.day === 0, JSON.stringify(baseline))
await shot('29-midnight-before')

// ---------- 4. 等待跨零点 ----------
const seen = [{ day: baseline.day, clock: clockBefore }]
const deadline = Date.now() + 40000
let lastDay = baseline.day
while (Date.now() < deadline) {
  const s = await evaluate(`__day()`)
  if (s.day !== null && s.day !== lastDay) {
    seen.push({ day: s.day, clock: await evaluate(`__clockText()`) })
    lastDay = s.day
    if (lastDay >= 2) break
  }
  await sleep(300)
}

console.log('')
console.log('跨天序列：')
for (const s of seen) console.log(`  第 ${s.day} 天   （页面时钟 ${s.clock.slice(0, 24)}）`)

check('跨零点后「今天」页自动切换到次日待办',
  seen.length >= 2 && seen[1].day === 1, seen.map((s) => `第${s.day}天`).join(' → '))

// ---------- 5. 验证重新排程：应再排出一个约 24 小时的定时器 ----------
const timersAfter = await evaluate(`__longTimers()`)
const maxDelay = timersAfter.length > 0 ? Math.max(...timersAfter.map((t) => t.delay)) : null
const DAY_MS = 86400000
check('跨零点后自动重新排程到下一个零点（约 24 小时）',
  maxDelay !== null && maxDelay > DAY_MS * 0.9 && maxDelay <= DAY_MS + 120000,
  `最大延迟 ${maxDelay}ms（≈ ${maxDelay ? (maxDelay / 3600000).toFixed(2) : '?'} 小时）`)

const timelineAfter = await evaluate(`__timeline()`)
check('顶部时间轴随之滚动到新的日期范围', timelineBefore !== timelineAfter,
  `前「${timelineBefore.slice(0, 44)}」 → 后「${timelineAfter.slice(0, 44)}」`)

const finalState = await evaluate(`__day()`)
check('页面持续可用未崩溃', finalState.hasToday && finalState.day >= 1, JSON.stringify(finalState))
await shot('30-midnight-after')

// ---------- 6. 清理注入 ----------
if (added.result?.identifier) {
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: added.result.identifier })
  console.log('已移除注入的可控时钟')
}

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
