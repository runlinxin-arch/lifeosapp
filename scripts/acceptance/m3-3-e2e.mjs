// M3-3 设计灵感端到端验收（随 T6–T11 逐步扩充）
// 运行前置：应用以 --remote-debugging-port=9222 启动，数据已清理
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

/** 轮询等待条件成立，避免固定 sleep 造成的时序脆弱 */
const waitFor = async (expr, timeoutMs = 8000) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expr)) return true
    await sleep(200)
  }
  return false
}
const COUNT = `/(\\d+) 条/.exec(__main().innerText)?.[1]`

const IMAGES_DIR = `${process.env.APPDATA}\\LifeOS\\images`
const IMAGE_FILES = () => fs.readdirSync(IMAGES_DIR).filter((f) => !f.startsWith('.'))

// 1×1 透明 PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

await evaluate(`
  window.__main = () => document.querySelector('main');
  window.__setInput = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  window.__btn = (t) => [...__main().querySelectorAll('button')].find(b => b.textContent.trim() === t);
  window.__cards = () => [...__main().querySelectorAll('img[src^="lifeos-image"]')];
  window.__dialogOpen = () => !!document.querySelector('.fixed.inset-0');
  // 弹窗内的元素必须限定在弹窗内查找：
  // 页面搜索框的 placeholder「搜索文字 / 链接 / 标签」也含「标签」，全局查找会先命中它
  window.__dlg = () => document.querySelector('.fixed.inset-0');
  window.__dlgBtn = (t) => [...__dlg().querySelectorAll('button')].find(b => b.textContent.trim() === t);
  window.__dlgInput = (hint) => [...__dlg().querySelectorAll('input,textarea')].find(i => i.placeholder.includes(hint));
  window.__dlgSelect = () => __dlg().querySelector('select');
  true;
`)

// ============================================================
// 一、图片全链路：字节 → 落盘 → 自定义协议 → 渲染
// ============================================================
const captured = await evaluate(`
  (async () => {
    const bin = atob('${PNG_B64}');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    try {
      const item = await window.lifeos.insp.capture({
        kind: 'image', imageBytes: bytes, imageMime: 'image/png', text: '【验收】协议验证', tags: ['验收']
      });
      return { ok: true, id: item.id, imagePath: item.image_path, byteLen: bytes.length };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  })()
`)
check('capture 图片灵感成功（字节经 IPC 传输）', captured.ok, JSON.stringify(captured))

const imageName = captured.imagePath
const fileOnDisk = imageName ? fs.existsSync(`${IMAGES_DIR}\\${imageName}`) : false
const diskSize = fileOnDisk ? fs.statSync(`${IMAGES_DIR}\\${imageName}`).size : -1
check('图片确实写入 images/，且落盘字节数 == 传输字节数',
  fileOnDisk && diskSize === captured.byteLen,
  `文件=${fileOnDisk}, 落盘=${diskSize}, 传输=${captured.byteLen}`)

const rendered = await evaluate(`
  (async () => {
    const img = document.createElement('img');
    img.src = 'lifeos-image://local/' + encodeURIComponent(${JSON.stringify(imageName)});
    img.style.position = 'fixed'; img.style.left = '-100px';
    document.body.appendChild(img);
    const done = await new Promise((resolve) => {
      img.onload = () => resolve({ loaded: true });
      img.onerror = () => resolve({ loaded: false });
      setTimeout(() => resolve({ loaded: false, timeout: true }), 4000);
    });
    const out = { ...done, naturalWidth: img.naturalWidth };
    img.remove();
    return out;
  })()
`)
check('自定义协议 + CSP 放行：图片真实渲染（naturalWidth > 0）',
  rendered.loaded && rendered.naturalWidth > 0, JSON.stringify(rendered))

