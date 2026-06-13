import { Client, ClientChannel, SFTPWrapper } from 'ssh2'
import type { SshCredentials, FileEntry } from '@shared/types'

type DataHandler = (data: string) => void
type CloseHandler = () => void

function fmtMode(mode: number): string {
  const t = (mode & 0o170000) === 0o040000 ? 'd' : (mode & 0o120000) === 0o120000 ? 'l' : '-'
  const rwx = (m: number): string =>
    (m & 4 ? 'r' : '-') + (m & 2 ? 'w' : '-') + (m & 1 ? 'x' : '-')
  return t + rwx((mode >> 6) & 7) + rwx((mode >> 3) & 7) + rwx(mode & 7)
}

/**
 * Wraps a single ssh2 Client. One connection serves three channels:
 *   - interactive shell  -> terminal
 *   - exec               -> monitor collection
 *   - sftp               -> file management
 */
export class SshConnection {
  private client = new Client()
  private shell?: ClientChannel
  private sftpWrap?: SFTPWrapper

  connect(creds: SshCredentials): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client
        .on('ready', () => resolve())
        .on('error', (err) => reject(err))
        .connect({
          host: creds.host,
          port: creds.port,
          username: creds.username,
          password: creds.password,
          keepaliveInterval: 15000,
          readyTimeout: 20000
        })
    })
  }

  openShell(cols: number, rows: number, onData: DataHandler, onClose: CloseHandler): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
        if (err) return reject(err)
        this.shell = stream
        stream.on('data', (d: Buffer) => onData(d.toString('utf8')))
        stream.stderr.on('data', (d: Buffer) => onData(d.toString('utf8')))
        stream.on('close', () => onClose())
        resolve()
      })
    })
  }

  write(data: string): void {
    this.shell?.write(data)
  }

  resize(cols: number, rows: number): void {
    this.shell?.setWindow(rows, cols, 0, 0)
  }

  /** Run a command, return combined stdout. Used by the monitor. */
  exec(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client.exec(cmd, (err, stream) => {
        if (err) return reject(err)
        let out = ''
        stream.on('data', (d: Buffer) => (out += d.toString('utf8')))
        stream.on('close', () => resolve(out))
      })
    })
  }

  private sftp(): Promise<SFTPWrapper> {
    if (this.sftpWrap) return Promise.resolve(this.sftpWrap)
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) return reject(err)
        this.sftpWrap = sftp
        resolve(sftp)
      })
    })
  }

  async list(path: string): Promise<FileEntry[]> {
    const sftp = await this.sftp()
    return new Promise((resolve, reject) => {
      sftp.readdir(path, (err, list) => {
        if (err) return reject(err)
        const entries = list
          .map((i) => ({
            name: i.filename,
            isDir: i.attrs.isDirectory(),
            size: i.attrs.size,
            mtime: i.attrs.mtime,
            mode: i.attrs.mode,
            permissions: fmtMode(i.attrs.mode)
          }))
          .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
        resolve(entries)
      })
    })
  }

  async download(remote: string, local: string): Promise<void> {
    const sftp = await this.sftp()
    return new Promise((resolve, reject) =>
      sftp.fastGet(remote, local, (err) => (err ? reject(err) : resolve()))
    )
  }

  async upload(local: string, remote: string): Promise<void> {
    const sftp = await this.sftp()
    return new Promise((resolve, reject) =>
      sftp.fastPut(local, remote, (err) => (err ? reject(err) : resolve()))
    )
  }

  async remove(path: string, isDir: boolean): Promise<void> {
    const sftp = await this.sftp()
    return new Promise((resolve, reject) => {
      const cb = (err: Error | null | undefined): void => (err ? reject(err) : resolve())
      isDir ? sftp.rmdir(path, cb) : sftp.unlink(path, cb)
    })
  }

  async mkdir(path: string): Promise<void> {
    const sftp = await this.sftp()
    return new Promise((resolve, reject) =>
      sftp.mkdir(path, (err) => (err ? reject(err) : resolve()))
    )
  }

  dispose(): void {
    try {
      this.shell?.end()
      this.client.end()
    } catch {
      /* ignore */
    }
  }
}
