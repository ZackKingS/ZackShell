import { useRef, useState, type ReactNode } from 'react'

interface Props {
  title: string
  onClose?: () => void
  initial?: { x: number; y: number }
  width?: number
  children: ReactNode
}

/**
 * 应用内可拖动的悬浮面板:固定定位 + 标题栏拖拽。
 * 供"服务器列表"和"新建连接"两个悬浮窗复用。
 */
export default function FloatingWindow({ title, onClose, initial, width, children }: Props): JSX.Element {
  const [pos, setPos] = useState(initial ?? { x: 120, y: 70 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  function onMouseMove(e: MouseEvent): void {
    if (!drag.current) return
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy })
  }
  function onMouseUp(): void {
    drag.current = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }
  function onMouseDown(e: React.MouseEvent): void {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div className="float-win" style={{ left: pos.x, top: pos.y, width }}>
      <div className="float-win-head" onMouseDown={onMouseDown}>
        <span>{title}</span>
        {onClose && (
          <button className="float-win-close" onClick={onClose} title="关闭">
            ×
          </button>
        )}
      </div>
      <div className="float-win-body">{children}</div>
    </div>
  )
}
