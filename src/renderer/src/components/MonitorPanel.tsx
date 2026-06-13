import { useEffect, useRef } from 'react'
import type { Metrics } from '@shared/types'
import { fmtBytes, fmtBps, fmtUptime } from '../util/format'

interface Props {
  metrics: Metrics | null
}

function Bar({ pct, danger }: { pct: number; danger?: boolean }): JSX.Element {
  const color = pct > 90 || danger ? '#e06c75' : pct > 70 ? '#e5c07b' : '#98c379'
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}

// Tiny inline sparkline for network history.
function Spark({ data, color }: { data: number[]; color: string }): JSX.Element {
  const max = Math.max(1, ...data)
  const w = 260
  const h = 36
  const step = data.length > 1 ? w / (data.length - 1) : w
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * h}`).join(' ')
  return (
    <svg width={w} height={h} className="spark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

export default function MonitorPanel({ metrics }: Props): JSX.Element {
  const rxHist = useRef<number[]>([])
  const txHist = useRef<number[]>([])

  const net = metrics?.net[0]
  useEffect(() => {
    if (!metrics) return
    const push = (arr: number[], v: number): void => {
      arr.push(v)
      if (arr.length > 60) arr.shift()
    }
    push(rxHist.current, net?.rxBps ?? 0)
    push(txHist.current, net?.txBps ?? 0)
  }, [metrics, net])

  if (!metrics) {
    return <div className="mon mon-empty">连接后显示服务器监控…</div>
  }

  const memPct = metrics.mem.total ? (metrics.mem.used / metrics.mem.total) * 100 : 0
  const swapPct = metrics.swap.total ? (metrics.swap.used / metrics.swap.total) * 100 : 0

  return (
    <div className="mon">
      <div className="card">
        <div className="card-title">系统信息</div>
        <div className="kv">负载 <b>{metrics.load.join(' / ')}</b></div>
        <div className="kv">运行 <b>{fmtUptime(metrics.uptimeSec)}</b></div>
        <div className="kv">CPU 核心 <b>{metrics.cores}</b></div>
      </div>

      <div className="card">
        <div className="card-title">CPU <span className="pct">{metrics.cpu.toFixed(1)}%</span></div>
        <Bar pct={metrics.cpu} />
      </div>

      <div className="card">
        <div className="card-title">内存 <span className="pct">{fmtBytes(metrics.mem.used)} / {fmtBytes(metrics.mem.total)}</span></div>
        <Bar pct={memPct} />
        {metrics.swap.total > 0 && (
          <>
            <div className="card-sub">交换 {fmtBytes(metrics.swap.used)} / {fmtBytes(metrics.swap.total)}</div>
            <Bar pct={swapPct} />
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          网络 {net?.iface ?? ''}
          <span className="pct">↓{fmtBps(net?.rxBps ?? 0)} ↑{fmtBps(net?.txBps ?? 0)}</span>
        </div>
        <Spark data={rxHist.current} color="#61afef" />
        <Spark data={txHist.current} color="#c678dd" />
      </div>

      <div className="card">
        <div className="card-title">磁盘</div>
        {metrics.disks.map((d) => {
          const pct = d.total ? (d.used / d.total) * 100 : 0
          return (
            <div key={d.mount} className="disk">
              <div className="disk-head">
                <span>{d.mount}</span>
                <span>{fmtBytes(d.used)} / {fmtBytes(d.total)}</span>
              </div>
              <Bar pct={pct} />
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-title">进程 (内存占用 Top)</div>
        <table className="proc">
          <thead>
            <tr><th>PID</th><th>名称</th><th>CPU%</th><th>内存%</th></tr>
          </thead>
          <tbody>
            {metrics.procs.slice(0, 8).map((p) => (
              <tr key={p.pid}>
                <td>{p.pid}</td><td>{p.name}</td><td>{p.cpu.toFixed(1)}</td><td>{p.mem.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
