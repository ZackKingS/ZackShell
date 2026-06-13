import type { Metrics } from '@shared/types'
import type { SshConnection } from '../ssh/SshConnection'
import { log } from '../logger'

// One command, multiple sections, parsed in the main process.
const SCRIPT = [
  `echo '##CPU##'; cat /proc/stat | grep '^cpu'`,
  `echo '##MEM##'; cat /proc/meminfo`,
  `echo '##NET##'; cat /proc/net/dev`,
  `echo '##DISK##'; df -P -B1`,
  `echo '##LOAD##'; cat /proc/loadavg`,
  `echo '##UP##'; cat /proc/uptime`,
  `echo '##PROC##'; ps -eo pid,comm,%cpu,%mem --sort=-%mem 2>/dev/null | head -n 11`
].join('; ')

interface RawSample {
  cpu: { idle: number; total: number }
  net: Map<string, { rx: number; tx: number }>
  t: number // ms timestamp
}

/** Splits the combined output into its sections. */
function splitSections(out: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {}
  let cur = ''
  for (const line of out.split('\n')) {
    const m = line.match(/^##(\w+)##$/)
    if (m) {
      cur = m[1]
      sections[cur] = []
    } else if (cur) {
      sections[cur].push(line)
    }
  }
  return sections
}

function parseCpu(lines: string[]): { idle: number; total: number; cores: number } {
  const agg = lines.find((l) => l.startsWith('cpu '))!
  const n = agg.trim().split(/\s+/).slice(1).map(Number)
  const idle = n[3] + (n[4] || 0) // idle + iowait
  const total = n.reduce((a, b) => a + b, 0)
  const cores = lines.filter((l) => /^cpu\d+/.test(l)).length || 1
  return { idle, total, cores }
}

function parseMeminfo(lines: string[]): { mem: Metrics['mem']; swap: Metrics['swap'] } {
  const kv: Record<string, number> = {}
  for (const l of lines) {
    const m = l.match(/^(\w+):\s+(\d+)/)
    if (m) kv[m[1]] = Number(m[2]) * 1024 // kB -> bytes
  }
  const memTotal = kv.MemTotal || 0
  const memAvail = kv.MemAvailable ?? kv.MemFree ?? 0
  const swapTotal = kv.SwapTotal || 0
  const swapFree = kv.SwapFree || 0
  return {
    mem: { used: memTotal - memAvail, total: memTotal },
    swap: { used: swapTotal - swapFree, total: swapTotal }
  }
}

function parseNet(lines: string[]): Map<string, { rx: number; tx: number }> {
  const map = new Map<string, { rx: number; tx: number }>()
  for (const l of lines) {
    const m = l.match(/^\s*([\w.-]+):\s*(.+)$/)
    if (!m) continue
    const iface = m[1]
    if (iface === 'lo') continue
    const f = m[2].trim().split(/\s+/).map(Number)
    map.set(iface, { rx: f[0], tx: f[8] })
  }
  return map
}

function parseDisk(lines: string[]): Metrics['disks'] {
  const disks: Metrics['disks'] = []
  for (const l of lines.slice(1)) {
    const f = l.trim().split(/\s+/)
    if (f.length < 6) continue
    const [fs, total, used] = f
    const mount = f.slice(5).join(' ')
    if (!fs.startsWith('/dev/')) continue // real block devices only
    disks.push({ mount, used: Number(used), total: Number(total) })
  }
  return disks
}

function parseProcs(lines: string[]): Metrics['procs'] {
  return lines
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((f) => f.length >= 4)
    .map((f) => ({ pid: Number(f[0]), name: f[1], cpu: Number(f[2]), mem: Number(f[3]) }))
}

/** Polls one connection, computes rate metrics via diff between samples. */
export class MonitorService {
  private timer?: NodeJS.Timeout
  private prev?: RawSample
  private running = false

  constructor(
    private conn: SshConnection,
    private emit: (m: Metrics) => void
  ) {}

  start(intervalMs = 2000): void {
    if (this.running) return
    this.running = true
    const tick = async (): Promise<void> => {
      if (!this.running) return
      try {
        await this.collect()
      } catch (e) {
        // 采集偶发失败不致命,但记录下来便于排查
        log.warn('monitor collect 失败:', e instanceof Error ? e.message : String(e))
      }
      if (this.running) this.timer = setTimeout(tick, intervalMs)
    }
    tick()
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
  }

  private async collect(): Promise<void> {
    const out = await this.conn.exec(SCRIPT)
    const s = splitSections(out)
    const cpu = parseCpu(s.CPU || [])
    const { mem, swap } = parseMeminfo(s.MEM || [])
    const net = parseNet(s.NET || [])
    const disks = parseDisk(s.DISK || [])
    const load = (s.LOAD?.[0] || '0 0 0').trim().split(/\s+/).map(Number) as [number, number, number]
    const uptimeSec = Number((s.UP?.[0] || '0').trim().split(/\s+/)[0])
    const procs = parseProcs(s.PROC || [])

    const now = Date.now()
    const sample: RawSample = { cpu: { idle: cpu.idle, total: cpu.total }, net, t: now }

    let cpuPct = 0
    const netOut: Metrics['net'] = []
    if (this.prev) {
      const dTotal = cpu.total - this.prev.cpu.total
      const dIdle = cpu.idle - this.prev.cpu.idle
      cpuPct = dTotal > 0 ? Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)) : 0
      const dt = (now - this.prev.t) / 1000
      for (const [iface, cur] of net) {
        const p = this.prev.net.get(iface)
        if (p && dt > 0) {
          netOut.push({
            iface,
            rxBps: Math.max(0, (cur.rx - p.rx) / dt),
            txBps: Math.max(0, (cur.tx - p.tx) / dt)
          })
        }
      }
    }
    this.prev = sample

    // First sample has no diff yet — skip emitting until we have rates.
    if (cpuPct === 0 && netOut.length === 0 && this.prev) {
      // still emit static data so panel isn't blank
    }
    this.emit({
      cpu: Math.round(cpuPct * 10) / 10,
      cores: cpu.cores,
      mem,
      swap,
      disks,
      net: netOut,
      load,
      uptimeSec,
      procs
    })
  }
}
