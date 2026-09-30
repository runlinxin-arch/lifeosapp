import { app, BrowserWindow, dialog, shell } from 'electron'
import path from 'node:path'
import { ensureDataDir } from './db'
import { startupOpen } from './backup'
import { registerIpc } from './ipc'
import { startReminders } from './reminders'

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
  const dataDir = app.getPath('userData')
  ensureDataDir(dataDir)
  const { db, notice } = startupOpen(path.join(dataDir, 'app.db'), path.join(dataDir, 'backups'))
  registerIpc(db)

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
