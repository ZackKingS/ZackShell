import { useEffect, useRef, useState } from 'react'
import type { Metrics } from '@shared/types'
import TerminalView from './components/TerminalView'
import FileManager from './components/FileManager'
import MonitorPanel from './components/MonitorPanel'

type Status = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'
type Tab = 'terminal' | 'files'

export default function App(): JSX.Element {
  const [host, setHost] = useState('20.203.241.199')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('azureuser')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('terminal')
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const sid = useRef<string | null>(null)

  useEffect(() => {
    const offClosed = window.api.onClosed((s) => {
      if (s === sid.current) {
        setStatus('closed')
        setSessionId(null)
        setMetrics(null)
        sid.current = null
      }
    })
    const offMetrics = window.api.onMetrics((s, m) => {
      if (s === sid.current) setMetrics(m)
    })
    return () => {
      offClosed()
      offMetrics()
    }
  }, [])

  async function connect(): Promise<void> {
    console.log('[App] 发起连接', `${username}@${host}:${port}`)
    setStatus('connecting')
    setError('')
    const res = await window.api.connect({ host, port: Number(port), username, password }, 80, 24)
    if (res.ok && res.sessionId) {
      console.log('[App] 连接成功', res.sessionId)
      sid.current = res.sessionId
      setSessionId(res.sessionId)
      setStatus('connected')
      window.api.startMonitor(res.sessionId, 2000)
    } else {
      console.error('[App] 连接失败', res.error)
      setStatus('error')
      setError(res.error ?? 'unknown error')
    }
  }

  function disconnect(): void {
    if (sid.current) window.api.disconnect(sid.current)
    sid.current = null
    setSessionId(null)
    setMetrics(null)
    setStatus('idle')
  }

  const connected = status === 'connected'

  return (
    <div className="app">
      <div className="bar">
        <strong className="logo">ZackShell</strong>
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="host" style={{ width: 130 }} />
        <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="port" style={{ width: 56 }} />
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="user" style={{ width: 100 }} />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          style={{ width: 130 }}
          onKeyDown={(e) => e.key === 'Enter' && !connected && connect()}
        />
        {connected ? (
          <button onClick={disconnect}>断开</button>
        ) : (
          <button onClick={connect} disabled={status === 'connecting'}>
            {status === 'connecting' ? '连接中…' : '连接'}
          </button>
        )}
        <span className="status">
          {status === 'connected' && '● 已连接'}
          {status === 'idle' && '○ 未连接'}
          {status === 'connecting' && '◐ 连接中'}
          {status === 'closed' && '○ 已断开'}
          {status === 'error' && <span className="err">✕ {error}</span>}
        </span>
      </div>

      <div className="main">
        <div className="workspace">
          <div className="tabs">
            <div className={tab === 'terminal' ? 'tab on' : 'tab'} onClick={() => setTab('terminal')}>终端</div>
            <div className={tab === 'files' ? 'tab on' : 'tab'} onClick={() => setTab('files')}>文件</div>
          </div>
          <div className="tab-body">
            <div style={{ display: tab === 'terminal' ? 'block' : 'none', height: '100%' }}>
              <TerminalView sessionId={sessionId} visible={tab === 'terminal'} />
            </div>
            <div style={{ display: tab === 'files' ? 'block' : 'none', height: '100%' }}>
              <FileManager sessionId={sessionId} visible={tab === 'files'} />
            </div>
          </div>
        </div>
        <div className="monitor-pane">
          <MonitorPanel metrics={metrics} />
        </div>
      </div>
    </div>
  )
}
