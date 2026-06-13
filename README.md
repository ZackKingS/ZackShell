# ZackShell

SSH/SFTP 客户端 + 服务器实时监控,Windows 桌面应用(对标 FinalShell)。

## 文档
- [需求文档](docs/需求文档.md)
- [技术设计文档](docs/技术设计文档.md)
- [UI 布局文档](docs/UI布局文档.md)

## 技术栈
Electron + TypeScript + React + xterm.js + ssh2(详见技术设计文档)。

## 开发

```bash
npm install      # 安装依赖
npm run dev      # 启动开发(热更新)
npm run build    # 构建生产包
npm run typecheck
```

## 当前进度
- [x] 核心三大功能已跑通(终端 + SFTP 文件管理 + 实时监控)
  - [x] SSH 交互终端(xterm.js,中文/TUI 正常)
  - [x] SFTP:目录浏览 / 上传 / 下载 / 删除 / 新建文件夹
  - [x] 监控:CPU / 内存 / 交换 / 磁盘 / 网络曲线 / 进程 Top(/proc 远程采集,2s 刷新)
- [ ] Phase 1 收尾:主机密钥校验、密钥登录、断线重连
- [ ] Phase 2:会话管理 + 凭据加密存储
- [ ] Phase 3 增强:传输进度条 / 拖拽 / 在线编辑 / 改权限
- [ ] Phase 5:多标签 / 端口转发 / 跳板机 / 主题
- [ ] Phase 6:打包发布

## 目录结构
```
src/
├─ main/      主进程:SSH 连接管理 (ssh/)
├─ preload/   contextBridge 安全桥
├─ renderer/  React UI + xterm.js
└─ shared/    主/渲染共享类型与 IPC 常量
```
