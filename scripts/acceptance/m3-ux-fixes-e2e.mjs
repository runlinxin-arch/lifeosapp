// 验证两处体验修复：
// 1. 看板落点不再依赖窄缝——落在卡片中部也能精确插入
// 2. 捕获弹窗的「选择图片 / 粘贴」是两个并列分支，且「粘贴」读得到剪贴板
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
  window.__board = () => [...document.querySelectorAll('[data-kanban-column]')].map(c => ({
    col: c.dataset.kanbanColumn,
    titles: [...c.querySelectorAll('[data-devcard]')].map(d => d.innerText.split('\\n')[0].trim())
  }));
  window.__cardRect = (title) => {
    const c = [...document.querySelectorAll('[data-devcard]')].find(d => d.innerText.includes(title));
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { top: r.top, height: r.height, mid: r.top + r.height / 2 };
  };
  // 在指定 Y 坐标（不是缝隙，而是卡片内部）投放
  window.__dropAtY = (title, colKey, clientY) => {
    const card = [...document.querySelectorAll('[data-devcard]')].find(d => d.innerText.includes(title));
    const col = document.querySelector('[data-kanban-column="' + colKey + '"]');
    if (!card || !col) return { ok: false, card: !!card, col: !!col };
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientY, clientX: 10 };
    col.dispatchEvent(new DragEvent('dragover', opts));
    col.dispatchEvent(new DragEvent('drop', opts));
    card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    return { ok: true };
  };
  true;
`)

// ============================================================
// 一、看板落点灵敏度
// ============================================================
await evaluate(`[...document.querySelectorAll('aside button')].find(b => b.textContent.includes('开发'))?.click(); true`)
await waitFor(`document.querySelector('main').innerText.includes('拖拽手感验证')`)
await evaluate(`
  (() => {
    const card = [...document.querySelectorAll('main button')].find(b => b.textContent.includes('拖拽手感验证'));
    card?.click();
    return true;
  })()
`)
await waitFor(`!!document.querySelector('[data-kanban-column="todo"]')`)
const initial = await evaluate(`__board()`)
check('看板初始状态', initial[0].titles.length === 3 && initial[1].titles.length === 1 && initial[2].titles.length === 1,
  JSON.stringify(initial.map((c) => `${c.col}:${c.titles.length}`)))

// 场景 A：把「写单元测试」落到第一张卡的**上半部**（卡片内部，不是缝隙）→ 应插到最前
const r1 = await evaluate(`
  (() => {
    const rect = __cardRect('设计数据表结构');
    return __dropAtY('写单元测试', 'todo', rect.top + rect.height * 0.25);
  })()
`)
await sleep(1500)
const afterA = await evaluate(`__board()`)
check('落在卡片上半部（卡片内，非缝隙）→ 插到该卡之前',
  afterA[0].titles[0] === '写单元测试' && afterA[0].titles[1] === '设计数据表结构',
  `${JSON.stringify(r1)} :: ${afterA[0].titles.join(' / ')}`)

// 场景 B：把「写单元测试」落到第二张卡的**下半部** → 应插到它之后
const r2 = await evaluate(`
  (() => {
    const rect = __cardRect('实现 IPC 通道');
    return __dropAtY('写单元测试', 'todo', rect.top + rect.height * 0.8);
  })()
`)
await sleep(1500)
const afterB = await evaluate(`__board()`)
check('落在卡片下半部 → 插到该卡之后',
  afterB[0].titles[1] === '实现 IPC 通道' && afterB[0].titles[2] === '写单元测试',
  `${JSON.stringify(r2)} :: ${afterB[0].titles.join(' / ')}`)

// 场景 C：跨列落到「进行中」唯一卡片的下半部 → 追加到末尾
const r3 = await evaluate(`
  (() => {
    const rect = __cardRect('接入渲染端 store');
    return __dropAtY('设计数据表结构', 'doing', rect.top + rect.height * 0.9);
  })()
`)
await sleep(1500)
const afterC = await evaluate(`__board()`)
check('跨列落到卡片下方区域 → 追加到该列末尾',
  afterC[1].titles.length === 2 && afterC[1].titles[1] === '设计数据表结构',
  `${JSON.stringify(r3)} :: ${afterC[1].titles.join(' / ')}`)

// 场景 D：落到列内空白区（远低于所有卡片）→ 追加到末尾
const r4 = await evaluate(`
  (() => {
    const col = document.querySelector('[data-kanban-column="todo"]');
    const rect = col.getBoundingClientRect();
    return __dropAtY('实现 IPC 通道', 'todo', rect.bottom - 20);
  })()
