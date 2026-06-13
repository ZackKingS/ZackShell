import { useCallback, useEffect, useState } from 'react'
import type { FileEntry } from '@shared/types'
import { fmtBytes, fmtTime } from '../util/format'

interface Props {
  sessionId: string | null
  visible: boolean
}

function joinPath(cwd: string, name: string): string {
  return cwd.endsWith('/') ? cwd + name : cwd + '/' + name
}
function parentPath(p: string): string {
  if (p === '/') return '/'
  const i = p.replace(/\/$/, '').lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}

export default function FileManager({ sessionId, visible }: Props): JSX.Element {
  const [cwd, setCwd] = useState('.')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(
    async (path: string) => {
      if (!sessionId) return
      const r = await window.api.list(sessionId, path)
      if (r.ok && r.entries) {
        setEntries(r.entries)
        setCwd(r.cwd!)
        setErr('')
      } else {
        setErr(r.error || 'load failed')
      }
    },
    [sessionId]
  )

  // Resolve '.' to the real home dir on first open.
  useEffect(() => {
    if (visible && sessionId && !loaded) {
      setLoaded(true)
      load('.')
    }
    if (!sessionId) setLoaded(false)
  }, [visible, sessionId, loaded, load])

  async function enter(e: FileEntry): Promise<void> {
    if (e.isDir) await load(joinPath(cwd, e.name))
  }
  async function download(e: FileEntry): Promise<void> {
    if (!sessionId || e.isDir) return
    const r = await window.api.download(sessionId, joinPath(cwd, e.name), e.name)
    if (!r.ok && r.error !== 'canceled') setErr(r.error || 'download failed')
  }
  async function del(e: FileEntry): Promise<void> {
    if (!sessionId) return
    if (!confirm(`删除 ${e.name} ?`)) return
    const r = await window.api.deletePath(sessionId, joinPath(cwd, e.name), e.isDir)
    if (r.ok) load(cwd)
    else setErr(r.error || 'delete failed')
  }
  async function upload(): Promise<void> {
    if (!sessionId) return
    const r = await window.api.upload(sessionId, cwd)
    if (r.ok) load(cwd)
    else if (r.error !== 'canceled') setErr(r.error || 'upload failed')
  }
  async function mkdir(): Promise<void> {
    if (!sessionId) return
    const name = prompt('新建文件夹名称')
    if (!name) return
    const r = await window.api.mkdir(sessionId, joinPath(cwd, name))
    if (r.ok) load(cwd)
    else setErr(r.error || 'mkdir failed')
  }

  return (
    <div className="fm">
      <div className="fm-bar">
        <button onClick={() => load(parentPath(cwd))} title="上级">↑</button>
        <button onClick={() => load(cwd)} title="刷新">⟳</button>
        <span className="fm-path">{cwd}</span>
        <button onClick={upload}>上传</button>
        <button onClick={mkdir}>新建文件夹</button>
      </div>
      {err && <div className="fm-err">{err}</div>}
      <div className="fm-table">
        <table>
          <thead>
            <tr>
              <th style={{ width: '40%' }}>名称</th>
              <th>大小</th>
              <th>权限</th>
              <th>修改时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.name} onDoubleClick={() => enter(e)}>
                <td>{e.isDir ? '📁 ' : '📄 '}{e.name}</td>
                <td>{e.isDir ? '-' : fmtBytes(e.size)}</td>
                <td className="mono">{e.permissions}</td>
                <td>{fmtTime(e.mtime)}</td>
                <td className="fm-actions">
                  {!e.isDir && <a onClick={() => download(e)}>下载</a>}
                  <a onClick={() => del(e)}>删除</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
