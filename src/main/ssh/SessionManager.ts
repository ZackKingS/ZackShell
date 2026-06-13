import { randomUUID } from 'crypto'
import { SshConnection } from './SshConnection'
import { MonitorService } from '../monitor/MonitorService'
import type { SshCredentials, Metrics } from '@shared/types'

interface SessionHooks {
  onData: (sessionId: string, data: string) => void
  onClose: (sessionId: string) => void
  onMetrics: (sessionId: string, m: Metrics) => void
}

/**
 * Owns the lifecycle of all live SSH connections + their monitors.
 * Renderer only holds the returned sessionId.
 */
export class SessionManager {
  private sessions = new Map<string, SshConnection>()
  private monitors = new Map<string, MonitorService>()

  constructor(private hooks: SessionHooks) {}

  async connect(creds: SshCredentials, cols: number, rows: number): Promise<string> {
    const conn = new SshConnection()
    await conn.connect(creds)
    const id = randomUUID()
    await conn.openShell(
      cols,
      rows,
      (data) => this.hooks.onData(id, data),
      () => this.cleanup(id)
    )
    this.sessions.set(id, conn)
    return id
  }

  get(id: string): SshConnection | undefined {
    return this.sessions.get(id)
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.resize(cols, rows)
  }

  startMonitor(id: string, intervalMs: number): void {
    const conn = this.sessions.get(id)
    if (!conn || this.monitors.has(id)) return
    const mon = new MonitorService(conn, (m) => this.hooks.onMetrics(id, m))
    this.monitors.set(id, mon)
    mon.start(intervalMs)
  }

  stopMonitor(id: string): void {
    this.monitors.get(id)?.stop()
    this.monitors.delete(id)
  }

  disconnect(id: string): void {
    this.cleanup(id)
  }

  private cleanup(id: string): void {
    if (!this.sessions.has(id) && !this.monitors.has(id)) return // already cleaned
    this.monitors.get(id)?.stop()
    this.monitors.delete(id)
    this.sessions.get(id)?.dispose()
    this.sessions.delete(id)
    this.hooks.onClose(id)
  }

  disposeAll(): void {
    for (const id of [...this.sessions.keys()]) this.cleanup(id)
  }
}