`)
await sleep(1500)
const afterD = await evaluate(`__board()`)
check('落到列内空白区 → 追加到该列末尾',
  afterD[0].titles[afterD[0].titles.length - 1] === '实现 IPC 通道',
  `${JSON.stringify(r4)} :: ${afterD[0].titles.join(' / ')}`)
await shot('24-kanban-drop')

// 刷新后仍保持（持久化未受影响）
await send('Page.reload', { ignoreCache: true })
await sleep(4500)
await evaluate(`
  window.__board = () => [...document.querySelectorAll('[data-kanban-column]')].map(c => ({
    col: c.dataset.kanbanColumn,
    titles: [...c.querySelectorAll('[data-devcard]')].map(d => d.innerText.split('\\n')[0].trim())
  }));
  true;
`)
await evaluate(`[...document.querySelectorAll('aside button')].find(b => b.textContent.includes('开发'))?.click(); true`)
await waitFor(`document.querySelector('main').innerText.includes('拖拽手感验证')`)
await evaluate(`
  (() => {
    const card = [...document.querySelectorAll('main button')].find(b => b.textContent.includes('拖拽手感验证'));
    card?.click();
    return true;
  })()
`)
await waitFor(`!!document.querySelector('[data-kanban-column="todo"]')`)
const afterReload = await evaluate(`__board()`)
check('刷新后位置与拖动结果一致（持久化正常）',
  JSON.stringify(afterReload) === JSON.stringify(afterD),
  JSON.stringify(afterReload.map((c) => `${c.col}:${c.titles.join(',')}`)))

// ============================================================
// 二、捕获弹窗：选择图片 / 粘贴 并列
// ============================================================
await evaluate(`[...document.querySelectorAll('aside button')].find(b => b.textContent.includes('设计灵感'))?.click(); true`)
await waitFor(`document.querySelector('main').innerText.includes('＋ 捕获')`)
await evaluate(`
  (() => { [...document.querySelectorAll('main button')].find(b => b.textContent.includes('＋ 捕获'))?.click(); return true; })()
`)
await waitFor(`!!document.querySelector('.fixed.inset-0')`)

const twoBranches = await evaluate(`
  (() => {
    const pick = document.querySelector('[data-capture-action="pick-file"]');
    const paste = document.querySelector('[data-capture-action="paste-clipboard"]');
    return {
      pick: pick ? pick.innerText.replace(/\\n+/g, ' ') : null,
      paste: paste ? paste.innerText.replace(/\\n+/g, ' ') : null,
      sibling: !!pick && !!paste && pick.parentElement === paste.parentElement
    };
  })()
`)
check('「选择图片」与「粘贴」是同级并列分支',
  twoBranches.sibling && twoBranches.pick.includes('选择图片') && twoBranches.paste.includes('粘贴'),
  JSON.stringify(twoBranches))
await shot('25-capture-branches')

// 点「粘贴」→ 读剪贴板
const pasteResult = await evaluate(`
  (async () => {
    document.querySelector('[data-capture-action="paste-clipboard"]').click();
    return 'clicked';
  })()
`)
// 等"解码完成"而不是"元素出现"：object URL 需要一点时间才能拿到 naturalWidth
const previewOk = await waitFor(`
  (() => { const i = document.querySelector('img[alt="预览"]'); return !!i && i.naturalWidth > 0; })()
`, 8000)
const previewInfo = await evaluate(`
  (() => {
    const img = document.querySelector('img[alt="预览"]');
    const box = document.querySelector('.fixed.inset-0');
    return {
      shown: !!img,
      natural: img ? img.naturalWidth + 'x' + img.naturalHeight : null,
      meta: box ? (box.innerText.match(/\\d+ KB[^\\n]*/) || [])[0] : null,
      err: box && box.innerText.includes('剪贴板里没有图片')
    };
  })()
`)
check('点「粘贴」从剪贴板取到图片并显示预览',
  previewOk && previewInfo.natural === '480x240',
  `${pasteResult} :: ${JSON.stringify(previewInfo)}`)

// 保存 → 卡片出现且图片真实渲染
await evaluate(`
  (() => {
    const ta = [...document.querySelectorAll('.fixed.inset-0 textarea')].find(t => t.placeholder.includes('备注'));
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '【验收】剪贴板粘贴');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('.fixed.inset-0 button')].find(b => b.textContent.trim() === '保存').click();
    return true;
  })()
`)
const saved = await waitFor(`
  (() => {
    const imgs = [...document.querySelectorAll('main img[src^="lifeos-image"]')];
    return imgs.some(i => i.naturalWidth > 0) && document.querySelector('main').innerText.includes('【验收】剪贴板粘贴');
  })()
`, 10000)
const savedDetail = await evaluate(`
  (() => {
    const imgs = [...document.querySelectorAll('main img[src^="lifeos-image"]')];
    const hit = imgs.find(i => i.naturalWidth > 0);
    return { n: imgs.length, nw: hit ? hit.naturalWidth : 0, text: document.querySelector('main').innerText.includes('【验收】剪贴板粘贴') };
  })()
`)
check('粘贴的图片保存后在瀑布流真实渲染', saved && savedDetail.nw > 0, JSON.stringify(savedDetail))
await shot('26-insp-pasted')

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
