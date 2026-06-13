import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type SshCredentials,
  type ConnectResult,
  type ListResult,
  type SimpleResult,
  type Metrics,
  type SessionSaveInput,
  type SessionsResult,
  type SessionSaveResult
} from '@shared/types'

// Whitelisted API exposed to the renderer. The renderer never touches
// Node / network directly — only these typed calls.
const api = {
  // session / terminal
  connect: (creds: SshCredentials, cols: number, rows: number): Promise<ConnectResult> =>
    ipcRenderer.invoke(IPC.sessionConnect, { creds, cols, rows }),
  disconnect: (sessionId: string): void => ipcRenderer.send(IPC.sessionDisconnect, { sessionId }),
  sendInput: (sessionId: string, data: string): void =>
    ipcRenderer.send(IPC.terminalInput, { sessionId, data }),
  resize: (sessionId: string, cols: number, rows: number): void =>
    ipcRenderer.send(IPC.terminalResize, { sessionId, cols, rows }),
  onData: (cb: (sessionId: string, data: string) => void): (() => void) => {
    const h = (_e: unknown, p: { sessionId: string; data: string }): void => cb(p.sessionId, p.data)
    ipcRenderer.on(IPC.terminalData, h)
    return () => ipcRenderer.removeListener(IPC.terminalData, h)
  },
  onClosed: (cb: (sessionId: string) => void): (() => void) => {
    const h = (_e: unknown, p: { sessionId: string }): void => cb(p.sessionId)
    ipcRenderer.on(IPC.sessionClosed, h)
    return () => ipcRenderer.removeListener(IPC.sessionClosed, h)
  },

  // monitor
  startMonitor: (sessionId: string, intervalMs?: number): void =>
    ipcRenderer.send(IPC.monitorStart, { sessionId, intervalMs }),
  stopMonitor: (sessionId: string): void => ipcRenderer.send(IPC.monitorStop, { sessionId }),
  onMetrics: (cb: (sessionId: string, m: Metrics) => void): (() => void) => {
    const h = (_e: unknown, p: { sessionId: string; metrics: Metrics }): void =>
      cb(p.sessionId, p.metrics)
    ipcRenderer.on(IPC.monitorUpdate, h)
    return () => ipcRenderer.removeListener(IPC.monitorUpdate, h)
  },

  // sftp
  list: (sessionId: string, path: string): Promise<ListResult> =>
    ipcRenderer.invoke(IPC.sftpList, { sessionId, path }),
  download: (sessionId: string, remote: string, name: string): Promise<SimpleResult> =>
    ipcRenderer.invoke(IPC.sftpDownload, { sessionId, remote, name }),
  upload: (sessionId: string, cwd: string): Promise<SimpleResult> =>
    ipcRenderer.invoke(IPC.sftpUpload, { sessionId, cwd }),
  deletePath: (sessionId: string, path: string, isDir: boolean): Promise<SimpleResult> =>
    ipcRenderer.invoke(IPC.sftpDelete, { sessionId, path, isDir }),
  mkdir: (sessionId: string, path: string): Promise<SimpleResult> =>
    ipcRenderer.invoke(IPC.sftpMkdir, { sessionId, path }),

  // saved sessions
  listSessions: (): Promise<SessionsResult> => ipcRenderer.invoke(IPC.sessionsList),
  saveSession: (input: SessionSaveInput): Promise<SessionSaveResult> =>
    ipcRenderer.invoke(IPC.sessionsSave, input),
  deleteSession: (id: string): Promise<SimpleResult> => ipcRenderer.invoke(IPC.sessionsDelete, { id }),
  connectSaved: (id: string, cols: number, rows: number): Promise<ConnectResult> =>
    ipcRenderer.invoke(IPC.sessionsConnect, { id, cols, rows })
}

contextBridge.exposeInMainWorld('api', api)

export type ZackApi = typeof api
