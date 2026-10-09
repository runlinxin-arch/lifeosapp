// M4-4「今天」页卡片接线 端到端验收（对应 PRD 8.3.4 / L84–L89）
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
  window.__card = (k) => document.querySelector('[data-today-card="' + k + '"]');
  window.__cardText = (k) => { const c = __card(k); return c ? c.innerText.replace(/\\n+/g, ' | ') : 'no-card'; };
  window.__cardAttr = (k, sel, name) => { const el = __card(k)?.querySelector(sel); return el ? el.getAttribute(name) : null; };
  window.__openCard = (k) => { const c = __card(k); [...(c?.querySelectorAll('button') ?? [])].find(b => b.textContent.includes('进入模块'))?.click(); };
  true;
`
await evaluate(HELPERS)

// 日期基准（含本周一起点，与 weekDays 一致）
const D = await evaluate(`(() => {
  const p = (n) => String(n).padStart(2, '0');
  const fmt = (d) => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d); };
  const today = fmt(new Date());
  const g = new Date(today + 'T00:00:00').getDay();
  const iso = g === 0 ? 7 : g;
  return { today, iso: String(iso), yesterday: shift(-1), monday: shift(-(iso - 1)), sunday: shift(7 - iso) };
})()`)
console.log(`日期基准：今天 ${D.today}（周${D.iso}），本周 ${D.monday} ~ ${D.sunday}`)
console.log('')

// ============ 0. 清空健身与饮食数据 ============
const cleaned = await evaluate(`(async () => {
  const api = window.lifeos;
  let n = 0;
  for (const l of await api.fit.listLogs()) { await api.fit.removeLog(l.id); n++ }
  for (const p of await api.fit.listPlans()) { await api.fit.removePlan(p.id); n++ }
  for (const m of await api.diet.listMeals()) { await api.diet.removeMeal(m.id); n++ }
  return n;
})()`)
check('清空健身与饮食数据（脚本可重复运行）', typeof cleaned === 'number', `清理 ${cleaned} 条`)

// 离开再回到「今天」，确保卡片重新挂载并拉取最新数据
const backToToday = async () => {
  await evaluate(`__goto('日程'); true`)
  await sleep(500)
  await evaluate(`__goto('今天'); true`)
  await sleep(1200)
}
await backToToday()

// ============ 1. 卡片存在性与空状态 ============
check('「今天」页渲染健身与饮食卡片',
  await evaluate(`!!__card('fitness') && !!__card('diet')`))
check('**游戏娱乐无今日卡片**（PRD L89）',
  await evaluate(`!__card('entertainment') && !__card('ent')`))
check('无训练计划时给出引导文案',
  await evaluate(`__cardText('fitness').includes('还没有训练计划')`), await evaluate(`__cardText('fitness')`))
const dietEmpty = await evaluate(`({
  recorded: __cardAttr('diet', '[data-diet-recorded]', 'data-diet-recorded'),
  text: __cardText('diet')
})`)
check('无饮食记录时显示 已记录 0/4 且四餐均为未记录',
  dietEmpty.recorded === '0' && dietEmpty.text.includes('早餐 | 未记录') && dietEmpty.text.includes('加餐 | 未记录'),
  dietEmpty.text.slice(0, 120))

// ============ 2. 播种：训练计划 + 两次打卡 ============
const expectedWeekCount = [D.today, D.yesterday].filter((d) => d >= D.monday && d <= D.sunday).length
await evaluate(`(async () => {
  const api = window.lifeos;
  const plan = await api.fit.createPlan({ name: '【验收】推拉腿', schedule: { '1': '胸', '${D.iso}': '腿' } });
  await api.fit.createLog({ date: '${D.yesterday}', planId: plan.id, content: [] });
  await api.fit.createLog({
    date: '${D.today}', planId: plan.id,
    content: [{ name: '卧推', weight: 60, sets: 4, reps: 8 }]
  });
  return true;
})()`)
await backToToday()

const fitCard = await evaluate(`({
  planned: __cardAttr('fitness', '[data-fitness-planned]', 'data-fitness-planned'),
  week: __cardAttr('fitness', '[data-fitness-week-count]', 'data-fitness-week-count'),
  text: __cardText('fitness')
})`)
check('**健身卡片显示今天的训练**（来自训练计划编排：腿）', fitCard.planned === '腿', `今天该练=${fitCard.planned}`)
check('健身卡片显示本周训练次数与打卡状态',
  fitCard.week === String(expectedWeekCount) && fitCard.text.includes('今天已打卡'),
  `本周=${fitCard.week}（期望 ${expectedWeekCount}）| ${fitCard.text.slice(0, 90)}`)

// ============ 3. 播种：两餐记录 → 饮食卡片状态 ============
await evaluate(`(async () => {
  const api = window.lifeos;
  await api.diet.upsertMeal({ date: '${D.today}', type: 'breakfast', items: [{ name: '燕麦', calories: 150, protein: 5, carbs: 27, fat: 3 }] });
  await api.diet.upsertMeal({ date: '${D.today}', type: 'lunch', items: [{ name: '鸡胸', calories: 165, protein: 31, carbs: 0, fat: 3.6 }] });
  return true;
})()`)
await backToToday()

const dietCard = await evaluate(`({
  recorded: __cardAttr('diet', '[data-diet-recorded]', 'data-diet-recorded'),
  kcal: __cardAttr('diet', '[data-diet-calories]', 'data-diet-calories'),
  breakfast: __cardAttr('diet', '[data-diet-meal="breakfast"]', 'data-meal-logged'),
  lunch: __cardAttr('diet', '[data-diet-meal="lunch"]', 'data-meal-logged'),
  dinner: __cardAttr('diet', '[data-diet-meal="dinner"]', 'data-meal-logged'),
  snack: __cardAttr('diet', '[data-diet-meal="snack"]', 'data-meal-logged')
})`)
check('**饮食卡片显示三餐打卡状态**（早/午 已记录，晚/加餐 未记录）',
  dietCard.breakfast === 'true' && dietCard.lunch === 'true' &&
  dietCard.dinner === 'false' && dietCard.snack === 'false' &&
  dietCard.recorded === '2', JSON.stringify(dietCard))
check('饮食卡片显示今日热量合计（150 + 165 = 315 kcal）', dietCard.kcal === '315', `kcal=${dietCard.kcal}`)
await shot('40-m4-today-cards')

// ============ 4. 点击卡片跳转对应模块 ============
await evaluate(`__openCard('fitness'); true`)
const toFitness = await waitFor(`document.querySelector('main').innerText.includes('一周安排')`, 6000)
check('健身卡片「进入模块」跳转到健身页', toFitness)

await backToToday()
await evaluate(`__openCard('diet'); true`)
const toDiet = await waitFor(`document.querySelector('[data-plan-strip]') !== null`, 6000)
check('饮食卡片「进入模块」跳转到饮食页', toDiet)

// ============ 5. 数据变化后卡片跟随 ============
await backToToday()
await evaluate(`(async () => {
  const api = window.lifeos;
  const today = '${D.today}';
  const meals = await api.diet.listMeals(today, today);
  const dinner = meals.find((m) => m.type === 'dinner');
  if (dinner) await api.diet.removeMeal(dinner.id);
  await api.diet.upsertMeal({ date: today, type: 'dinner', items: [{ name: '米饭', calories: 200, protein: 4, carbs: 45, fat: 0.5 }] });
  return true;
})()`)
await backToToday()
const after = await evaluate(`({
  recorded: __cardAttr('diet', '[data-diet-recorded]', 'data-diet-recorded'),
  kcal: __cardAttr('diet', '[data-diet-calories]', 'data-diet-calories'),
  dinner: __cardAttr('diet', '[data-diet-meal="dinner"]', 'data-meal-logged')
})`)
check('新增晚餐后卡片状态跟随（3/4 餐、515 kcal）',
  after.recorded === '3' && after.kcal === '515' && after.dinner === 'true', JSON.stringify(after))

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
