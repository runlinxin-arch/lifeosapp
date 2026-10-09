// M3-4「今天」页卡片接线 端到端验收
// 运行前置：应用以 --remote-debugging-port=9222 启动，且数据目录由 LIFEOS_DATA_DIR 指向临时目录
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

await evaluate(`
  window.__card = (k) => document.querySelector('[data-today-card="' + k + '"]');
  window.__cardText = (k) => { const c = __card(k); return c ? c.innerText : 'no-card'; };
  window.__goto = (name) => { [...document.querySelectorAll('aside button')].find(b => b.textContent.includes(name))?.click(); };
  true;
`)

// ============ 播种数据（走真实 IPC） ============
const seeded = await evaluate(`
  (async () => {
    const api = window.lifeos;
    const today = (() => { const d = new Date(); const p = n => String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); })();

    const item = await api.learn.createItem({ title: '【验收】今日学习项', status: 'learning', totalUnits: 10, doneUnits: 4 });
    await api.learn.createItem({ title: '【验收】未开始项', status: 'not_started' });
    await api.learn.createSession(item.id, today, 30);

    const proj = await api.dev.createProject({ name: '【验收】进行中项目', status: 'in_progress' });
    const t1 = await api.dev.createTask({ projectId: proj.id, title: 'T1', column: 'done' });
    await api.dev.createTask({ projectId: proj.id, title: 'T2', column: 'todo' });
    await api.dev.createBug({ projectId: proj.id, title: 'B1' });
    const started = today + ' 09:00';
    await api.dev.createSession(t1.id, started, today + ' 09:40', 40);
    await api.dev.createProject({ name: '【验收】计划中项目', status: 'planned' });

    return { itemId: item.id, projId: proj.id, today };
  })()
`)
check('播种数据成功（学习项 + 计时 + 项目 + 任务 + Bug）', !!seeded.itemId && !!seeded.projId, JSON.stringify(seeded))

// ============ 进入「今天」页 ============
// 先离开再回来：卡片在挂载时按需加载数据，直接点「今天」（已在今天页）不会重新挂载
await evaluate(`__goto('开发'); true`)
await sleep(600)
await evaluate(`__goto('今天'); true`)
await waitFor(`!!__card('learning')`)
check('「今天」页渲染今日卡片', await evaluate(`!!__card('longtasks') && !!__card('learning') && !!__card('dev')`))

// ---- 学习卡片 ----
const learnOk = await waitFor(`__cardText('learning').includes('30m')`, 8000)
const learnText = await evaluate(`__cardText('learning')`)
check('学习卡片显示今日已学时长与学习项',
  learnOk && learnText.includes('【验收】今日学习项') && learnText.includes('4/10'),
  learnText.replace(/\n+/g, ' | ').slice(0, 120))

// ---- 开发卡片 ----
const devOk = await waitFor(`__cardText('dev').includes('【验收】进行中项目')`, 8000)
const devText = await evaluate(`__cardText('dev')`)
check('开发卡片显示进行中项目、任务与 Bug',
  devOk && devText.includes('1/2 任务') && devText.includes('Bug 1') && devText.includes('40m'),
  devText.replace(/\n+/g, ' | ').slice(0, 140))

const plannedHidden = await evaluate(`!__cardText('dev').includes('【验收】计划中项目')`)
check('开发卡片不显示非进行中项目', plannedHidden)
await shot('23-today-cards')

// ---- 点击跳转 ----
await evaluate(`
  (() => { const c = __card('learning'); [...c.querySelectorAll('button')].find(b => b.textContent.includes('进入模块'))?.click(); return true; })()
`)
const jumpedLearn = await waitFor(`document.querySelector('main').innerText.includes('学习清单')`, 6000)
check('学习卡片「进入模块」跳转到自我学习', jumpedLearn)

await evaluate(`__goto('开发'); true`)
await sleep(500)
await evaluate(`__goto('今天'); true`)
await waitFor(`!!__card('dev')`)
await evaluate(`
  (() => { const c = __card('dev'); [...c.querySelectorAll('button')].find(b => b.textContent.includes('进入模块'))?.click(); return true; })()
`)
const jumpedDev = await waitFor(`document.querySelector('main').innerText.includes('代码片段')`, 6000)
check('开发卡片「进入模块」跳转到开发', jumpedDev)

// ---- 空状态 ----
await evaluate(`
  (async () => {
    const api = window.lifeos;
    for (const i of await api.learn.listItems()) await api.learn.removeItem(i.id);
    for (const p of await api.dev.listProjects()) await api.dev.removeProject(p.id);
  })()
`)
// 从开发页切回今天，触发卡片重新加载
await evaluate(`__goto('今天'); true`)
await waitFor(`__cardText('learning').includes('还没有学习项')`, 8000)
const emptyLearn = await evaluate(`__cardText('learning').includes('还没有学习项')`)
const emptyDev = await evaluate(`__cardText('dev').includes('暂无进行中的项目')`)
check('无数据时显示空状态文案', emptyLearn && emptyDev, `学习=${emptyLearn}, 开发=${emptyDev}`)

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
