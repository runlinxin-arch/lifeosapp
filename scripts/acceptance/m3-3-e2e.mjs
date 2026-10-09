// M3-3 设计灵感端到端验收（随 T6–T11 逐步扩充）
// 运行前置：应用以 --remote-debugging-port=9222 启动
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

const IMAGES_DIR = `${process.env.APPDATA}\\LifeOS\\images`

// 1×1 透明 PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// ============ 图片全链路：字节 → 落盘 → 自定义协议 → 渲染 ============
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
check('图片确实写入 images/ 目录，且落盘字节数 == 传输字节数',
  fileOnDisk && diskSize === captured.byteLen,
  `文件=${fileOnDisk}, 落盘=${diskSize}, 传输=${captured.byteLen}`)

// 真正把图片渲染出来：naturalWidth > 0 才证明协议与 CSP 都放行了
const rendered = await evaluate(`
  (async () => {
    const img = document.createElement('img');
    img.src = 'lifeos-image://local/' + encodeURIComponent(${JSON.stringify(imageName)});
    img.style.position = 'fixed';
    img.style.left = '-100px';
    document.body.appendChild(img);
    const done = await new Promise((resolve) => {
      img.onload = () => resolve({ loaded: true });
      img.onerror = () => resolve({ loaded: false });
      setTimeout(() => resolve({ loaded: false, timeout: true }), 4000);
    });
    const out = { ...done, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, complete: img.complete };
    img.remove();
    return out;
  })()
`)
check('自定义协议 + CSP 放行：图片真实渲染（naturalWidth > 0）',
  rendered.loaded && rendered.naturalWidth > 0, JSON.stringify(rendered))

// 路径穿越防护（真实协议请求，不是纯函数）
const traversal = await evaluate(`
  (async () => {
    const tries = ['lifeos-image://local/..%2Fapp.db', 'lifeos-image://local/evil.png', 'lifeos-image://local/sub%2Fx.png'];
    const out = [];
    for (const url of tries) {
      const img = document.createElement('img');
      img.src = url;
      const r = await new Promise((resolve) => {
        img.onload = () => resolve('loaded');
        img.onerror = () => resolve('rejected');
        setTimeout(() => resolve('timeout'), 2500);
      });
      out.push({ url, r });
      img.remove();
    }
    return out;
  })()
`)
check('协议拒绝路径穿越与非白名单文件名',
  traversal.every((t) => t.r === 'rejected'), JSON.stringify(traversal))

// ============ 删除灵感 → 图片文件同步删除 ============
await evaluate(`window.lifeos.insp.remove(${captured.id})`)
await sleep(800)
const fileAfterDelete = imageName ? fs.existsSync(`${IMAGES_DIR}\\${imageName}`) : true
check('删除灵感后图片文件同步删除', !fileAfterDelete, `文件仍存在=${fileAfterDelete}`)

// ============ 大小与格式限制 ============
const oversize = await evaluate(`
  (async () => {
    try {
      await window.lifeos.insp.capture({ kind: 'image', imageBytes: new Uint8Array(9 * 1024 * 1024), imageMime: 'image/png' });
      return 'accepted';
    } catch (e) { return String(e && e.message ? e.message : e); }
  })()
`)
check('超过 8 MB 被主进程拒绝', String(oversize).includes('8 MB'), String(oversize).slice(0, 80))

const badMime = await evaluate(`
  (async () => {
    try {
      await window.lifeos.insp.capture({ kind: 'image', imageBytes: new Uint8Array([1,2,3]), imageMime: 'image/svg+xml' });
      return 'accepted';
    } catch (e) { return String(e && e.message ? e.message : e); }
  })()
`)
check('非白名单 MIME 被拒绝', String(badMime).includes('格式'), String(badMime).slice(0, 80))

// 失败后不应留下孤儿文件
const filesNow = fs.readdirSync(IMAGES_DIR).filter((f) => !f.startsWith('.'))
check('被拒绝的捕获没有留下文件', filesNow.length === 0, `images/ 下 ${filesNow.length} 个文件`)

console.log('')
console.log(`===== ${results.filter((r) => r.pass).length}/${results.length} 通过 =====`)
for (const r of results.filter((x) => !x.pass)) console.log('  未通过: ' + r.label)
ws.close()
