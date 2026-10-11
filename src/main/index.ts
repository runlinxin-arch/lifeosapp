import { app, BrowserWindow, dialog, shell } from 'electron'
import path from 'node:path'
import { ensureDataDir } from './db'
import { startupOpen } from './backup'
import { registerIpc } from './ipc'
import { startReminders } from './reminders'
import { registerImageProtocol, registerImageScheme } from './images'
import { resolveDataDir, DATA_DIR_ENV } from './paths'

// 必须在 app ready 之前注册，否则 lifeos-image:// 会被当成普通 URL 拦掉
registerImageScheme()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#1e1f24',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
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
