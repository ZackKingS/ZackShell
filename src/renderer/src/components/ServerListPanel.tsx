import type { SessionConfig } from '@shared/types'
import FloatingWindow from './FloatingWindow'

interface Props {
  sessions: SessionConfig[]
  connectingId: string | null
  onConnect: (s: SessionConfig) => void
  onEdit: (s: SessionConfig) => void
  onDelete: (id: string) => void
  onNew: () => void
  onClose: () => void
}

export default function ServerListPanel({
  sessions,
  connectingId,
  onConnect,
  onEdit,
  onDelete,
  onNew,
  onClose
}: Props): JSX.Element {
  return (
    <FloatingWindow title="连接管理器" onClose={onClose} width={340} initial={{ x: 40, y: 60 }}>
      <div className="srv-list">
        {sessions.length === 0 && <div className="srv-empty">暂无已保存的服务器</div>}
        {sessions.map((s) => (
          <div className="srv-item" key={s.id} onDoubleClick={() => onConnect(s)}>
            <div className="srv-info">
              <div className="srv-name">{s.name}</div>
              <div className="srv-addr">
                {s.username}@{s.host}:{s.port}
              </div>
            </div>
            <div className="srv-actions">
              <button onClick={() => onConnect(s)} disabled={connectingId === s.id}>
                {connectingId === s.id ? '连接中…' : '连接'}
              </button>
              <a onClick={() => onEdit(s)}>编辑</a>
              <a onClick={() => onDelete(s.id)}>删除</a>
            </div>
          </div>
        ))}
      </div>
      <div className="srv-footer">
        <button onClick={onNew}>+ 新建连接</button>
      </div>
    </FloatingWindow>
  )
}