const traversal = await evaluate(`
  (async () => {
    const tries = ['lifeos-image://local/..%2Fapp.db', 'lifeos-image://local/evil.png', 'lifeos-image://local/sub%2Fx.png'];
    const out = [];
    for (const url of tries) {
      const img = document.createElement('img'); img.src = url;
      const r = await new Promise((resolve) => {
        img.onload = () => resolve('loaded');
        img.onerror = () => resolve('rejected');
        setTimeout(() => resolve('timeout'), 2500);
      });
      out.push({ url, r }); img.remove();
    }
    return out;
  })()
`)
check('协议拒绝路径穿越与非白名单文件名', traversal.every((t) => t.r === 'rejected'), JSON.stringify(traversal))

await evaluate(`window.lifeos.insp.remove(${captured.id})`)
await sleep(800)
check('删除灵感后图片文件同步删除', !(imageName && fs.existsSync(`${IMAGES_DIR}\\${imageName}`)))

const oversize = await evaluate(`
  (async () => {
    try { await window.lifeos.insp.capture({ kind: 'image', imageBytes: new Uint8Array(9 * 1024 * 1024), imageMime: 'image/png' }); return 'accepted'; }
    catch (e) { return String(e && e.message ? e.message : e); }
  })()
`)
check('超过 8 MB 被主进程拒绝', String(oversize).includes('8 MB'), String(oversize).slice(0, 70))

const badMime = await evaluate(`
  (async () => {
    try { await window.lifeos.insp.capture({ kind: 'image', imageBytes: new Uint8Array([1,2,3]), imageMime: 'image/svg+xml' }); return 'accepted'; }
    catch (e) { return String(e && e.message ? e.message : e); }
  })()
`)
check('非白名单 MIME 被拒绝', String(badMime).includes('格式'), String(badMime).slice(0, 70))
check('被拒绝的捕获没有留下文件', IMAGE_FILES().length === 0, `images/ 下 ${IMAGE_FILES().length} 个文件`)

// ============================================================
// 二、T8 灵感页骨架
// ============================================================
await evaluate(`[...document.querySelectorAll('aside button')].find(b => b.textContent.includes('设计灵感'))?.click(); true`)
await waitFor(`__main().innerText.includes('瀑布流') && ${COUNT} === '0'`)
check('灵感页渲染（瀑布流/画板切换 + 捕获按钮）',
  await evaluate(`__main().innerText.includes('设计灵感') && __main().innerText.includes('瀑布流') && __main().innerText.includes('画板')`))
check('空状态显示引导文案且计数为 0',
  await evaluate(`__main().innerText.includes('还没有灵感') && ${COUNT} === '0'`))
await shot('20-insp-empty')

// ============================================================
// 三、T9 捕获：写文字 / 贴链接 / 贴图
// ============================================================
const openCapture = async (tab) => {
  await evaluate(`__btn('＋ 捕获')?.click(); true`)
  await waitFor(`__dialogOpen()`)
  await evaluate(`__btn('${tab}')?.click(); true`)
  await sleep(300)
}

const captureText = async (txt, tags) => {
  await openCapture('写文字')
  await evaluate(`
    (() => {
      __setInput(__dlgInput('记下这个想法'), ${JSON.stringify(txt)});
      __setInput(__dlgInput('标签'), ${JSON.stringify(tags)});
      __dlgBtn('保存').click();
      return true;
    })()
  `)
  await waitFor(`!__dialogOpen()`)
}

await captureText('【验收】深色配一点品红', '配色 排版')
console.log('  [调试] 捕获后状态:', await evaluate(`(async () => {
  const db = await window.lifeos.insp.list();
  const root = document.querySelector('[data-insp-filter]');
  return JSON.stringify({
    db: db.length,
    count: ${COUNT},
    dialog: __dialogOpen(),
    card: __main().innerText.includes('深色配一点品红'),
    filter: root ? root.dataset.inspFilter : 'no-hook',
    storeItems: root ? root.dataset.inspItems : '?',
    storeTags: root ? root.dataset.inspTags : '?'
  });
})()`))
check('写文字捕获后卡片出现在瀑布流',
  await waitFor(`__main().innerText.includes('【验收】深色配一点品红') && ${COUNT} === '1'`),
  `计数 ${await evaluate(COUNT)}`)

