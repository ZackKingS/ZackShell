import { useEffect, useRef } from 'react'
import type { Metrics } from '@shared/types'
import { fmtBytes, fmtBps, fmtUptime } from '../util/format'

interface Props {
  metrics: Metrics | null
  host?: string
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
  const w = 240
  const h = 30
  const step = data.length > 1 ? w / (data.length - 1) : w
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * h}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="spark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

export default function MonitorPanel({ metrics, host }: Props): JSX.Element {
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

  async function copyIp(): Promise<void> {
    if (host) await navigator.clipboard.writeText(host)
  }

  const memPct = metrics?.mem.total ? (metrics.mem.used / metrics.mem.total) * 100 : 0
  const swapPct = metrics?.swap.total ? (metrics.swap.used / metrics.swap.total) * 100 : 0

  return (
    <div className="mon">
      <div className="mon-ip-row">
        <span className="mon-ip">{host || '未连接'}</span>
        {host && (
          <button className="mon-copy" onClick={copyIp}>
            复制
          </button>
        )}
      </div>

      {!metrics ? (
        <div className="mon-empty">连接后显示服务器监控…</div>
      ) : (
        <>
          <div className="mon-stat-row">
            <span>运行</span>
            <b>{fmtUptime(metrics.uptimeSec)}</b>
          </div>
          <div className="mon-stat-row">
            <span>负载</span>
            <b>{metrics.load.join(', ')}</b>
          </div>

          <div className="mon-bar-row">
            <span className="mon-bar-label">CPU</span>
            <Bar pct={metrics.cpu} />
            <span className="mon-bar-val">{metrics.cpu.toFixed(0)}%</span>
          </div>
          <div className="mon-bar-row">
            <span className="mon-bar-label">内存</span>
            <Bar pct={memPct} />
            <span className="mon-bar-val">
              {fmtBytes(metrics.mem.used)}/{fmtBytes(metrics.mem.total)}
            </span>
          </div>
          {metrics.swap.total > 0 && (
            <div className="mon-bar-row">
              <span className="mon-bar-label">交换</span>
              <Bar pct={swapPct} />
              <span className="mon-bar-val">
                {fmtBytes(metrics.swap.used)}/{fmtBytes(metrics.swap.total)}
              </span>
            </div>
          )}

          <table className="proc">
            <thead>
              <tr>
                <th>内存</th>
                <th>CPU</th>
                <th>命令</th>
              </tr>
            </thead>
            <tbody>
              {metrics.procs.slice(0, 8).map((p) => (
                <tr key={p.pid}>
                  <td>{p.mem.toFixed(1)}%</td>
                  <td>{p.cpu.toFixed(1)}</td>
                  <td>{p.name}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mon-net-head">
            <span>
              ↑{fmtBps(net?.txBps ?? 0)} ↓{fmtBps(net?.rxBps ?? 0)}
            </span>
            <span className="mon-net-iface">{net?.iface ?? ''}</span>
          </div>
          <Spark data={rxHist.current} color="#61afef" />
          <Spark data={txHist.current} color="#c678dd" />

          <table className="disk-table">
            <thead>
              <tr>
                <th>路径</th>
                <th>可用/大小</th>
              </tr>
            </thead>
            <tbody>
              {metrics.disks.map((d) => (
                <tr key={d.mount}>
                  <td className="mono">{d.mount}</td>
                  <td>
                    {fmtBytes(d.total - d.used)}/{fmtBytes(d.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
