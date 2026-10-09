// M4-3 游戏娱乐模块 端到端验收（对应 PRD 4.7 / 8.7.3 / 界面 L111）
// 运行前置：npm run build 后，应用以 --remote-debugging-port=9222 启动
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
const attr = (sel, name) => evaluate(`(document.querySelector('${sel}')?.getAttribute('${name}')) ?? null`)

const HELPERS = `
  window.__goto = (name) => { [...document.querySelectorAll('aside button')].find(b => b.textContent.includes(name))?.click(); };
  window.__set = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  window.__text = () => document.querySelector('main').innerText;
  true;
`
await evaluate(HELPERS)

const D = await evaluate(`(() => {
  const p = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return { today: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) };
})()`)
console.log(`日期基准：今天 ${D.today}`)
console.log('')

// ============ 0. 清空数据 ============
const cleaned = await evaluate(`(async () => {
  const api = window.lifeos;
  let n = 0;
  for (const p of await api.ent.listPlays()) { await api.ent.removePlay(p.id); n++ }
  for (const w of await api.ent.listWishlist()) { await api.ent.removeWish(w.id); n++ }
  for (const m of await api.ent.listMedia()) { await api.ent.removeMedia(m.id); n++ }
  return n;
})()`)
check('清空既有游戏娱乐数据（脚本可重复运行）', typeof cleaned === 'number', `清理 ${cleaned} 条`)

// ============ 1. 进入页面 + 三页签 ============
await evaluate(`__goto('今天'); true`)
await sleep(500)
await evaluate(`__goto('游戏娱乐'); true`)
const onPage = await waitFor(`document.querySelectorAll('[data-tab]').length === 3`)
check('侧边栏「游戏娱乐」可进入（导航已启用）', onPage)
// 页签状态存在 store 里、进程内保留，因此显式切回「游玩记录」再断言（保证脚本可重复运行）
await evaluate(`document.querySelector('[data-tab="plays"]')?.click(); true`)
await sleep(400)
check('「游玩记录」页签可切换，空状态提示「还没有游玩记录」',
  (await attr('[data-tab="plays"]', 'data-tab-active')) === 'true' &&
  (await evaluate(`__text().includes('还没有游玩记录')`)))

await evaluate(`document.querySelector('[data-tab="wishlist"]')?.click(); true`)
await sleep(400)
check('切到「愿望单」页签', (await attr('[data-tab="wishlist"]', 'data-tab-active')) === 'true' &&
  (await evaluate(`__text().includes('愿望单还是空的')`)))
await evaluate(`document.querySelector('[data-tab="media"]')?.click(); true`)
await sleep(400)
check('切到「影视书」页签（三个分组都在）',
  (await attr('[data-tab="media"]', 'data-tab-active')) === 'true' &&
  (await evaluate(`document.querySelectorAll('[data-media-group]').length === 3`)))
await evaluate(`document.querySelector('[data-tab="plays"]')?.click(); true`)
await sleep(400)

// ============ 2. 游玩记录：同一游戏两条 → 聚合 ============
const addPlay = async (game, minutes) => {
  await evaluate(`(async () => {
    window.__set(document.querySelector('[data-play-game]'), '${game}');
    window.__set(document.querySelector('[data-play-date]'), '${D.today}');
    window.__set(document.querySelector('[data-play-minutes]'), ${minutes});
    return true;
  })()`)
  await sleep(200)
  await evaluate(`document.querySelector('[data-action="add-play"]')?.click(); true`)
  await sleep(800)
}
await addPlay('老头环', 90)
check('记录一条游玩（90 分钟）', (await attr('[data-game-summary="老头环"]', 'data-total-minutes')) === '90')
await addPlay('老头环', 30)
const elden = await evaluate(`({
  total: document.querySelector('[data-game-summary="老头环"]')?.getAttribute('data-total-minutes'),
  sessions: document.querySelector('[data-game-summary="老头环"]')?.getAttribute('data-sessions'),
  text: document.querySelector('[data-game-summary="老头环"]')?.innerText.replace(/\\n+/g, ' | ')
})`)
check('**按游戏自动聚合计总时长**：90 + 30 = 120 分钟、2 次',
  elden.total === '120' && elden.sessions === '2' && elden.text.includes('2h'), JSON.stringify(elden))
