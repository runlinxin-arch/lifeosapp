import { app, BrowserWindow, dialog, shell } from 'electron'
import path from 'node:path'
import { ensureDataDir } from './db'
import { startupOpen } from './backup'
import { registerIpc } from './ipc'
import { startReminders } from './reminders'
import { registerImageProtocol, registerImageScheme } from './images'
import { resolveDataDir, DATA_DIR_ENV } from './paths'
import { getAllSettings } from './db/settings'
import { resolveTheme } from '@shared/theme'
import { isInternalNavigation, isSafeExternalUrl } from './externalLink'

// 必须在 app ready 之前注册，否则 lifeos-image:// 会被当成普通 URL 拦掉
registerImageScheme()

// 启动时从设置解析出的窗口背景色与主题参数（浅色用户首屏不闪深色）
let windowBg = '#1e1f24'
let windowThemeArg = ''

const RENDERER_DIR = path.join(__dirname, '../renderer')
const DEV_URL = process.env['ELECTRON_RENDERER_URL']

/** 只把白名单协议交给系统；其余（file:、smb:、javascript:…）直接丢弃并留一行日志。 */
function openExternalSafely(rawUrl: string): void {
  if (!isSafeExternalUrl(rawUrl)) {
    console.warn('[lifeos] 已拦截不安全的外链协议：' + rawUrl)
    return
  }
  void shell.openExternal(rawUrl)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: windowBg,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      additionalArguments: [`--lifeos-theme=${windowThemeArg}`]
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    openExternalSafely(details.url)
    return { action: 'deny' }
  })

  // 关键：默认允许页面把应用窗口导航到任意站点；导航后 preload 会重新注入，
  // 外部页面就拿到了全部 IPC。这里除应用自己的页面外一律拦下，能开的外链走系统浏览器。
  const guardNavigation = (event: Electron.Event, url: string): void => {
    if (isInternalNavigation(url, { devUrl: DEV_URL, rendererDir: RENDERER_DIR })) return
    event.preventDefault()
    openExternalSafely(url)
  }
  win.webContents.on('will-navigate', guardNavigation)
  win.webContents.on('will-redirect', guardNavigation)

  if (DEV_URL) {
    void win.loadURL(DEV_URL)
  } else {
    void win.loadFile(path.join(RENDERER_DIR, 'index.html'))
  }

  return win
}

void app.whenReady().then(() => {
  // 默认用 Electron 的 userData；验收/E2E 可用 LIFEOS_DATA_DIR 指到临时目录，
  // 这样清库与造数据都不会碰真实数据（见 scripts/acceptance/*-all.ps1）
  const dataDir = resolveDataDir(process.env, app.getPath('userData'))
  if (process.env[DATA_DIR_ENV]) console.log(`[lifeos] dataDir 被 ${DATA_DIR_ENV} 覆盖为 ${dataDir}`)
  ensureDataDir(dataDir)
  const { db, notice } = startupOpen(path.join(dataDir, 'app.db'), path.join(dataDir, 'backups'))
  registerIpc(db, dataDir)
  // 必须在窗口加载页面前挂上，否则首屏图片会 404
  registerImageProtocol()

  const settings = getAllSettings(db)
  const theme = resolveTheme(settings['theme.mode'], settings['theme.accent'], settings['theme.custom'])
  windowBg = theme.bg
  windowThemeArg = encodeURIComponent(JSON.stringify(theme))

  let mainWindow: BrowserWindow | null = createWindow()
  const stopReminders = startReminders(db, () => mainWindow)

  if (notice) {
    void dialog.showMessageBox({ type: 'warning', title: 'LifeOS 数据恢复', message: notice })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
  app.on('before-quit', () => {
    stopReminders()
    db.close()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
