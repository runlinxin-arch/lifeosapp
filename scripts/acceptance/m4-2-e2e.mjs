// M4-2 饮食模块 端到端验收（对应 PRD 4.6 / 8.7.2 / 界面 L109）
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
  // 失焦保存：窗口无 OS 焦点时 el.blur() 不派发 focusout（React onBlur 监听此事件），改显式派发，不依赖窗口焦点。
  window.__blur = (el) => { el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); };
  window.__clickText = (t) => { [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t)?.click(); };
  window.__text = () => document.querySelector('main').innerText;
  true;
`
await evaluate(HELPERS)

// ============ 日期基准 ============
const D = await evaluate(`(() => {
  const p = (n) => String(n).padStart(2, '0');
  const fmt = (d) => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d); };
  return { today: fmt(new Date()), tomorrow: shift(1), dayAfter: shift(2) };
})()`)
console.log(`日期基准：今天 ${D.today}，明天 ${D.tomorrow}`)
console.log('')

// ============ 0. 清空饮食数据 ============
const cleaned = await evaluate(`(async () => {
  const api = window.lifeos;
  let n = 0;
  for (const m of await api.diet.listMeals()) { await api.diet.removeMeal(m.id); n++ }
  for (const p of await api.diet.listPlans()) { await api.diet.removePlan(p.id); n++ }
  return n;
})()`)
check('清空既有饮食数据（脚本可重复运行）', typeof cleaned === 'number', `清理 ${cleaned} 条`)

// ============ 1. 进入饮食页 ============
await evaluate(`__goto('今天'); true`)
await sleep(500)
await evaluate(`__goto('饮食'); true`)
const onPage = await waitFor(`document.querySelectorAll('[data-meal-card]').length === 4`)
check('侧边栏「饮食」可进入（导航已启用）', onPage)
const emptyCards = await evaluate(`document.querySelectorAll('[data-meal-empty]').length`)
check('四张餐卡均为虚线占位（未记录）', emptyCards === 4, `${emptyCards} 张占位`)
check('空状态提示「这一天还没有记录」', await evaluate(`__text().includes('这一天还没有记录')`))
await shot('34-m4-diet-empty')

// ============ 2. 记录早餐（一项食物） ============
const attr = (sel, name) => evaluate(`(document.querySelector('${sel}')?.getAttribute('${name}')) ?? null`)
const fillFood = async (type, i, name, calories, protein, carbs, fat) => {
  if (!(await evaluate(`!!document.querySelector('[data-food-name="${i}"]')`))) {
    await evaluate(`__clickText('＋ 添加食物'); true`)
    await waitFor(`!!document.querySelector('[data-food-name="${i}"]')`, 4000)
  }
  await evaluate(`(async () => {
    window.__set(document.querySelector('[data-food-name="${i}"]'), '${name}');
    window.__set(document.querySelector('[data-food-calories="${i}"]'), ${calories});
    window.__set(document.querySelector('[data-food-protein="${i}"]'), ${protein});
    window.__set(document.querySelector('[data-food-carbs="${i}"]'), ${carbs});
    window.__set(document.querySelector('[data-food-fat="${i}"]'), ${fat});
    return true;
  })()`)
  await sleep(200)
}
await evaluate(`document.querySelector('[data-action="log-breakfast"]')?.click(); true`)
await sleep(300)
await fillFood('breakfast', 0, '燕麦', 150, 5, 27, 3)
await evaluate(`document.querySelector('[data-action="save-breakfast"]')?.click(); true`)
const breakfastLogged = await waitFor(`!!document.querySelector('[data-meal-logged="breakfast"]')`)
check('早餐可记录食物并显示热量',
  breakfastLogged && (await attr('[data-meal-card="breakfast"] [data-meal-calories]', 'data-meal-calories')) === '150',
  await attr('[data-meal-card="breakfast"] [data-meal-calories]', 'data-meal-calories'))

// ============ 3. 午餐两份食物 ============
await evaluate(`document.querySelector('[data-action="log-lunch"]')?.click(); true`)
await sleep(300)
await fillFood('lunch', 0, '米饭', 200, 4, 45, 0.5)
await fillFood('lunch', 1, '鸡胸', 165, 31, 0, 3.6)
await evaluate(`document.querySelector('[data-action="save-lunch"]')?.click(); true`)
const lunchLogged = await waitFor(`!!document.querySelector('[data-meal-logged="lunch"]')`)
const lunchText = await evaluate(`document.querySelector('[data-meal-logged="lunch"]').innerText.replace(/\\n+/g, ' | ')`)
check('每餐可录入多食物及热量营养（米饭 + 鸡胸 → 365 kcal）',
  lunchLogged && lunchText.includes('365') && lunchText.includes('米饭') && lunchText.includes('鸡胸'),
  lunchText.slice(0, 150))

// ============ 4. 晚餐空打卡（只记这顿吃了） ============
await evaluate(`document.querySelector('[data-action="log-dinner"]')?.click(); true`)
await sleep(300)
await evaluate(`document.querySelector('[data-action="save-dinner"]')?.click(); true`)
const dinnerLogged = await waitFor(`document.querySelector('[data-meal-logged="dinner"]')?.innerText.includes('只记了')`)
check('允许空打卡（只记「这顿吃了」）', dinnerLogged)

// ============ 5. 每日合计正确 ============
const panel = await evaluate(`({
  kcal: document.querySelector('[data-nutrition-calories]')?.getAttribute('data-nutrition-calories'),
  p: document.querySelector('[data-nutrition-protein]')?.getAttribute('data-nutrition-protein'),
  c: document.querySelector('[data-nutrition-carbs]')?.getAttribute('data-nutrition-carbs'),
  f: document.querySelector('[data-nutrition-fat]')?.getAttribute('data-nutrition-fat'),
  breakfast: document.querySelector('[data-nutrition-meal="breakfast"]').innerText.replace(/\\n+/g, ' '),
  lunch: document.querySelector('[data-nutrition-meal="lunch"]').innerText.replace(/\\n+/g, ' '),
  dinner: document.querySelector('[data-nutrition-meal="dinner"]').innerText.replace(/\\n+/g, ' ')
})`)
check('每日合计正确：515 kcal / 蛋白 40 / 碳水 72 / 脂肪 7.1',
  panel.kcal === '515' && panel.p === '40' && panel.c === '72' && panel.f === '7.1',
  JSON.stringify(panel))
check('按餐次小计正确（早餐 150 / 午餐 365 / 晚餐 0）',
  panel.breakfast.includes('150') && panel.lunch.includes('365') && panel.dinner.includes('0'),
  `${panel.breakfast} || ${panel.lunch} || ${panel.dinner}`)
await shot('35-m4-diet-logged')

// ============ 6. 同日同餐再次保存是覆盖 ============
await evaluate(`document.querySelector('[data-action="edit-lunch"]')?.click(); true`)
await sleep(400)
await evaluate(`window.__set(document.querySelector('[data-food-calories="1"]'), 265); true`)
await sleep(200)
await evaluate(`document.querySelector('[data-action="save-lunch"]')?.click(); true`)
// 等合计按新数值重算（替代固定 sleep）
const kcalUpdated = await waitFor(`document.querySelector('[data-nutrition-calories]')?.getAttribute('data-nutrition-calories') === '615'`, 8000)
if (!kcalUpdated) console.log('  [diag] 覆盖保存后合计未在 8s 内变为 615')
const todayMeals = await evaluate(`(async () => (await window.lifeos.diet.listMeals('${D.today}', '${D.today}')).length)()`)
const kcalAfter = await attr('[data-nutrition-calories]', 'data-nutrition-calories')
check('同日同餐再次保存是覆盖（当天记录数仍为 3）', todayMeals === 3, `当天记录数=${todayMeals}`)
check('覆盖后合计按新数值重算（150 + 465 = 615 kcal）', kcalAfter === '615', `kcal=${kcalAfter}`)

// ============ 7. 取消打卡回到虚线占位 ============
await evaluate(`document.querySelector('[data-action="clear-breakfast"]')?.click(); true`)
const backToEmpty = await waitFor(`!!document.querySelector('[data-meal-empty="breakfast"]')`)
const kcalAfterClear = await attr('[data-nutrition-calories]', 'data-nutrition-calories')
check('取消打卡后卡片回到虚线占位', backToEmpty)
check('取消后合计相应减少（615 − 150 = 465 kcal）', kcalAfterClear === '465', `kcal=${kcalAfterClear}`)

// ============ 8. 计划横条（7 天 + 左右翻页） ============
const stripDays = await evaluate(`document.querySelectorAll('[data-plan-day]').length`)
const todaySelected = (await attr('[data-plan-day="' + D.today + '"]', 'data-day-selected')) === 'true'
check('计划横条渲染 7 天，今天默认选中', stripDays === 7 && todaySelected, `${stripDays} 格`)

// 翻页：› 进未来一周（今天不在视口），‹ 回到本周（今天可见）
await evaluate(`document.querySelector('[data-plan-next]')?.click(); true`)
await sleep(300)
const nextDays = await evaluate(`[...document.querySelectorAll('[data-plan-day]')].map(el => el.getAttribute('data-plan-day'))`)
check('右翻页进入未来一周（今天不在视口）',
  nextDays.length === 7 && !nextDays.includes(D.today), `${nextDays[0]}..${nextDays[6]}`)
await evaluate(`document.querySelector('[data-plan-prev]')?.click(); true`)
await sleep(300)
check('左翻页回到本周（今天可见）',
  await evaluate(`!!document.querySelector('[data-plan-day="${D.today}"]')`))

// ============ 9. 为明天编排午餐 ============
await evaluate(`document.querySelector('[data-plan-day="${D.tomorrow}"]')?.click(); true`)
await sleep(500)
check('点击横条某天可切换查看日期',
  (await attr('[data-diet-date]', 'data-diet-date')) === D.tomorrow,
  await attr('[data-diet-date]', 'data-diet-date'))

// 聚焦 + 写入（分成两次 CDP 往返，贴近真人"先点进输入框再打字"）
const focused = await evaluate(`(() => {
  const el = document.querySelector('[data-plan-input="lunch"]');
  el.focus();
  window.__set(el, '鸡胸沙拉 + 糙米');
  return { active: document.activeElement === el, value: el.value };
})()`)
check('计划输入框可聚焦并写入', focused.active === true && focused.value === '鸡胸沙拉 + 糙米', JSON.stringify(focused))

// 失焦保存：与 m4-1 编排保存同款——同一 evaluate 内 set → 等 React flush → 再 blur，
// 避免"输入后立即失焦"时 onChange 尚未落进状态的竞态（此前偶发假失败）。
const t0 = Date.now()
await evaluate(`(async () => {
  const el = document.querySelector('[data-plan-input="lunch"]');
  el.focus(); window.__set(el, '鸡胸沙拉 + 糙米');
  await new Promise(r => setTimeout(r, 150));
  window.__blur(el);
  return true;
})()`)
const planSaved = await waitFor(`document.querySelector('[data-plan-count]')?.getAttribute('data-plan-count') === '1'`, 6000)
const saveMs = Date.now() - t0
const dbPlanCount = await evaluate(`(async () => (await window.lifeos.diet.listPlans('${D.tomorrow}', '${D.tomorrow}')).length)()`)
console.log(`  [diag] 失焦保存：界面生效=${planSaved} 耗时=${saveMs}ms 库中计划数=${dbPlanCount}`)

const planAndCell = await evaluate(`({
  count: document.querySelector('[data-plan-count]')?.getAttribute('data-plan-count'),
  cell: document.querySelector('[data-plan-day="${D.tomorrow}"]')?.getAttribute('data-day-planned'),
  cardText: document.querySelector('[data-meal-card="lunch"]')?.innerText.replace(/\\n+/g, ' | '),
  stillEmpty: !!document.querySelector('[data-meal-empty="lunch"]')
})`)
check('为未来日期编排午餐 → 计划数 +1，横条摘要同步',
  planAndCell.count === '1' && planAndCell.cell === '1', JSON.stringify({ count: planAndCell.count, cell: planAndCell.cell }))
check('餐卡显示当天计划文本，且打卡仍是虚线占位（计划与打卡互不覆盖）',
  planAndCell.cardText.includes('鸡胸沙拉') && planAndCell.stillEmpty,
  planAndCell.cardText.slice(0, 120))
await shot('36-m4-diet-plan')

// ============ 10. 计划与打卡互不覆盖（今天的打卡不受影响） ============
await evaluate(`document.querySelector('[data-plan-day="${D.today}"]')?.click(); true`)
await sleep(600)
const todayStillLogged = await evaluate(`!!document.querySelector('[data-meal-logged="lunch"]')`)
const todayLunchKcal = await attr('[data-meal-card="lunch"] [data-meal-calories]', 'data-meal-calories')
check('为明天编排不影响今天的打卡记录（午餐 465 kcal 仍在）',
  todayStillLogged && todayLunchKcal === '465', `kcal=${todayLunchKcal}`)

// ============ 11. 刷新后计划仍在 ============
await send('Page.reload', {})
await sleep(2000)
await waitFor(`!!document.querySelector('aside')`, 10000)
await evaluate(HELPERS)
await evaluate(`__goto('饮食'); true`)
await sleep(1500)
await evaluate(`document.querySelector('[data-plan-day="${D.tomorrow}"]')?.click(); true`)
const planRestored = await waitFor(`document.querySelector('[data-plan-input="lunch"]')?.value === '鸡胸沙拉 + 糙米'`, 8000)
if (!planRestored) console.log('  [diag] 刷新后未在 8s 内读回计划文本')
const persisted = await evaluate(`({
  input: document.querySelector('[data-plan-input="lunch"]')?.value,
  count: document.querySelector('[data-plan-count]')?.getAttribute('data-plan-count')
})`)
check('刷新后未来日期的计划仍保持', persisted.input === '鸡胸沙拉 + 糙米' && persisted.count === '1', JSON.stringify(persisted))

// ============ 12. 清空计划并保存 = 删除 ============
await evaluate(`(async () => {
  const el = document.querySelector('[data-plan-input="lunch"]');
  el.focus(); window.__set(el, '');
  await new Promise(r => setTimeout(r, 150));
  window.__blur(el);
  return true;
})()`)
// 等计划真正被删除（替代固定 sleep）
const planCleared = await waitFor(`(async () => (await window.lifeos.diet.listPlans('${D.tomorrow}', '${D.tomorrow}')).length === 0)()`, 8000)
if (!planCleared) console.log('  [diag] 清空后计划未在 8s 内删除')
const afterClear = await evaluate(`(async () => ({
  count: document.querySelector('[data-plan-count]')?.getAttribute('data-plan-count'),
  cell: document.querySelector('[data-plan-day="${D.tomorrow}"]')?.getAttribute('data-day-planned'),
  stored: (await window.lifeos.diet.listPlans('${D.tomorrow}', '${D.tomorrow}')).length
}))()`)
check('清空计划文本并保存 = 删除该计划（不留空记录）',
  afterClear.count === '0' && afterClear.cell === '0' && afterClear.stored === 0, JSON.stringify(afterClear))

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
