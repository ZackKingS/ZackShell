import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import App from './App'

// 渲染进程入口。这里的所有 console 输出都会被主进程捕获并写入 logs/zackshell.log,
// 所以即使页面白屏,真实报错也能在日志文件里看到。

console.log('[renderer] main.tsx 开始执行')

/** 把错误同时:1) 显示在页面上(避免白屏)2) 打到 console(被主进程记录到日志) */
function showError(msg: string): void {
  console.error('[renderer] RENDER ERROR:', msg)
  document.body.innerHTML =
    `<pre style="color:#e06c75;background:#1e1e1e;padding:16px;white-space:pre-wrap;` +
    `font-family:monospace;font-size:13px;height:100%;margin:0">RENDER ERROR:\n\n${msg}</pre>`
}

window.addEventListener('error', (e) => showError(String(e.error?.stack || e.message)))
window.addEventListener('unhandledrejection', (e) =>
  showError('Unhandled rejection: ' + String(e.reason))
)

// 检查 preload 是否成功注入了 API(白屏常见原因之一是 window.api 未定义)
if (typeof window.api === 'undefined') {
  console.error('[renderer] 警告:window.api 未定义,preload 可能未加载')
} else {
  console.log('[renderer] window.api 已就绪')
}

try {
  console.log('[renderer] 开始挂载 React')
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
  console.log('[renderer] React 挂载调用完成')
} catch (err) {
  showError(err instanceof Error ? (err.stack ?? err.message) : String(err))
}
