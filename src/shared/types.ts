// Shared types between main and renderer processes.

export interface SshCredentials {
  host: string
  port: number
  username: string
  password?: string
  // privateKey / passphrase to be added in later phases
}

export interface ConnectResult {
  ok: boolean
  sessionId?: string
  error?: string
}

// ---- SFTP ----
export interface FileEntry {
  name: string
  isDir: boolean
  size: number
  mtime: number // unix seconds
  mode: number
  permissions: string // e.g. drwxr-xr-x
}

export interface ListResult {
  ok: boolean
  cwd?: string
  entries?: FileEntry[]
  error?: string
}

export interface SimpleResult {
  ok: boolean
  error?: string
  info?: string
}

// ---- Monitoring ----
export interface Metrics {
  cpu: number // 0..100
  cores: number
  mem: { used: number; total: number }
  swap: { used: number; total: number }
  disks: Array<{ mount: string; used: number; total: number }>
  net: Array<{ iface: string; rxBps: number; txBps: number }>
  load: [number, number, number]
  uptimeSec: number
  procs: Array<{ pid: number; name: string; cpu: number; mem: number }>
}

// IPC channel names, kept in one place to avoid typos.
export const IPC = {
  sessionConnect: 'session:connect',
  sessionDisconnect: 'session:disconnect',
  terminalInput: 'terminal:input',
  terminalResize: 'terminal:resize',
  terminalData: 'terminal:data', // main -> renderer
  sessionClosed: 'session:closed', // main -> renderer

  sftpList: 'sftp:list',
  sftpDownload: 'sftp:download',
  sftpUpload: 'sftp:upload',
  sftpDelete: 'sftp:delete',
  sftpMkdir: 'sftp:mkdir',

  monitorStart: 'monitor:start',
  monitorStop: 'monitor:stop',
  monitorUpdate: 'monitor:update' // main -> renderer
} as const