await openCapture('贴链接')
await evaluate(`
  (() => {
    const url = __dlgInput('https://');
    __setInput(url, 'https://dribbble.com/shots/123');
    const ta = __dlgInput('备注');
    __setInput(ta, '【验收】参考站');
    __dlgBtn('保存').click();
    return true;
  })()
`)
check('贴链接捕获后卡片显示来源',
  await waitFor(`__main().innerText.includes('【验收】参考站') && __main().innerText.includes('dribbble.com') && ${COUNT} === '2'`),
  `计数 ${await evaluate(COUNT)}`)

await openCapture('贴链接')
await evaluate(`
  (() => {
    const url = __dlgInput('https://');
    __setInput(url, 'ftp://x.com/a');
    __dlgBtn('保存').click();
    return true;
  })()
`)
await sleep(800)
const badLink = await evaluate(`
  (() => ({ open: __dialogOpen(), err: document.body.innerText.includes('http:// 或 https://'), count: ${COUNT} }))()
`)
check('非法链接被拒绝、弹窗保持打开且列表不变',
  badLink.open && badLink.err && badLink.count === '2', JSON.stringify(badLink))
await evaluate(`__btn('取消')?.click(); true`)
await waitFor(`!__dialogOpen()`)

await evaluate(`__btn('＋ 捕获')?.click(); true`)
await waitFor(`__dialogOpen()`)
const picked = await evaluate(`
  (() => {
    const bin = atob('${PNG_B64}');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], 'shot.png', { type: 'image/png' });
    const dt = new DataTransfer(); dt.items.add(file);
    const input = document.querySelector('input[type=file]');
    if (!input) return { ok: false, reason: 'no-file-input' };
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  })()
`)
check('选择图片后出现预览', picked.ok && await waitFor(`!!document.querySelector('img[alt="预览"]')`, 5000), JSON.stringify(picked))

await evaluate(`
  (() => {
    const ta = __dlgInput('备注');
    __setInput(ta, '【验收】贴图灵感');
    __dlgBtn('保存').click();
    return true;
  })()
`)
const imgOk = await waitFor(`
  (() => {
    const imgs = __cards().filter(i => !i.alt.includes('预览'));
    return imgs.length > 0 && imgs.some(i => i.naturalWidth > 0) && __main().innerText.includes('【验收】贴图灵感');
  })()
`, 10000)
const imgDetail = await evaluate(`
  (() => {
    const imgs = __cards().filter(i => !i.alt.includes('预览'));
    const hit = imgs.find(i => i.naturalWidth > 0);
    return { txt: __main().innerText.includes('【验收】贴图灵感'), imgs: imgs.length, nw: hit ? hit.naturalWidth : 0, count: ${COUNT} };
  })()
`)
check('贴图捕获后瀑布流中的图片真实渲染', imgOk && imgDetail.nw > 0, JSON.stringify(imgDetail))
check('图片文件确实存在于 images/', IMAGE_FILES().length === 1, `images/ 下 ${IMAGE_FILES().length} 个文件`)
await shot('21-insp-flow')

// ============================================================
// 四、T8 筛选（关键词 / 标签 / 精选）
// ============================================================
await captureText('【验收】第三条灵感', '排版')
check('共 4 条灵感', await waitFor(`${COUNT} === '4'`), `计数 ${await evaluate(COUNT)}`)

await evaluate(`
  (() => {
    const el = [...__main().querySelectorAll('input')].find(i => i.placeholder.includes('搜索文字'));
    __setInput(el, '品红');
    return true;
  })()
`)
const kwOk = await waitFor(`${COUNT} === '1'`)
const kwDetail = await evaluate(`({ has: __main().innerText.includes('品红'), other: __main().innerText.includes('参考站') })`)
check('关键词搜索命中文字', kwOk && kwDetail.has && !kwDetail.other, JSON.stringify(kwDetail))

await evaluate(`__btn('清除筛选')?.click(); true`)
await waitFor(`${COUNT} === '4'`)
await evaluate(`__btn('配色')?.click(); true`)
check('标签筛选生效', await waitFor(`${COUNT} === '1'`), `配色标签 ${await evaluate(COUNT)} 条`)
await evaluate(`__btn('清除筛选')?.click(); true`)
await waitFor(`${COUNT} === '4'`)

