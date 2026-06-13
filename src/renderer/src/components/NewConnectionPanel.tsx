import { useState } from 'react'
import type { SessionConfig, SessionSaveInput, SshCredentials } from '@shared/types'
import FloatingWindow from './FloatingWindow'

interface Props {
  initial?: SessionConfig | null
  busy: boolean
  error?: string
  onCancel: () => void
  onConnect: (creds: SshCredentials) => void
  onSave: (input: SessionSaveInput) => void
  onSaveAndConnect: (input: SessionSaveInput) => void
}

export default function NewConnectionPanel({
  initial,
  busy,
  error,
  onCancel,
  onConnect,
  onSave,
  onSaveAndConnect
}: Props): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [host, setHost] = useState(initial?.host ?? '')
  const [port, setPort] = useState(String(initial?.port ?? 22))
  const [username, setUsername] = useState(initial?.username ?? '')
  const [password, setPassword] = useState('')

  const valid = host.trim() !== '' && username.trim() !== ''

  function portNum(): number {
    const n = Number(port)
    return Number.isFinite(n) && n > 0 ? n : 22
  }

  function buildInput(): SessionSaveInput {
    return {
      id: initial?.id,
      name: name.trim() || host.trim(),
      host: host.trim(),
      port: portNum(),
      username: username.trim(),
      password: password || undefined
    }
  }

  function submit(): void {
    if (!valid || busy) return
    onSaveAndConnect(buildInput())
  }

  return (
    <FloatingWindow
      title={initial ? '编辑连接' : '新建连接'}
      onClose={onCancel}
      width={300}
      initial={{ x: 420, y: 60 }}
    >
      <div className="conn-form" onKeyDown={(e) => e.key === 'Enter' && submit()}>
        <label>
          名称
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="可选,默认用主机名" />
        </label>
        <label>
          主机
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="host / IP" />
        </label>
        <label>
          端口
          <input value={port} onChange={(e) => setPort(e.target.value)} style={{ width: 70 }} />
        </label>
        <label>
          用户名
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={initial ? '留空则不修改' : ''}
          />
        </label>
        {error && <div className="fm-err">{error}</div>}
        <div className="conn-actions">
          <button
            onClick={() =>
              onConnect({
                host: host.trim(),
                port: portNum(),
                username: username.trim(),
                password: password || undefined
              })
            }
            disabled={!valid || busy}
          >
            连接
          </button>
          <button onClick={() => onSaveAndConnect(buildInput())} disabled={!valid || busy}>
            保存并连接
          </button>
          <button onClick={() => onSave(buildInput())} disabled={!valid || busy}>
            保存
          </button>
        </div>
      </div>
    </FloatingWindow>
  )
}
