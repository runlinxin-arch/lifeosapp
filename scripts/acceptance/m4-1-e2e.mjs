// M4-1 健身模块 端到端验收（对应 PRD 4.5 / 8.7.1）
// 运行前置：npm run build 后，应用以 --remote-debugging-port=9222 启动，且数据目录由 LIFEOS_DATA_DIR 指向临时目录
// 安全闸门：本脚本会清理数据。必须由验收 runner 指定临时数据目录（LIFEOS_DATA_DIR），
// 否则可能清掉真实用户数据（%APPDATA%\LifeOS\app.db）。见 scripts/acceptance/m4-all.ps1
if (!process.env.LIFEOS_DATA_DIR) {
  console.error('拒绝运行：未设置 LIFEOS_DATA_DIR。');
  console.error('请用 scripts/acceptance/m4-all.ps1 运行，或先设置 LIFEOS_DATA_DIR=<临时目录> 并以该目录启动应用。');
  process.exit(2);
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
const waitFor = async (expr, timeoutMs = 8000) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expr)) return true
    await sleep(200)
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
  window.__clickText = (t) => { [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t)?.click(); };
  window.__text = () => document.querySelector('main').innerText;
  window.__stat = (k) => { const el = document.querySelector('[data-stat-' + k + ']'); return el ? el.getAttribute('data-stat-' + k) : null; };
  true;