await evaluate(`
  (() => {
    const card = [...__main().querySelectorAll('[data-insp-card]')].find(c => c.innerText.includes('【验收】深色配一点品红'));
    if (!card) return 'card-not-found';
    [...card.querySelectorAll('button')].find(b => b.textContent.trim() === '⭐').click();
    return 'clicked';
  })()
`)
await waitFor(`
  (() => {
    const card = [...__main().querySelectorAll('[data-insp-card]')].find(c => c.innerText.includes('【验收】深色配一点品红'));
    return !!card && [...card.querySelectorAll('button')].some(b => b.textContent.trim() === '☆');
  })()
`, 6000)
await evaluate(`__btn('⭐ 精选')?.click(); true`)
const starOk = await waitFor(`${COUNT} === '1'`)
const starDetail = await evaluate(`
  (() => {
    const cards = [...__main().querySelectorAll('[data-insp-card]')];
    return { n: ${COUNT}, only: cards.length === 1 && cards[0].innerText.includes('深色配一点品红') };
  })()
`)
check('设为精选后「精选」筛选只留该条', starOk && starDetail.only, JSON.stringify(starDetail))
await evaluate(`__btn('清除筛选')?.click(); true`)
await waitFor(`${COUNT} === '4'`)

// ============================================================
// 五、T10 画板视图
// ============================================================
await evaluate(`__btn('画板')?.click(); true`)
await waitFor(`__main().innerText.includes('新建画板')`)
check('画板视图渲染', await evaluate(`__main().innerText.includes('还没有画板')`))

await evaluate(`
  (() => {
    const el = [...__main().querySelectorAll('input')].find(i => i.placeholder.includes('新建画板'));
    __setInput(el, '【验收】配色板');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()
`)
const boardCreated = await waitFor(`__main().innerText.includes('【验收】配色板') && __main().innerText.includes('0 条')`)
check('新建画板后出现卡片且条数为 0', boardCreated)

// 把图片灵感归入画板（通过编辑弹窗）
await evaluate(`__btn('瀑布流')?.click(); true`)
await waitFor(`__main().innerText.includes('＋ 捕获')`)
await evaluate(`
  (() => {
    const card = [...__main().querySelectorAll('[data-insp-card]')].find(c => c.innerText.includes('【验收】贴图灵感'));
    if (!card) return 'card-not-found';
    // 点正文按钮打开编辑弹窗
    [...card.querySelectorAll('button')].find(b => b.textContent.includes('【验收】贴图灵感')).click();
    return 'ok';
  })()
`)
await waitFor(`__dialogOpen()`)
check('点卡片打开编辑弹窗', await evaluate(`__dialogOpen()`))

await evaluate(`
  (() => {
    const sel = __dlg().querySelector('select');
    const opt = [...sel.options].find(o => o.text.includes('【验收】配色板'));
    if (!opt) return 'board-option-missing';
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, opt.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    __dlgBtn('保存').click();
    return 'saved';
  })()
`)
await waitFor(`!__dialogOpen()`, 6000)
const assigned = await waitFor(`
  (() => {
    const card = [...__main().querySelectorAll('[data-insp-card]')].find(c => c.innerText.includes('【验收】贴图灵感'));
    return !!card && card.innerText.includes('配色板');
  })()
`, 6000)
check('灵感归入画板后卡片显示画板名', assigned)

await evaluate(`__btn('画板')?.click(); true`)
await waitFor(`__main().innerText.includes('【验收】配色板')`)
const boardStat = await evaluate(`
  (() => {
    const t = __main().innerText;
    const m = /【验收】配色板\\s*([\\s\\S]*?)(\\d+) 条/.exec(t);
    return { hasBoard: t.includes('【验收】配色板'), count: m ? m[2] : null, cover: document.querySelectorAll('img[src^="lifeos-image"]').length };
  })()
`)
check('画板卡片显示条数且封面为该灵感图片', boardStat.count === '1' && boardStat.cover >= 1, JSON.stringify(boardStat))
await shot('22-insp-boards')