check('明细列出两条记录', (await evaluate(`document.querySelectorAll('[data-play-row]').length`)) === 2)

// ============ 3. 第二个游戏 → 按总时长降序 ============
await addPlay('丝之歌', 300)
const order = await evaluate(`[...document.querySelectorAll('[data-game-summary]')].map(e => e.getAttribute('data-game-summary'))`)
check('聚合按总时长降序（丝之歌 300 > 老头环 120）', JSON.stringify(order) === JSON.stringify(['丝之歌', '老头环']), JSON.stringify(order))
check('顶部累计时长 = 420 分钟（7h）',
  (await attr('[data-total-minutes]', 'data-total-minutes')) === '420' &&
  (await evaluate(`__text().includes('7h')`)))
await shot('37-m4-ent-plays')

// ============ 4. 删除一条 → 聚合同步 ============
// 明细按「日期倒序、同日 id 倒序」排列，取老头环那条 30 分钟的删掉
const eldenRowId = await evaluate(`[...document.querySelectorAll('[data-play-row]')].find(e => e.innerText.includes('老头环'))?.getAttribute('data-play-row')`)
await evaluate(`document.querySelector('[data-action="del-play-${eldenRowId}"]')?.click(); true`)
await sleep(900)
const afterDel = await evaluate(`({
  total: document.querySelector('[data-game-summary="老头环"]')?.getAttribute('data-total-minutes'),
  sessions: document.querySelector('[data-game-summary="老头环"]')?.getAttribute('data-sessions'),
  rows: document.querySelectorAll('[data-play-row]').length
})`)
check('删除一条后聚合同步（120 − 30 = 90 分钟、1 次）',
  afterDel.total === '90' && afterDel.sessions === '1' && afterDel.rows === 2, JSON.stringify(afterDel))

