# EasySpends

EasySpends 是一个 **macOS 优先、Electron 驱动、本地优先**的个人财务管理应用。第一版以 [ezBookkeeping](https://github.com/mayswind/ezbookkeeping) 的轻量、自托管、多账户、多币种与移动适配思路为主要参考，同时吸收 Actual 的本地优先预算理念和 Money Manager Ex 的 SQLite 本地数据路线。

## 当前能力

当前版本已经形成可运行的本地记账闭环。应用支持收入/支出记录、现金账户和银行卡账户、收入/支出分类、日期与备注、月度收入/支出/结余概览、账户余额计算、最近收支列表、记录删除以及打开本地数据目录。现在还支持收支分类的创建、读取、编辑、归档、恢复和安全删除；已被交易使用的分类不能物理删除，只能归档，历史交易不会受到影响。账户模块支持现金、银行卡、支付宝、微信、信用卡、投资账户和贷款账户，支持账户 CRUD、归档恢复、账户余额统计、账户之间转账和转账历史查看。流水模块将收入、支出和转账统一展示，支持类型筛选、关键词搜索、流水删除，以及按月和按周的收入/支出柱状趋势图。资产分析模块提供最近 12 个月资产净值趋势、总资产、总负债和多账户资产占比饼图。预算模块支持为每个支出分类设置月度预算上限、提醒阈值和备注，并在达到阈值或发生超支时显示应用内提醒。自动化中心支持按月执行的定期自动记账、通用 CSV/微信/支付宝导出账单导入、外部流水去重，以及预算超支、大额支出异常和周期记账完成的 macOS 本地桌面通知。

数据默认保存在 Electron 的用户数据目录中，macOS 路径通常为：

```text
~/Library/Application Support/easyspends/easyspends.db
```

SQLite 使用 WAL 模式，金额以“分”为单位存储，避免浮点误差。渲染进程不直接接触 Node.js 或数据库，只能通过 `contextBridge` 暴露的白名单 API 与主进程通信。

## 技术栈

| 层次 | 技术 |
|---|---|
| 桌面容器 | Electron |
| 构建 | electron-vite、Vite、TypeScript |
| UI | React、Lucide React、CSS |
| 本地数据 | SQLite、better-sqlite3-multiple-ciphers、WAL |
| 安全边界 | contextIsolation、nodeIntegration=false、预加载 IPC API |
| 打包 | electron-builder，目标为 macOS DMG/ZIP |

## 开发命令

首次安装依赖：

```bash
pnpm install
```

启动开发模式：

```bash
pnpm dev
```

执行类型检查：

```bash
pnpm exec tsc --noEmit
```

构建生产文件：

```bash
pnpm build
```

构建 macOS 安装包：

```bash
pnpm dist:mac
```

`pnpm dist:mac` 应在 macOS 上执行；若要发布给其他用户，还需要后续配置 Apple Developer 签名、公证和应用图标。

## 目录结构

```text
.
├── electron/
│   ├── main.ts                 # 窗口生命周期、后台调度和应用级 IPC
│   ├── preload.ts              # contextBridge 白名单 API
│   ├── ipc/                    # 财务功能 IPC 路由
│   ├── domain/                 # 业务校验与事务用例
│   ├── database/               # 连接、迁移、类型和 SQL 仓储
│   ├── security/               # 数据库密钥管理
│   └── services/               # 后台设置与加密备份
├── src/
│   ├── App.tsx                 # 应用状态、导航和页面切换
│   ├── features/               # 各功能页面及其弹窗
│   ├── format.ts               # 金额与日期展示格式
│   ├── main.tsx                # React 入口
│   └── styles.css              # macOS 优先视觉样式
├── electron.vite.config.ts
├── package.json
├── scripts/                    # 数据库、账户、流水、预算、自动化和安全冒烟测试
└── tsconfig.json
```

## 数据库分层

数据库访问已经从 `electron/main.ts` 中拆分出来。`connection.ts` 负责打开 SQLite、配置 WAL/外键/忙等待和关闭检查点；`migrations.ts` 负责建表、版本记录和旧版兼容；`repositories/` 封装 SQL 查询与持久化；`domain/` 负责校验与事务用例。财务功能 IPC 路由位于 `electron/ipc/`，`main.ts` 负责窗口生命周期、后台调度及应用级操作。React 页面位于 `src/features/`，`App.tsx` 负责组合页面和协调状态。

当前 IPC 契约支持 `accounts:list`、`accounts:create`、`accounts:update`、`accounts:archive`、`accounts:restore`、`accounts:delete`、`transfers:list`、`transfers:create`、`transfers:delete`、`ledger:list`、`cashflow:chart`、`assets:analytics`、`budgets:list`、`budgets:save`、`budgets:delete`、`recurring:list`、`recurring:save`、`recurring:delete`、`recurring:run-now`、`imports:preview`、`imports:run`、`imports:history`、`notifications:get-settings`、`notifications:update-settings` 和 `notifications:list`；同时保留 `dashboard:get`、分类 CRUD、交易 CRUD 和 `app:open-data-folder`。后台设置、安全状态和备份恢复接口包括 `background:get-settings`、`background:update-settings`、`security:get-status`、`backup:choose-path`、`backup:create`、`backup:choose-restore-path` 和 `backup:restore`。因此账户、转账、流水、资产分析、预算、周期记账、账单导入和通知都由主进程统一查询与校验。

目标版复式记账结构位于 `electron/database/schema-v2.sql`，本次重构暂不自动应用它；这样可以先稳定分层，再通过独立迁移把当前三表模型升级到 `ledgers + postings` 模型。

## 后续开发建议

下一阶段建议补充退款/拆分交易、导入字段映射模板、跨设备备份密钥迁移、导入回滚、后台任务健康状态和更细粒度的异常规则。当前账单导入采用“用户导出文件 → 本地预览 → 用户确认 → 去重入账”的安全流程，不直接登录或抓取微信/支付宝账户。数据模型已经为 `Posting`、预算周期、汇率、附件和审计事件预留扩展方向；在接入 OCR、语音或外部银行同步前，应坚持“AI 只提出候选字段、用户确认后入账”，并将第三方同步设计成可插拔 Provider。


## macOS 后台运行与数据安全

当前版本支持 macOS 登录启动、后台托盘常驻和单实例运行。登录启动开启后，应用可以隐藏窗口启动，由 Electron 主进程继续执行周期记账检查和本地通知；最小化或关闭窗口默认隐藏到菜单栏托盘，用户可以通过托盘菜单重新打开、立即执行到期规则、打开数据目录或完全退出应用。

SQLite 已切换为 `better-sqlite3-multiple-ciphers`。应用首次启动时通过 Electron `safeStorage` 创建并保护随机数据库密钥；在 macOS 上，safeStorage 使用 Keychain 保护该密钥。数据库文件使用透明加密，现有旧版明文数据库会在首次启动时自动加密，迁移前会保留本地保护副本。

应用设置页面提供安全状态、一键备份和恢复备份。备份文件使用 `.esb` 格式，在加密 SQLite 文件基础上使用 AES-256-GCM 再次封装；恢复前会验证备份魔数、认证标签、数据库密钥、`schema_migrations` 和 SQLite `quick_check`，并保留 `easyspends-pre-restore-*.db` 保护副本。当前数据库密钥绑定本机系统 Keychain，同一 Mac 恢复可直接使用；跨 Mac 恢复需要后续增加用户口令派生密钥或显式安全密钥导出流程。

加密安全回归测试：

```bash
pnpm test:security
```

## 产品演示文档

完整演讲讲稿和逐页幻灯片排版建议位于：

```text
docs/product-architecture-speaker-notes.md
```

原始产品与架构演示大纲位于：

```text
docs/product-architecture-presentation-outline.md
```