// 进入画板看该画板的瀑布流
await evaluate(`
  (() => {
    const card = [...__main().querySelectorAll('button')].find(b => b.textContent.trim() === '【验收】配色板');
    card?.click();
    return true;
  })()
`)
await waitFor(`__main().innerText.includes('全部灵感')`, 6000)
const inBoard = await evaluate(`
  (() => {
    const cards = [...__main().querySelectorAll('[data-insp-card]')];
    return { n: cards.length, only: cards.length === 1 && cards[0].innerText.includes('贴图灵感'), count: ${COUNT} };
  })()
`)
check('进入画板只看该画板的灵感', inBoard.only && inBoard.count === '1', JSON.stringify(inBoard))

await evaluate(`__btn('← 全部灵感')?.click(); true`)
await waitFor(`${COUNT} === '4'`)

// 重命名画板
await evaluate(`__btn('画板')?.click(); true`)
await waitFor(`__main().innerText.includes('【验收】配色板')`)
await evaluate(`
  (() => {
    const btn = [...__main().querySelectorAll('button')].find(b => b.textContent.trim() === '改');
    btn?.click();
    return true;
  })()
`)
await sleep(400)
await evaluate(`
  (() => {
    const input = [...__main().querySelectorAll('input')].find(i => i.value === '【验收】配色板');
    if (!input) return 'no-input';
    __setInput(input, '【验收】配色板V2');
    [...__main().querySelectorAll('button')].find(b => b.textContent.trim() === '存')?.click();
    return 'renamed';
  })()
`)
const renamed = await waitFor(`__main().innerText.includes('配色板V2')`, 6000)
check('重命名画板', renamed)

// 删除画板 → 灵感保留、只解除归属
await evaluate(`
  (() => {
    const btn = [...__main().querySelectorAll('button')].find(b => b.title && b.title.includes('删除画板'));
    btn?.click();
    return true;
  })()
`)
const boardGone = await waitFor(`!__main().innerText.includes('配色板V2')`, 6000)
const inspKept = await evaluate(`(async () => (await window.lifeos.insp.list()).length)()`)
check('删除画板后灵感条目保留', boardGone && inspKept === 4, `画板已删=${boardGone}, 灵感 ${inspKept} 条`)

await evaluate(`__btn('瀑布流')?.click(); true`)
await waitFor(`${COUNT} === '4'`)
const unassigned = await evaluate(`
  (() => {
    const card = [...__main().querySelectorAll('[data-insp-card]')].find(c => c.innerText.includes('【验收】贴图灵感'));
    return { boardGone: !!card && !card.innerText.includes('配色板') };
  })()
`)
check('灵感解除归属后不再显示画板名', unassigned.boardGone)

// ============================================================
// 六、编辑与删除（含图片文件清理）
// ============================================================
await evaluate(`
  (() => {
    const card = [...__main().querySelectorAll('[data-insp-card]')].find(c => c.innerText.includes('【验收】第三条灵感'));
    [...card.querySelectorAll('button')].find(b => b.textContent.includes('【验收】第三条灵感')).click();
    return true;
  })()
`)
await waitFor(`__dialogOpen()`)
await evaluate(`
  (() => {
    __setInput(__dlgInput('正文'), '【验收】第三条灵感（已改）');
    __dlgBtn('保存').click();
    return true;
  })()
`)
const edited = await waitFor(`!__dialogOpen() && __main().innerText.includes('（已改）')`, 6000)
check('编辑灵感正文生效', edited)

const filesBefore = IMAGE_FILES().length
await evaluate(`
  (() => {
    const card = [...__main().querySelectorAll('[data-insp-card]')].find(c => c.innerText.includes('【验收】贴图灵感'));
    [...card.querySelectorAll('button')].find(b => b.textContent.trim() === '✕').click();
    return true;
  })()
`)
const deleted = await waitFor(`!__main().innerText.includes('【验收】贴图灵感') && ${COUNT} === '3'`, 6000)
const filesAfter = IMAGE_FILES().length
check('删除灵感后条目消失且图片文件同步清理',
  deleted && filesAfter === filesBefore - 1, `文件 ${filesBefore} → ${filesAfter}`)

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
