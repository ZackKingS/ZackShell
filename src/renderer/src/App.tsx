import { useEffect, useRef, useState } from 'react'
import type { ConnectResult, Metrics, SessionConfig, SessionSaveInput, SshCredentials } from '@shared/types'
import TerminalView from './components/TerminalView'
import FileManager from './components/FileManager'
import MonitorPanel from './components/MonitorPanel'
import ServerListPanel from './components/ServerListPanel'
import NewConnectionPanel from './components/NewConnectionPanel'

type Status = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'
type Tab = 'terminal' | 'files'

export default function App(): JSX.Element {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('terminal')
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const sid = useRef<string | null>(null)

  // 已保存服务器列表 + 两个悬浮窗的显示状态
  const [sessionsList, setSessionsList] = useState<SessionConfig[]>([])
  const [showList, setShowList] = useState(true)
  const [editing, setEditing] = useState<SessionConfig | null | undefined>(undefined)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

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

  async function refreshSessions(): Promise<void> {
    const r = await window.api.listSessions()
    if (r.ok && r.sessions) setSessionsList(r.sessions)
  }

  useEffect(() => {
    refreshSessions()
  }, [])

  function applyConnectResult(res: ConnectResult, host: string, port: number, username: string): void {
    if (res.ok && res.sessionId) {
      console.log('[App] 连接成功', res.sessionId)
      sid.current = res.sessionId
      setSessionId(res.sessionId)
      setStatus('connected')
      setHost(host)
      setPort(String(port))
      setUsername(username)
      window.api.startMonitor(res.sessionId, 2000)
      setShowList(false)
      setEditing(undefined)
    } else {
      console.error('[App] 连接失败', res.error)
      setStatus('error')
      setError(res.error ?? 'unknown error')
    }
  }

  async function doConnect(creds: SshCredentials): Promise<void> {
    console.log('[App] 发起连接', `${creds.username}@${creds.host}:${creds.port}`)
    setStatus('connecting')
    setError('')
    setFormError('')
    const res = await window.api.connect(creds, 80, 24)
    applyConnectResult(res, creds.host, creds.port, creds.username)
  }

  async function connectSaved(s: SessionConfig): Promise<void> {
    console.log('[App] 发起连接(已保存)', `${s.username}@${s.host}:${s.port}`)
    setConnectingId(s.id)
    setStatus('connecting')
    setError('')
    const res = await window.api.connectSaved(s.id, 80, 24)
    setConnectingId(null)
    applyConnectResult(res, s.host, s.port, s.username)
  }

  async function saveSession(input: SessionSaveInput): Promise<void> {
    setFormError('')
    const r = await window.api.saveSession(input)
    if (r.ok) {
      await refreshSessions()
      setEditing(undefined)
    } else {
      setFormError(r.error ?? '保存失败')
    }
  }

  async function saveAndConnect(input: SessionSaveInput): Promise<void> {
    setFormError('')
    const r = await window.api.saveSession(input)
    if (!r.ok || !r.session) {
      setFormError(r.error ?? '保存失败')
      return
    }
    await refreshSessions()
    await connectSaved(r.session)
  }

  async function deleteSession(id: string): Promise<void> {
    if (!confirm('删除该会话?')) return
    await window.api.deleteSession(id)
    await refreshSessions()
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
        <button onClick={() => setShowList(true)}>会话列表</button>
        {connected && (
          <span className="conn-info">
            {username}@{host}:{port}
          </span>
        )}
        {connected && <button onClick={disconnect}>断开</button>}
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

      {showList && (
        <ServerListPanel
          sessions={sessionsList}
          connectingId={connectingId}
          onConnect={connectSaved}
          onEdit={(s) => {
            setFormError('')
            setEditing(s)
          }}
          onDelete={deleteSession}
          onNew={() => {
            setFormError('')
            setEditing(null)
          }}
          onClose={() => setShowList(false)}
        />
      )}
      {editing !== undefined && (
        <NewConnectionPanel
          initial={editing}
          busy={status === 'connecting'}
          error={formError}
          onCancel={() => setEditing(undefined)}
          onConnect={doConnect}
          onSave={saveSession}
          onSaveAndConnect={saveAndConnect}
        />
      )}
    </div>
  )
}
