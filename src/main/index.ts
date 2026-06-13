import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, basename, posix } from 'path'
import { SessionManager } from './ssh/SessionManager'
import { log, LOG_FILE_PATH } from './logger'
import {
  IPC,
  type SshCredentials,
  type ConnectResult,
  type ListResult,
  type SimpleResult
} from '@shared/types'

let win: BrowserWindow | null = null

// 捕获主进程未处理异常,避免静默崩溃
process.on('uncaughtException', (err) => log.error('uncaughtException:', err.stack || String(err)))
process.on('unhandledRejection', (reason) => log.error('unhandledRejection:', String(reason)))

const sessions = new SessionManager({
  onData: (sessionId, data) => win?.webContents.send(IPC.terminalData, { sessionId, data }),
  onClose: (sessionId) => {
    log.info('session closed:', sessionId)
    win?.webContents.send(IPC.sessionClosed, { sessionId })
  },
  onMetrics: (sessionId, m) => win?.webContents.send(IPC.monitorUpdate, { sessionId, metrics: m })
})

function createWindow(): void {
  log.info('createWindow: 创建主窗口')
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: false,
    title: 'ZackShell',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => {
    log.info('ready-to-show: 显示窗口')
    win?.show()
  })

  // ---- 渲染进程加载过程的全链路日志 ----
  const wc = win.webContents
  wc.on('did-start-loading', () => log.info('renderer: did-start-loading'))
  wc.on('dom-ready', () => log.info('renderer: dom-ready'))
  wc.on('did-finish-load', () => log.info('renderer: did-finish-load (页面加载完成)'))
  wc.on('did-fail-load', (_e, code, desc, url) =>
    log.error('renderer: did-fail-load', code, desc, url)
  )
  wc.on('render-process-gone', (_e, details) => log.error('renderer: render-process-gone', details))
  wc.on('preload-error', (_e, path, err) => log.error('renderer: preload-error', path, err.stack))
  // 关键:把渲染进程 console 的内容(包括白屏的真实报错)转发到主日志文件
  wc.on('console-message', (_e, level, message, line, sourceId) => {
    const lv = ['VERBOSE', 'INFO', 'WARN', 'ERROR'][level] ?? String(level)
    log.info(`[renderer console/${lv}] ${message}  (${sourceId}:${line})`)
  })

  const url = process.env['ELECTRON_RENDERER_URL']
  if (url) {
    log.info('加载渲染层 URL(dev):', url)
    win.loadURL(url)
    wc.openDevTools({ mode: 'right' })
  } else {
    const file = join(__dirname, '../renderer/index.html')
    log.info('加载渲染层文件(prod):', file)
    win.loadFile(file)
  }
}

// ---------- session / terminal ----------
ipcMain.handle(
  IPC.sessionConnect,
  async (_e, p: { creds: SshCredentials; cols: number; rows: number }): Promise<ConnectResult> => {
    log.info('IPC connect ->', `${p.creds.username}@${p.creds.host}:${p.creds.port}`)
    try {
      const sessionId = await sessions.connect(p.creds, p.cols, p.rows)
      log.info('IPC connect OK, sessionId=', sessionId)
      return { ok: true, sessionId }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('IPC connect FAIL:', msg)
      return { ok: false, error: msg }
    }
  }
)
ipcMain.on(IPC.terminalInput, (_e, p: { sessionId: string; data: string }) =>
  sessions.write(p.sessionId, p.data)
)
ipcMain.on(IPC.terminalResize, (_e, p: { sessionId: string; cols: number; rows: number }) => {
  log.info('IPC resize', p.sessionId, `${p.cols}x${p.rows}`)
  sessions.resize(p.sessionId, p.cols, p.rows)
})
ipcMain.on(IPC.sessionDisconnect, (_e, p: { sessionId: string }) => {
  log.info('IPC disconnect', p.sessionId)
  sessions.disconnect(p.sessionId)
})

// ---------- monitor ----------
ipcMain.on(IPC.monitorStart, (_e, p: { sessionId: string; intervalMs?: number }) => {
  log.info('IPC monitorStart', p.sessionId, 'interval=', p.intervalMs ?? 2000)
  sessions.startMonitor(p.sessionId, p.intervalMs ?? 2000)
})
ipcMain.on(IPC.monitorStop, (_e, p: { sessionId: string }) => {
  log.info('IPC monitorStop', p.sessionId)
  sessions.stopMonitor(p.sessionId)
})

// ---------- sftp ----------
ipcMain.handle(IPC.sftpList, async (_e, p: { sessionId: string; path: string }): Promise<ListResult> => {
  log.info('IPC sftpList', p.path)
  const conn = sessions.get(p.sessionId)
  if (!conn) return { ok: false, error: 'no session' }
  try {
    const entries = await conn.list(p.path)
    log.info(`IPC sftpList OK, ${entries.length} 项`)
    return { ok: true, cwd: p.path, entries }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('IPC sftpList FAIL:', msg)
    return { ok: false, error: msg }
  }
})

ipcMain.handle(
  IPC.sftpDownload,
  async (_e, p: { sessionId: string; remote: string; name: string }): Promise<SimpleResult> => {
    const conn = sessions.get(p.sessionId)
    if (!conn) return { ok: false, error: 'no session' }
    const r = await dialog.showSaveDialog(win!, { defaultPath: p.name })
    if (r.canceled || !r.filePath) return { ok: false, error: 'canceled' }
    try {
      await conn.download(p.remote, r.filePath)
      log.info('IPC download OK ->', r.filePath)
      return { ok: true, info: r.filePath }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('IPC download FAIL:', msg)
      return { ok: false, error: msg }
    }
  }
)

ipcMain.handle(
  IPC.sftpUpload,
  async (_e, p: { sessionId: string; cwd: string }): Promise<SimpleResult> => {
    const conn = sessions.get(p.sessionId)
    if (!conn) return { ok: false, error: 'no session' }
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'] })
    if (r.canceled || r.filePaths.length === 0) return { ok: false, error: 'canceled' }
    const local = r.filePaths[0]
    const remote = posix.join(p.cwd, basename(local))
    try {
      await conn.upload(local, remote)
      log.info('IPC upload OK ->', remote)
      return { ok: true, info: basename(local) }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('IPC upload FAIL:', msg)
      return { ok: false, error: msg }
    }
  }
)

ipcMain.handle(
  IPC.sftpDelete,
  async (_e, p: { sessionId: string; path: string; isDir: boolean }): Promise<SimpleResult> => {
    const conn = sessions.get(p.sessionId)
    if (!conn) return { ok: false, error: 'no session' }
    try {
      await conn.remove(p.path, p.isDir)
      log.info('IPC delete OK', p.path)
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('IPC delete FAIL:', msg)
      return { ok: false, error: msg }
    }
  }
)

ipcMain.handle(
  IPC.sftpMkdir,
  async (_e, p: { sessionId: string; path: string }): Promise<SimpleResult> => {
    const conn = sessions.get(p.sessionId)
    if (!conn) return { ok: false, error: 'no session' }
    try {
      await conn.mkdir(p.path)
      log.info('IPC mkdir OK', p.path)
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('IPC mkdir FAIL:', msg)
      return { ok: false, error: msg }
    }
  }
)

app.whenReady().then(() => {
  log.info('app ready, 平台=', process.platform, 'electron=', process.versions.electron)
  log.info('日志文件位置:', LOG_FILE_PATH)
  createWindow()
})

app.on('window-all-closed', () => {
  log.info('window-all-closed, 清理所有会话')
  sessions.disposeAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
