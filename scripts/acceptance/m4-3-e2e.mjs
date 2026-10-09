// M4-3 游戏娱乐模块 端到端验收（对应 PRD 4.7 / 8.7.3 / 界面 L111 + 用户增强要求）
// 增强点：① 游玩记录支持本周/本月/全部区间切换 ② 支持按游戏筛选 ③ 影视与书籍分开为两个页签
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
  window.__pick = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
  window.__text = () => document.querySelector('main').innerText;
  true;
`
await evaluate(HELPERS)

const D = await evaluate(`(() => {
  const p = (n) => String(n).padStart(2, '0');
  const fmt = (d) => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d); };
  const now = new Date();
  const today = fmt(now);
  const g = new Date(today + 'T00:00:00').getDay();
  const iso = g === 0 ? 7 : g;
  const monthFirst = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-01';
  const lastMonth = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 15));
  const dayBeforeWeek = shift(-iso);
  return { today, iso, monthFirst, lastMonth, dayBeforeWeek, monday: shift(-(iso - 1)) };
})()`)
// 「本月但不在本周」的日期：若本周一不是 1 号则存在，用它验证区间切换的差异
const extraDate = D.dayBeforeWeek >= D.monthFirst ? D.dayBeforeWeek : null
console.log(`日期基准：今天 ${D.today}（周${D.iso}）· 本周一 ${D.monday} · 本月 1 号 ${D.monthFirst} · 上月样例 ${D.lastMonth}`)
console.log(`本月但非本周的样例日期：${extraDate ?? '（本月 1 号即周一，跳过该项）'}`)
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

// ============ 1. 进入页面 + 四个页签 ============
await evaluate(`__goto('今天'); true`)
await sleep(500)
await evaluate(`__goto('游戏娱乐'); true`)
await waitFor(`document.querySelectorAll('[data-tab]').length === 4`)
check('侧边栏「游戏娱乐」可进入，**四个页签**（游玩记录 / 愿望单 / 影视 / 书籍）',
  (await evaluate(`document.querySelectorAll('[data-tab]').length`)) === 4,
  await evaluate(`[...document.querySelectorAll('[data-tab]')].map(e => e.textContent).join(' / ')`))

await evaluate(`document.querySelector('[data-tab="plays"]')?.click(); true`)
await sleep(400)
check('「游玩记录」页签可切换，空状态提示正常',
  (await attr('[data-tab="plays"]', 'data-tab-active')) === 'true' &&
  (await evaluate(`__text().includes('还没有游玩记录')`)))

await evaluate(`document.querySelector('[data-tab="wishlist"]')?.click(); true`)
await sleep(400)
check('切到「愿望单」页签', (await attr('[data-tab="wishlist"]', 'data-tab-active')) === 'true' &&
  (await evaluate(`__text().includes('愿望单还是空的')`)))
await evaluate(`document.querySelector('[data-tab="screen"]')?.click(); true`)
await sleep(400)
check('切到「影视」页签（三个状态分组齐全，且只允许电影/剧集）',
  (await attr('[data-tab="screen"]', 'data-tab-active')) === 'true' &&
  (await evaluate(`document.querySelectorAll('[data-media-scope="screen"] [data-media-group]').length === 3`)) &&
  (await evaluate(`[...document.querySelectorAll('[data-media-scope="screen"] [data-media-type] option')].map(o => o.value).join(',') === 'movie,series'`)),
  await evaluate(`[...document.querySelectorAll('[data-media-scope="screen"] [data-media-type] option')].map(o => o.textContent).join('/')`))
await evaluate(`document.querySelector('[data-tab="book"]')?.click(); true`)
await sleep(400)
check('切到「书籍」页签（**类型下拉只有书籍**）',
  (await attr('[data-tab="book"]', 'data-tab-active')) === 'true' &&
  (await evaluate(`[...document.querySelectorAll('[data-media-scope="book"] [data-media-type] option')].map(o => o.value).join(',') === 'book'`)),
  await evaluate(`[...document.querySelectorAll('[data-media-scope="book"] [data-media-type] option')].map(o => o.textContent).join('/')`))

// ============ 2. 游玩记录：区间切换 ============
await evaluate(`document.querySelector('[data-tab="plays"]')?.click(); true`)
await sleep(400)
const addPlay = async (game, minutes, date) => {
  await evaluate(`(async () => {
    window.__set(document.querySelector('[data-play-game]'), '${game}');
    window.__set(document.querySelector('[data-play-date]'), '${date}');
    window.__set(document.querySelector('[data-play-minutes]'), ${minutes});
    return true;
  })()`)
  await sleep(200)
  await evaluate(`document.querySelector('[data-action="add-play"]')?.click(); true`)
  await sleep(800)
}
await addPlay('老头环', 90, D.today)
await addPlay('老头环', 30, D.today)
await addPlay('丝之歌', 300, D.lastMonth)
if (extraDate) await addPlay('塞尔达', 60, extraDate)

const expectedWeek = 120
const expectedMonth = extraDate ? 180 : 120
const expectedAll = extraDate ? 480 : 420

const readRange = async () => ({
  minutes: await attr('[data-range-minutes]', 'data-range-minutes'),
  active: await evaluate(`[...document.querySelectorAll('[data-range]')].find(e => e.getAttribute('data-range-active') === 'true')?.getAttribute('data-range')`),
  rows: await evaluate(`document.querySelectorAll('[data-play-row]').length`),
  games: await evaluate(`[...document.querySelectorAll('[data-game-summary]')].map(e => e.getAttribute('data-game-summary'))`)
})

const weekView = await readRange()
check('**默认按本周统计**（90 + 30 = 120 分钟，仅 1 个游戏）',
  weekView.active === 'week' && weekView.minutes === String(expectedWeek) && weekView.games.join(',') === '老头环',
  JSON.stringify(weekView))

await evaluate(`document.querySelector('[data-range="month"]')?.click(); true`)
await sleep(600)
const monthView = await readRange()
check('切到「本月」：包含本月但非本周的记录',
  monthView.active === 'month' && monthView.minutes === String(expectedMonth),
  JSON.stringify(monthView))

await evaluate(`document.querySelector('[data-range="all"]')?.click(); true`)
await sleep(600)
const allView = await readRange()
check('切到「全部」：跨月记录一并计入（按游戏聚合的总时长）',
  allView.active === 'all' && allView.minutes === String(expectedAll) && allView.games.includes('丝之歌'),
  JSON.stringify(allView))
check('「全部」下聚合按总时长降序（丝之歌 300 在前）', allView.games[0] === '丝之歌', allView.games.join(' > '))

// ============ 3. 按游戏筛选 ============
await evaluate(`__pick('[data-play-filter]', '老头环'); true`)
await sleep(600)
const filtered = await readRange()
check('**按游戏筛选**：聚合与明细只剩该游戏，总时长同步（老头环 90 + 30 = 120）',
  filtered.minutes === '120' && filtered.games.join(',') === '老头环' && filtered.rows === 2,
  JSON.stringify(filtered))
await shot('37-m4-ent-plays')

await evaluate(`__pick('[data-play-filter]', ''); true`)
await sleep(600)
const cleared = await readRange()
check('筛选可清除（回到全部游戏）', cleared.games.length === 3 && cleared.minutes === String(expectedAll), JSON.stringify(cleared))

// 点聚合行也能筛选
await evaluate(`document.querySelector('[data-game-summary="丝之歌"]')?.click(); true`)
await sleep(600)
const byRow = await evaluate(`({
  filter: document.querySelector('[data-play-filter]')?.value,
  games: [...document.querySelectorAll('[data-game-summary]')].map(e => e.getAttribute('data-game-summary')),
  rowText: document.querySelector('[data-play-row]')?.innerText.replace(/\\n+/g, ' | ')
})`)
check('点击聚合行即可筛选（再次点击取消）',
  byRow.filter === '丝之歌' && byRow.games.join(',') === '丝之歌' && byRow.rowText.includes('丝之歌'),
  JSON.stringify(byRow))
await evaluate(`__pick('[data-play-filter]', ''); true`)
await sleep(500)

// ============ 4. 删除一条 → 聚合同步 ============
const eldenRowId = await evaluate(`[...document.querySelectorAll('[data-play-row]')].find(e => e.innerText.includes('老头环'))?.getAttribute('data-play-row')`)
await evaluate(`document.querySelector('[data-action="del-play-${eldenRowId}"]')?.click(); true`)
await sleep(900)
const afterDel = await evaluate(`({
  total: document.querySelector('[data-game-summary="老头环"]')?.getAttribute('data-total-minutes'),
  sessions: document.querySelector('[data-game-summary="老头环"]')?.getAttribute('data-sessions'),
  range: document.querySelector('[data-range-minutes]')?.getAttribute('data-range-minutes')
})`)
check('删除一条后聚合同步（老头环 120 → 90，总时长 480 → 450）',
  afterDel.total === '90' && afterDel.sessions === '1' && afterDel.range === String(expectedAll - 30),
  JSON.stringify(afterDel))

// ============ 5. 愿望单优先级排序 ============
await evaluate(`document.querySelector('[data-tab="wishlist"]')?.click(); true`)
await sleep(400)
const addWish = async (name, platform, priority) => {
  await evaluate(`(async () => {
    window.__set(document.querySelector('[data-wish-name]'), '${name}');
    window.__set(document.querySelector('[data-wish-platform]'), '${platform}');
    window.__pick('[data-wish-priority]', '${priority}');
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
await shot('38-m4-ent-wishlist')

// ============ 6. 影视：电影 + 剧集 ============
await evaluate(`document.querySelector('[data-tab="screen"]')?.click(); true`)
await sleep(400)
const addMedia = async (title, type, status, star, comment) => {
  await evaluate(`(async () => {
    window.__set(document.querySelector('[data-media-title]'), '${title}');
    window.__set(document.querySelector('[data-media-comment]'), '${comment}');
    window.__set(document.querySelector('[data-media-date]'), '${D.today}');
    window.__pick('[data-media-type]', '${type}');
    window.__pick('[data-media-status]', '${status}');
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
await addMedia('怪奇物语', 'series', 'doing', 5, '第五季')

const screenTab = await evaluate(`(async () => {
  const rows = await window.lifeos.ent.listMedia();
  const dune = rows.find(r => r.title === '沙丘 2');
  return {
    total: document.querySelector('[data-media-scope="screen"] [data-media-total]')?.getAttribute('data-media-total'),
    types: [...document.querySelectorAll('[data-media-scope="screen"] [data-media-row]')].map(e => e.getAttribute('data-media-type-row')),
    duneRating: document.querySelector('[data-media-row="' + dune.id + '"] [data-star-rating]')?.getAttribute('data-rating'),
    duneText: document.querySelector('[data-media-row="' + dune.id + '"]')?.innerText.replace(/\\n+/g, ' | '),
    dbRating: dune.rating,
    dbComment: dune.comment
  };
})()`)
check('**影视页签只含电影与剧集**（2 条，无书籍）',
  screenTab.total === '2' && [...screenTab.types].sort().join(',') === 'movie,series', JSON.stringify(screenTab.types))
check('影视记录五星评分与短评（4 星 + 短评）',
  screenTab.duneRating === '4' && screenTab.dbRating === 4 && screenTab.dbComment === '视听盛宴' &&
  screenTab.duneText.includes('视听盛宴'),
  JSON.stringify({ stars: screenTab.duneRating, db: screenTab.dbRating, comment: screenTab.dbComment }))
await shot('39-m4-ent-screen')

// ============ 7. 书籍：与影视分开 ============
await evaluate(`document.querySelector('[data-tab="book"]')?.click(); true`)
await sleep(400)
const bookEmpty = await evaluate(`({
  total: document.querySelector('[data-media-scope="book"] [data-media-total]')?.getAttribute('data-media-total'),
  rows: document.querySelectorAll('[data-media-scope="book"] [data-media-row]').length
})`)
check('**书籍页签与影视分开**：新建后书籍栏为空（影视不串栏）',
  bookEmpty.total === '0' && bookEmpty.rows === 0, JSON.stringify(bookEmpty))

await addMedia('三体', 'book', 'doing', 5, '正在读第二部')
const bookTab = await evaluate(`({
  total: document.querySelector('[data-media-scope="book"] [data-media-total]')?.getAttribute('data-media-total'),
  types: [...document.querySelectorAll('[data-media-scope="book"] [data-media-row]')].map(e => e.getAttribute('data-media-type-row')),
  text: document.querySelector('[data-media-row]')?.innerText.replace(/\\n+/g, ' | ')
})`)
check('书籍栏只含书籍，评分与短评正常',
  bookTab.total === '1' && bookTab.types.join(',') === 'book' && bookTab.text.includes('正在读第二部'),
  JSON.stringify(bookTab))
await shot('41-m4-ent-books')

await evaluate(`document.querySelector('[data-tab="screen"]')?.click(); true`)
await sleep(500)
const screenUnchanged = await evaluate(`document.querySelector('[data-media-scope="screen"] [data-media-total]')?.getAttribute('data-media-total')`)
check('回到影视页签，书籍没有混进来（仍为 2 条）', screenUnchanged === '2', `影视=${screenUnchanged}`)

// ============ 8. 星级再点清零 ============
const duneId = await evaluate(`(async () => (await window.lifeos.ent.listMedia()).find(r => r.title === '沙丘 2').id)()`)
await evaluate(`document.querySelector('[data-star-rating="row-${duneId}"] [data-star="4"]')?.click(); true`)
await sleep(900)
check('再点同一颗星清零（回到未评分 0）',
  (await attr(`[data-media-row="${duneId}"] [data-star-rating]`, 'data-rating')) === '0')

// ============ 9. 刷新后数据仍在 ============
await send('Page.reload', {})
await sleep(2000)
await waitFor(`!!document.querySelector('aside')`, 10000)
await evaluate(HELPERS)
await evaluate(`__goto('游戏娱乐'); true`)
await sleep(1200)
const persisted = await evaluate(`(async () => ({
  plays: (await window.lifeos.ent.listPlays()).length,
  wish: (await window.lifeos.ent.listWishlist()).length,
  media: (await window.lifeos.ent.listMedia()).length
}))()`)
await evaluate(`document.querySelector('[data-tab="book"]')?.click(); true`)
await sleep(600)
const persistedBook = await evaluate(`document.querySelector('[data-media-scope="book"] [data-media-total]')?.getAttribute('data-media-total')`)
check('刷新后游玩/愿望单/影视书籍数据仍在，页签结构保持',
  persisted.plays === 3 && persisted.wish === 3 && persisted.media === 3 && persistedBook === '1',
  JSON.stringify({ ...persisted, book: persistedBook }))

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