`
await evaluate(HELPERS)

// ============ 日期基准（周一为一周起点，与 weekDays 一致） ============
const D = await evaluate(`(() => {
  const p = (n) => String(n).padStart(2, '0');
  const fmt = (d) => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d); };
  const today = fmt(new Date());
  const g = new Date(today + 'T00:00:00').getDay();
  const iso = g === 0 ? 7 : g;
  return { today, iso: String(iso), yesterday: shift(-1), before: shift(-2), before3: shift(-3),
           monday: shift(-(iso - 1)), sunday: shift(7 - iso) };
})()`)
console.log(`日期基准：今天 ${D.today}（周${D.iso}），本周 ${D.monday} ~ ${D.sunday}`)
console.log('')

// ============ 0. 清空健身数据，保证可重复运行 ============
const cleaned = await evaluate(`(async () => {
  const api = window.lifeos;
  let n = 0;
  for (const l of await api.fit.listLogs()) { await api.fit.removeLog(l.id); n++ }
  for (const p of await api.fit.listPlans()) { await api.fit.removePlan(p.id); n++ }
  for (const m of await api.fit.listMetrics()) { await api.fit.removeMetric(m.id); n++ }
  return n;
})()`)
check('清空既有健身数据（脚本可重复运行）', typeof cleaned === 'number', `清理 ${cleaned} 条`)

// ============ 1. 进入健身页 + 新建计划 ============
// 先离开再回来：页面按需加载数据，若脚本上一次运行结束时停在健身页，直接点不会重新挂载
await evaluate(`__goto('今天'); true`)
await sleep(500)
await evaluate(`__goto('健身'); true`)
const onPage = await waitFor(`!!document.querySelector('input[placeholder="新建计划名称"]')`)
check('侧边栏「健身」可进入（导航已启用）', onPage)
check('空状态提示「还没有训练计划」', await evaluate(`__text().includes('还没有训练计划')`))

await evaluate(`__set(document.querySelector('input[placeholder="新建计划名称"]'), '【验收】推拉腿'); true`)
await sleep(200)
await evaluate(`__clickText('新建计划'); true`)
const created = await waitFor(`!!document.querySelector('[data-plan-day="1"]') && !!document.querySelector('select')`)
const dueDays = await evaluate(`document.querySelectorAll('[data-plan-day]').length`)
check('新建训练计划后自动选中并进入编排', created)
check('一周七格编排（周一–周日）', dueDays === 7, `${dueDays} 格`)

// ============ 2. 编排一周安排：周一 = 胸，今天 = 腿 ============
// 保存是「失焦 → IPC → 落库 → 刷新」的异步链，必须等状态真正落库，
// 固定 sleep 在机器繁忙时会假失败（本步骤曾偶发 FAIL）
const setDay = async (key, value) => {
  await evaluate(`(async () => {
    const el = document.querySelector('[data-plan-day="${key}"]');
    el.focus(); window.__set(el, '${value}');
    await new Promise(r => setTimeout(r, 150));
    el.blur();
    return true;
  })()`)
  const saved = await waitFor(`(async () => {
    const plans = await window.lifeos.fit.listPlans();
    return plans[0]?.schedule?.[${JSON.stringify(key)}] === ${JSON.stringify(value)};
  })()`, 8000)
  if (!saved) console.log(`  [diag] 第 ${key} 天（${value}）未在 8s 内落库`)
}
await setDay('1', '胸')
await setDay(D.iso, '腿')

const sched = await evaluate(`(async () => (await window.lifeos.fit.listPlans())[0].schedule)()`)
check('一周安排以 ISO 数字键入库（1=周一）', sched && sched['1'] === '胸' && sched[D.iso] === '腿', JSON.stringify(sched))
const chipShown = await evaluate(`__text().includes('今日训练') && __text().includes('腿')`)
check('「今日训练」显示今天该练什么（腿）', chipShown)
await shot('31-m4-fitness-plan')

// ---- 刷新后仍保持 ----
await send('Page.reload', {})
await sleep(2000)
await waitFor(`!!document.querySelector('aside')`, 10000)
await evaluate(HELPERS) // 刷新后渲染上下文重建，需重新注入
await evaluate(`__goto('健身'); true`)
const persisted = await waitFor(`document.querySelector('[data-plan-day="1"]')?.value === '胸'`, 8000)
check('刷新（重启渲染进程）后一周安排仍保持', persisted,
  await evaluate(`document.querySelector('[data-plan-day="1"]')?.value ?? '(无)'`))

// ============ 3. 打卡：动作 / 重量 / 组数×次数 ============
await evaluate(`document.querySelector('[data-action="start-workout"]')?.click(); true`)
await waitFor(`!!document.querySelector('button')`, 4000)
await sleep(300)
// 「开始今天的训练」进入编辑态时动作列表为空，需要自行追加动作行
const fillItem = async (i, name, weight, sets, reps) => {
  if (!(await evaluate(`!!document.querySelector('[data-item-name="${i}"]')`))) {
    await evaluate(`__clickText('＋ 添加动作'); true`)
    await waitFor(`!!document.querySelector('[data-item-name="${i}"]')`, 4000)
  }
  await evaluate(`(async () => {
    window.__set(document.querySelector('[data-item-name="${i}"]'), '${name}');
    window.__set(document.querySelector('[data-item-weight="${i}"]'), ${weight});
    window.__set(document.querySelector('[data-item-sets="${i}"]'), ${sets});
    window.__set(document.querySelector('[data-item-reps="${i}"]'), ${reps});
    return true;
  })()`)
  await sleep(250)
}
await fillItem(0, '卧推', 60, 4, 8)
await fillItem(1, '深蹲', 100, 5, 5)
await evaluate(`document.querySelector('[data-action="submit-workout"]')?.click(); true`)
const logged = await waitFor(`!!document.querySelector('[data-workout-logged="true"]')`)
const logText = await evaluate(`document.querySelector('[data-workout-logged="true"]').innerText.replace(/\\n+/g, ' | ')`)
check('打卡记录含动作/重量/组数，并显示总容量 4,420 kg',
  logged && logText.includes('卧推') && logText.includes('60kg × 4 组 × 8 次') && logText.includes('4,420'),
  logText.slice(0, 170))

const count1 = await evaluate(`__stat('count')`)
const volume1 = await evaluate(`__stat('volume')`)
check('周统计：训练次数 1、总容量 4420（60×4×8 + 100×5×5）',
  count1 === '1' && volume1 === '4420', `count=${count1}, volume=${volume1}`)
await shot('32-m4-fitness-logged')

// ============ 4. 同一天再次打卡是更新而非新增 ============
await evaluate(`__clickText('编辑'); true`)
await waitFor(`!!document.querySelector('[data-item-weight="0"]')`)
await evaluate(`window.__set(document.querySelector('[data-item-weight="0"]'), 50); true`)
await sleep(200)
await evaluate(`document.querySelector('[data-action="submit-workout"]')?.click(); true`)
// 等容量真正按新重量重算（替代固定 sleep）
const updated = await waitFor(`document.querySelector('[data-stat-volume]')?.getAttribute('data-stat-volume') === '4100'`, 8000)
if (!updated) console.log('  [diag] 更新后的周容量未在 8s 内变为 4100')
const todayLogs = await evaluate(`(async () => (await window.lifeos.fit.listLogs('${D.today}', '${D.today}')).length)()`)
const volume2 = await evaluate(`__stat('volume')`)
check('同一天再次打卡是更新（当天记录数仍为 1）', todayLogs === 1, `今日记录数=${todayLogs}`)
check('更新后总容量按新重量重算（50×4×8 + 2500 = 4100）', volume2 === '4100', `volume=${volume2}`)

// ============ 5. 连续打卡与周统计（含空打卡） ============
await evaluate(`(async () => {
  const api = window.lifeos;
  await api.fit.createLog({ date: '${D.yesterday}' });
  await api.fit.createLog({ date: '${D.before}' });
  return true;
})()`)
// 离开再回来触发 store 重新加载
await evaluate(`__goto('今天'); true`)
await sleep(600)
await evaluate(`__goto('健身'); true`)
await sleep(1200)

const expectedCount = [D.today, D.yesterday, D.before].filter((d) => d >= D.monday && d <= D.sunday).length
const stats = await evaluate(`({ c: __stat('count'), v: __stat('volume'), s: __stat('streak') })`)
check('周统计：训练次数与本周内记录数一致', stats.c === String(expectedCount), `count=${stats.c}, 期望=${expectedCount}`)
check('周统计：空打卡计次但不计容量（总容量仍为 4100）', stats.v === '4100', `volume=${stats.v}`)
check('连续打卡天数正确（今天 + 前 2 天 = 3）', stats.s === '3', `streak=${stats.s}`)
const dayMarks = await evaluate(`[...document.querySelectorAll('[data-stat-count]')].length > 0`)
check('本周每日小格渲染', dayMarks)

// ============ 6. 身体数据与趋势曲线 ============
const addMetric = async (date, weight, fat) => {
  await evaluate(`document.querySelector('[data-action="record-metric"]')?.click(); true`)
  await waitFor(`!!document.querySelector('[data-metric-weight]')`)
  await evaluate(`(async () => {
    window.__set(document.querySelector('input[type="date"]'), '${date}');
    window.__set(document.querySelector('[data-metric-weight]'), ${weight});
    window.__set(document.querySelector('[data-metric-fat]'), ${fat});
    return true;
  })()`)
  await sleep(250)
  await evaluate(`document.querySelector('[data-action="submit-metric"]')?.click(); true`)
  // 等这条身体数据真正落库（替代固定 sleep）
  const ok = await waitFor(`(async () => {
    const ms = await window.lifeos.fit.listMetrics();
    return ms.some(m => m.date === '${date}' && m.weight === ${weight});
  })()`, 8000)
  if (!ok) console.log(`  [diag] 身体数据 ${date}=${weight} 未在 8s 内落库`)
}
await addMetric(D.before3, 71.2, 18.4)
await addMetric(D.today, 70.5, 17.9)

const metrics = await evaluate(`(async () => (await window.lifeos.fit.listMetrics()).map(m => ({ d: m.date, w: m.weight, f: m.body_fat })))()`)
check('身体数据按日期记录两条', metrics.length === 2, JSON.stringify(metrics))
const chart = await evaluate(`(() => {
  const s = document.querySelector('svg[data-chart="body"]');
  return s ? { circles: s.querySelectorAll('circle').length, dashed: s.querySelectorAll('path[stroke-dasharray]').length } : null;
})()`)
check('趋势曲线出现：体重两点 + 体脂虚线', !!chart && chart.circles >= 4 && chart.dashed >= 1, JSON.stringify(chart))
check('显示最新体重 70.5 kg 与相对上次变化', await evaluate(`__text().includes('70.5') && __text().includes('0.7')`))
await shot('33-m4-fitness-trend')

// ---- 同一天覆盖 ----
await addMetric(D.today, 70.9, 17.6)
const after = await evaluate(`(async () => {
  const ms = await window.lifeos.fit.listMetrics();
  return { n: ms.length, latest: ms[ms.length - 1].weight, latestFat: ms[ms.length - 1].body_fat };
})()`)
check('同一天再次记录是覆盖（条数不变、值更新为 70.9）',
  after.n === 2 && after.latest === 70.9 && after.latestFat === 17.6, JSON.stringify(after))

// ============ 7. 打卡历史与曲线自适应 ============
const hist = await evaluate(`(() => {
  const h = document.querySelector('[data-workout-history]');
  return h ? { rows: h.querySelectorAll('[data-history-row]').length, text: h.innerText.replace(/\\n+/g, ' | ') } : null;
})()`)
check('打卡历史可见（3 天记录，含空打卡）',
  !!hist && hist.rows === 3 && hist.text.includes('卧推') && hist.text.includes('只记了「练了」'),
  hist ? hist.text.slice(0, 150) : '(无)')

const fit = await evaluate(`(() => {
  const s = document.querySelector('svg[data-chart="body"]');
  return s ? { w: Number(s.getAttribute('width')), box: Math.round(s.parentElement.clientWidth) } : null;
})()`)
check('曲线宽度自适应容器（不再固定 320 居中）',
  !!fit && Math.abs(fit.w - fit.box) <= 2 && fit.w > 320, JSON.stringify(fit))

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