// ============ 5. 愿望单优先级排序 ============
await evaluate(`document.querySelector('[data-tab="wishlist"]')?.click(); true`)
await sleep(400)
const addWish = async (name, platform, priority) => {
  await evaluate(`(async () => {
    window.__set(document.querySelector('[data-wish-name]'), '${name}');
    window.__set(document.querySelector('[data-wish-platform]'), '${platform}');
    const sel = document.querySelector('[data-wish-priority]');
    sel.value = '${priority}';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  await sleep(200)
  await evaluate(`document.querySelector('[data-action="add-wish"]')?.click(); true`)
  await sleep(800)
}
await addWish('空洞骑士：丝之歌', 'PC', 'low')
await addWish('塞尔达传说', 'Switch', 'high')
await addWish('黑神话：悟空', 'PS5', 'mid')
const wishOrder = await evaluate(`[...document.querySelectorAll('[data-wish-row]')].map(e => e.getAttribute('data-wish-row') + ':' + e.getAttribute('data-priority'))`)
check('愿望单按优先级排序（高 → 中 → 低）',
  JSON.stringify(wishOrder) === JSON.stringify(['塞尔达传说:high', '黑神话：悟空:mid', '空洞骑士：丝之歌:low']),
  JSON.stringify(wishOrder))
check('愿望单计数为 3', (await attr('[data-wish-count]', 'data-wish-count')) === '3')

// 调整优先级后顺序跟随
const midId = await evaluate(`[...document.querySelectorAll('[data-wish-row]')].find(e => e.getAttribute('data-wish-row') === '空洞骑士：丝之歌')?.querySelector('[data-wish-prio]')?.getAttribute('data-wish-prio')`)
await evaluate(`(() => {
  const sel = document.querySelector('[data-wish-prio="${midId}"]');
  sel.value = 'high';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`)
await sleep(900)
const reordered = await evaluate(`[...document.querySelectorAll('[data-wish-row]')].map(e => e.getAttribute('data-priority'))`)
check('调整优先级后重新排序（低 → 高 后：高高 中）',
  JSON.stringify(reordered) === JSON.stringify(['high', 'high', 'mid']), JSON.stringify(reordered))
await shot('38-m4-ent-wishlist')

// ============ 6. 影视书：评分与短评 ============
await evaluate(`document.querySelector('[data-tab="media"]')?.click(); true`)
await sleep(400)
const addMedia = async (title, type, status, star, comment) => {
  await evaluate(`(async () => {
    window.__set(document.querySelector('[data-media-title]'), '${title}');
    window.__set(document.querySelector('[data-media-comment]'), '${comment}');
    window.__set(document.querySelector('[data-media-date]'), '${D.today}');
    const t = document.querySelector('[data-media-type]');
    t.value = '${type}'; t.dispatchEvent(new Event('change', { bubbles: true }));
    const s = document.querySelector('[data-media-status]');
    s.value = '${status}'; s.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  await sleep(250)
  if (star > 0) {
    await evaluate(`document.querySelector('[data-star-rating="new"] [data-star="${star}"]')?.click(); true`)
    await sleep(250)
  }
  await evaluate(`document.querySelector('[data-action="add-media"]')?.click(); true`)
  await sleep(900)
}
await addMedia('沙丘 2', 'movie', 'done', 4, '视听盛宴')
await addMedia('三体', 'book', 'doing', 5, '正在读第二部')
await addMedia('怪奇物语', 'series', 'planned', 0, '')

const mediaChecks = await evaluate(`(async () => {
  const rows = await window.lifeos.ent.listMedia();
  const dune = rows.find(r => r.title === '沙丘 2');
  const el = document.querySelector('[data-media-row="' + dune.id + '"]');
  return {
    rating: dune.rating,
    comment: dune.comment,
    rowStars: el?.querySelector('[data-star-rating]')?.getAttribute('data-rating'),
    rowText: el?.innerText.replace(/\\n+/g, ' | '),
    done: document.querySelector('[data-media-group="done"] [data-media-count]')?.getAttribute('data-media-count'),
    doing: document.querySelector('[data-media-group="doing"] [data-media-count]')?.getAttribute('data-media-count'),
    planned: document.querySelector('[data-media-group="planned"] [data-media-count]')?.getAttribute('data-media-count')
  };
})()`)
check('**影视书记录五星评分与短评**（4 星 + 短评）',
  mediaChecks.rating === 4 && mediaChecks.comment === '视听盛宴' && mediaChecks.rowStars === '4' &&
  mediaChecks.rowText.includes('视听盛宴'),
  JSON.stringify({ rating: mediaChecks.rating, stars: mediaChecks.rowStars, comment: mediaChecks.comment }))
const star = await evaluate(`document.querySelector('[data-star-rating="new"]')?.getAttribute('data-rating')`)
check('评分未选中时默认 0（未评分）', star === '0', `表单评分=${star}`)
check('**影视书按状态分组**（看完 1 / 在看 1 / 想看 1）',
  mediaChecks.done === '1' && mediaChecks.doing === '1' && mediaChecks.planned === '1',
  JSON.stringify({ done: mediaChecks.done, doing: mediaChecks.doing, planned: mediaChecks.planned }))
await shot('39-m4-ent-media')

// 点击同一颗星清零（未评分）
const duneId = await evaluate(`(async () => (await window.lifeos.ent.listMedia()).find(r => r.title === '沙丘 2').id)()`)
await evaluate(`document.querySelector('[data-star-rating="row-${duneId}"] [data-star="4"]')?.click(); true`)
await sleep(900)
const cleared = await attr(`[data-media-row="${duneId}"] [data-star-rating]`, 'data-rating')
check('再点同一颗星清零（回到未评分 0）', cleared === '0', `rating=${cleared}`)

// ============ 7. 刷新后数据仍在 ============
await send('Page.reload', {})
await sleep(2000)
await waitFor(`!!document.querySelector('aside')`, 10000)
await evaluate(HELPERS)
await evaluate(`__goto('游戏娱乐'); true`)
await sleep(1200)
const persisted = await evaluate(`({
  plays: document.querySelector('[data-game-summary="丝之歌"]')?.getAttribute('data-total-minutes'),
  rows: document.querySelectorAll('[data-play-row]').length
})`)
check('刷新后游玩记录与聚合仍在', persisted.plays === '300' && persisted.rows === 2, JSON.stringify(persisted))

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
