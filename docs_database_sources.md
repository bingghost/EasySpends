# 数据库与本地存储设计依据

数据截点：2026-08-22。

## SQLite WAL

来源：https://www.sqlite.org/wal.html

SQLite 官方文档说明，WAL 模式通常能提升性能，并允许读操作不阻塞写操作、写操作不阻塞读操作；但同一个 WAL 数据库的所有进程必须位于同一台主机上，WAL 不适用于网络文件系统。WAL 会额外产生 `-wal` 和 `-shm` 文件，并需要关注 checkpoint；默认在 WAL 达到约 1000 pages 时自动 checkpoint。写入者仍然只有一个，因此应用层应将写事务集中到 Electron 主进程并控制事务粒度。

对 EasySpends 的结论：数据库文件必须放在本机用户数据目录，不直接放网络盘；开发阶段启用 WAL、`foreign_keys=ON`、合理 busy timeout，并在备份前执行 checkpoint 或使用一致性备份方案；同步功能不能简单复制正在使用的 `.db` 文件，而应使用导出快照、SQLite backup API 或应用级变更日志。

## Electron 安全

来源：https://www.electronjs.org/docs/latest/tutorial/security

Electron 官方安全清单建议：所有 renderer 启用 context isolation；不要对远程内容开启 Node.js 集成；限制导航和新窗口；为 IPC 消息验证 sender；不要向不可信内容暴露 Electron API；定义严格的 Content-Security-Policy，并使用当前版本 Electron。

对 EasySpends 的结论：渲染进程只通过 preload/contextBridge 使用白名单 API，Node.js 与 SQLite 仅在主进程访问；所有 IPC 输入需要进行类型、长度、范围和引用完整性校验；后续加入外链、导入文件、AI 或银行同步时，必须继续维护 CSP、来源验证和权限隔离。

## Electron safeStorage 与目录

来源：https://www.electronjs.org/docs/latest/api/safe-storage

Electron safeStorage 文档说明，macOS 上应用密钥存储在 Keychain Access；官方建议优先使用异步加解密 API，以避免阻塞并支持密钥轮换。对 EasySpends 的结论：同步 Provider token、数据库加密密钥封装材料和其他秘密不应明文放在 SQLite，应通过主进程使用 safeStorage/Keychain 管理。

来源：https://www.electronjs.org/docs/latest/api/app

Electron `app.getPath('appData')` 在 macOS 默认指向 `~/Library/Application Support`；`sessionData` 用于 Chromium 的 localStorage、cookies、缓存等，官方提示如果应用不依赖这些存储来保存业务数据，应考虑将其与业务数据目录分开；`logs` 是应用日志目录。对 EasySpends 的结论：业务数据库放在 `app.getPath('userData')` 下的固定子目录，附件、备份和日志分离；当前 MVP 实测数据库路径为 `~/Library/Application Support/easyspends/easyspends.db`，后续版本应保持该路径稳定，若改名必须提供一次性迁移。
