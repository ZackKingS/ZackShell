import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { log } from '../logger'
import type { SessionConfig, SessionSaveInput, SshCredentials } from '@shared/types'

function sessionsFile(): string {
  return join(app.getPath('userData'), 'sessions.json')
}
function secretsFile(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch (err) {
    log.error('SessionStore: 读取失败', path, err instanceof Error ? err.message : String(err))
    return fallback
  }
}

/**
 * 已保存会话的持久化:元数据(sessions.json,可脱敏导出)与加密后的密码
 * (secrets.json,基于 Electron safeStorage / Windows DPAPI)分开存储,
 * 密码的明文永不传回渲染进程。
 */
export class SessionStore {
  private sessions: SessionConfig[]
  private secrets: Record<string, string>

  constructor() {
    this.sessions = readJson<SessionConfig[]>(sessionsFile(), [])
    this.secrets = readJson<Record<string, string>>(secretsFile(), {})
  }

  private persistSessions(): void {
    writeFileSync(sessionsFile(), JSON.stringify(this.sessions, null, 2))
  }
  private persistSecrets(): void {
    writeFileSync(secretsFile(), JSON.stringify(this.secrets, null, 2))
  }

  list(): SessionConfig[] {
    return this.sessions
  }

  save(input: SessionSaveInput): SessionConfig {
    const id = input.id ?? randomUUID()
    const config: SessionConfig = {
      id,
      name: input.name || input.host,
      host: input.host,
      port: input.port,
      username: input.username
    }
    const idx = this.sessions.findIndex((s) => s.id === id)
    if (idx >= 0) this.sessions[idx] = config
    else this.sessions.push(config)
    this.persistSessions()

    if (input.password) {
      if (safeStorage.isEncryptionAvailable()) {
        this.secrets[id] = safeStorage.encryptString(input.password).toString('base64')
        this.persistSecrets()
      } else {
        log.warn('SessionStore: safeStorage 不可用,密码未持久化', id)
      }
    }
    return config
  }

  delete(id: string): void {
    this.sessions = this.sessions.filter((s) => s.id !== id)
    this.persistSessions()
    if (id in this.secrets) {
      delete this.secrets[id]
      this.persistSecrets()
    }
  }

  getCredentials(id: string): SshCredentials | null {
    const cfg = this.sessions.find((s) => s.id === id)
    if (!cfg) return null
    let password: string | undefined
    const enc = this.secrets[id]
    if (enc && safeStorage.isEncryptionAvailable()) {
      try {
        password = safeStorage.decryptString(Buffer.from(enc, 'base64'))
      } catch (err) {
        log.error('SessionStore: 密码解密失败', id, err instanceof Error ? err.message : String(err))
      }
    }
    return { host: cfg.host, port: cfg.port, username: cfg.username, password }
  }
}
