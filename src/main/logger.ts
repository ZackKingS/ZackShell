import { createWriteStream, mkdirSync, type WriteStream } from 'fs'
import { join } from 'path'

/**
 * Tiny file + console logger for the main process.
 *
 * 日志同时输出到:
 *   1. 终端(运行 npm run dev 的控制台)
 *   2. 文件 logs/zackshell.log(追加写入,方便排查白屏等问题)
 *
 * 关键用途:主进程会把「渲染进程的 console 报错」也转发到这里,
 * 所以即使页面白屏,真实错误也会落到日志文件里。
 */

const LOG_DIR = join(process.cwd(), 'logs')
const LOG_FILE = join(LOG_DIR, 'zackshell.log')

let stream: WriteStream | null = null
try {
  mkdirSync(LOG_DIR, { recursive: true })
  stream = createWriteStream(LOG_FILE, { flags: 'a' }) // 追加,不覆盖历史
} catch (e) {
  // 文件不可写时退化为仅控制台
  console.error('[logger] cannot open log file:', e)
}

function ts(): string {
  return new Date().toISOString()
}

function fmt(args: unknown[]): string {
  return args
    .map((a) => (typeof a === 'string' ? a : (() => {
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })()))
    .join(' ')
}

function write(level: string, args: unknown[]): void {
  const line = `[${ts()}] [${level}] ${fmt(args)}`
  // 控制台
  if (level === 'ERROR') console.error(line)
  else if (level === 'WARN') console.warn(line)
  else console.log(line)
  // 文件
  stream?.write(line + '\n')
}

export const log = {
  info: (...a: unknown[]): void => write('INFO', a),
  warn: (...a: unknown[]): void => write('WARN', a),
  error: (...a: unknown[]): void => write('ERROR', a)
}

export const LOG_FILE_PATH = LOG_FILE

// 启动分隔线,方便区分每次运行
write('INFO', ['================ ZackShell 启动 ================'])
write('INFO', [`日志文件: ${LOG_FILE}`])
