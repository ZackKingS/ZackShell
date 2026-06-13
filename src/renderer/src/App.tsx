import { useEffect, useState } from 'react'
import type { ConnectResult, Metrics, SessionConfig, SessionSaveInput, SshCredentials } from '@shared/types'
import TerminalView from './components/TerminalView'
import FileManager from './components/FileManager'
import MonitorPanel from './components/MonitorPanel'
import ServerListPanel from './components/ServerListPanel'
import NewConnectionPanel from './components/NewConnectionPanel'

type View = 'terminal' | 'files'

interface ConnTab {
  sessionId: string
  host: string
  port: string
  username: string
  status: 'connected' | 'closed'
  metrics: Metrics | null
  view: View
}

export default function App(): JSX.Element {
  const [tabs, setTabs] = useState<ConnTab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  // 已保存服务器列表 + 两个悬浮窗的显示状态
  const [sessionsList, setSessionsList] = useState<SessionConfig[]>([])
  const [showList, setShowList] = useState(true)
  const [editing, setEditing] = useState<SessionConfig | null | undefined>(undefined)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const offClosed = window.api.onClosed((sid) => {
      setTabs((prev) => prev.map((t) => (t.sessionId === sid ? { ...t, status: 'closed', metrics: null } : t)))
    })
    const offMetrics = window.api.onMetrics((sid, m) => {
      setTabs((prev) => prev.map((t) => (t.sessionId === sid ? { ...t, metrics: m } : t)))
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

  function addTab(sessionId: string, host: string, port: number, username: string): void {
    const tab: ConnTab = {
      sessionId,
      host,
      port: String(port),
      username,
      status: 'connected',
      metrics: null,
      view: 'terminal'
    }
    setTabs((prev) => [...prev, tab])
    setActiveId(sessionId)
    window.api.startMonitor(sessionId, 2000)
    setShowList(false)
    setEditing(undefined)
  }

  function applyConnectResult(
    res: ConnectResult,
    host: string,
    port: number,
    username: string
  ): string | undefined {
    if (res.ok && res.sessionId) {
      console.log('[App] 连接成功', res.sessionId)
      addTab(res.sessionId, host, port, username)
      return undefined
    }
    console.error('[App] 连接失败', res.error)
    return res.error ?? 'unknown error'
  }

  async function doConnect(creds: SshCredentials): Promise<void> {
    console.log('[App] 发起连接', `${creds.username}@${creds.host}:${creds.port}`)
    setConnecting(true)
    setConnectError('')
    setFormError('')
    const res = await window.api.connect(creds, 80, 24)
    setConnecting(false)
    const err = applyConnectResult(res, creds.host, creds.port, creds.username)
    if (err) setFormError(err)
  }

  async function connectSaved(s: SessionConfig): Promise<void> {
    console.log('[App] 发起连接(已保存)', `${s.username}@${s.host}:${s.port}`)
    setConnectingId(s.id)
    setConnectError('')
    const res = await window.api.connectSaved(s.id, 80, 24)
    setConnectingId(null)
    const err = applyConnectResult(res, s.host, s.port, s.username)
    if (err) setConnectError(err)
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

  function closeTab(sessionId: string): void {
    window.api.disconnect(sessionId)
    window.api.stopMonitor(sessionId)
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.sessionId === sessionId)
      const next = prev.filter((t) => t.sessionId !== sessionId)
      if (activeId === sessionId) {
        const fallback = next[Math.min(idx, next.length - 1)]
        setActiveId(fallback ? fallback.sessionId : null)
      }
      return next
    })
  }

  function setActiveView(view: View): void {
    setTabs((prev) => prev.map((t) => (t.sessionId === activeId ? { ...t, view } : t)))
  }

  const activeTab = tabs.find((t) => t.sessionId === activeId)

  return (
    <div className="app">
      <div className="bar">
        <strong className="logo">ZackShell</strong>
        <div className="conn-tabs">
          {tabs.map((t) => (
            <div
              key={t.sessionId}
              className={`conn-tab${t.sessionId === activeId ? ' on' : ''}`}
              onClick={() => setActiveId(t.sessionId)}
            >
              <span className={t.status === 'connected' ? 'dot on' : 'dot off'}>●</span>
              <span className="conn-tab-label">{t.username}@{t.host}</span>
              <span
                className="conn-tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.sessionId)
                }}
              >
                ×
              </span>
            </div>
          ))}
          <button className="conn-tab-add" title="新建连接" onClick={() => setShowList(true)}>
            +
          </button>
        </div>
        {connecting && <span className="status mid">◐ 连接中</span>}
        {connectError && <span className="status err">✕ {connectError}</span>}
      </div>

      <div className="main">
        <div className="monitor-pane">
          <MonitorPanel metrics={activeTab?.metrics ?? null} host={activeTab?.host ?? ''} />
        </div>
        <div className="workspace">
          {activeTab ? (
            <>
              <div className="tabs">
                <div className={activeTab.view === 'terminal' ? 'tab on' : 'tab'} onClick={() => setActiveView('terminal')}>
                  终端
                </div>
                <div className={activeTab.view === 'files' ? 'tab on' : 'tab'} onClick={() => setActiveView('files')}>
                  文件
                </div>
              </div>
              <div className="tab-body">
                {tabs.map((t) => (
                  <div key={t.sessionId} style={{ display: t.sessionId === activeId ? 'block' : 'none', height: '100%' }}>
                    <div style={{ display: t.view === 'terminal' ? 'block' : 'none', height: '100%' }}>
                      <TerminalView sessionId={t.sessionId} visible={t.sessionId === activeId && t.view === 'terminal'} />
                    </div>
                    <div style={{ display: t.view === 'files' ? 'block' : 'none', height: '100%' }}>
                      <FileManager sessionId={t.sessionId} visible={t.sessionId === activeId && t.view === 'files'} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="workspace-empty">还没有连接,点击右上角「+」新建连接</div>
          )}
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
          busy={connecting}
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
