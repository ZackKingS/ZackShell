import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string | null
  visible: boolean
}

export default function TerminalView({ sessionId, visible }: Props): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const refit = useRef<(() => void) | null>(null)
  const sid = useRef<string | null>(null)

  useEffect(() => {
    sid.current = sessionId
  }, [sessionId])

  useEffect(() => {
    const t = new Terminal({
      fontFamily: 'Cascadia Code, Consolas, monospace',
      fontSize: 14,
      cursorBlink: true,
      theme: { background: '#1e1e1e' }
    })
    const f = new FitAddon()
    t.loadAddon(f)
    t.open(host.current!)
    term.current = t
    fit.current = f

    // xterm creates its renderer lazily on the first render frame, so fitting
    // before then (or while the host has zero size) throws inside the viewport.
    // Guard fit so it only runs once the container is laid out and ready.
    const safeFit = (): void => {
      const el = host.current
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
      try {
        f.fit()
        if (sid.current) window.api.resize(sid.current, t.cols, t.rows)
      } catch {
        /* renderer not ready yet; a later fit will catch up */
      }
    }

    const raf = requestAnimationFrame(safeFit)

    t.onData((d) => {
      if (sid.current) window.api.sendInput(sid.current, d)
    })
    const offData = window.api.onData((s, data) => {
      if (s === sid.current) t.write(data)
    })
    window.addEventListener('resize', safeFit)
    refit.current = safeFit
    return () => {
      cancelAnimationFrame(raf)
      offData()
      window.removeEventListener('resize', safeFit)
      refit.current = null
      t.dispose()
    }
  }, [])

  // Re-fit when the tab becomes visible.
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        refit.current?.()
        term.current?.focus()
      })
    }
  }, [visible])

  return <div className="term-wrap" ref={host} />
}
