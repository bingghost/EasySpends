

## 本地加密与 macOS 密钥保护补充资料

- Electron `safeStorage` 文档：https://www.electronjs.org/docs/latest/api/safe-storage 。文档说明 safeStorage 使用操作系统提供的加密能力保护本地字符串；macOS 使用 Keychain 保存应用密钥。文档同时建议优先使用异步 API，并提醒 macOS Keychain 调用可能触发用户输入。
- Electron `app` 文档：https://www.electronjs.org/docs/latest/api/app 。登录启动通过 Electron 的 `app.setLoginItemSettings()` 与 `app.getLoginItemSettings()` 管理；用户数据目录通过 `app.getPath('userData')` 获取。
- Electron `Tray` 文档：https://www.electronjs.org/docs/latest/api/tray 。托盘菜单和托盘图标由主进程创建，窗口可在关闭按钮操作时隐藏而不退出主进程。
- Electron 安全文档：https://www.electronjs.org/docs/latest/tutorial/security 。Renderer 与主进程之间应使用受控 preload/contextBridge 边界，避免直接暴露 Node.js 能力。
- better-sqlite3-multiple-ciphers 项目：https://github.com/m4heshd/better-sqlite3-multiple-ciphers 。项目提供支持多种密码算法的 better-sqlite3 分支，并以 `key(Buffer)` / `rekey(Buffer)` 方式打开或重设加密数据库密钥；项目页面列出 macOS x64/arm64 和 Electron 35+ 的预构建支持。
- SQLite3 Multiple Ciphers 安装文档：https://utelle.github.io/SQLite3MultipleCiphers/docs/installation/install_overview/ 。文档说明该加密 SQLite 实现提供 OSX 构建支持，并提供 Node.js better-sqlite3 绑定。

## 方案边界记录

当前 EasySpends 采用随机 32 字节数据库密钥，由 Electron safeStorage 加密后保存到本地 `.database-key` 文件；数据库文件使用透明加密；备份文件在加密数据库文件基础上再使用 AES-256-GCM 封装。当前本地备份密钥绑定本机系统密钥链，跨 Mac 恢复需要后续增加用户口令派生密钥或显式安全密钥导出流程。
