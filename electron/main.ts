import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray } from 'electron'
import { join } from 'node:path'
import { openDatabase, closeDatabase } from './database/connection'
import { runMigrations } from './database/migrations'
import { AccountsRepository } from './database/repositories/accounts-repository'
import { CategoriesRepository } from './database/repositories/categories-repository'
import { TransactionsRepository } from './database/repositories/transactions-repository'
import { TransfersRepository } from './database/repositories/transfers-repository'
import { LedgerRepository } from './database/repositories/ledger-repository'
import { BudgetsRepository } from './database/repositories/budgets-repository'
import { AnalyticsRepository } from './database/repositories/analytics-repository'
import { RecurringRepository } from './database/repositories/recurring-repository'
import { ImportsRepository } from './database/repositories/imports-repository'
import { NotificationsRepository } from './database/repositories/notifications-repository'
import { FinanceService } from './domain/finance-service'
import { RecurringService } from './domain/recurring-service'
import { ImportService } from './domain/import-service'
import { NotificationService } from './domain/notification-service'
import { getDatabaseKey } from './security/key-manager'
import { BackupService } from './services/backup-service'
import { getKeepInTray, saveBackgroundSettings } from './services/background-settings'
import type { ImportTransactionsInput, UpdateBackgroundSettingsInput } from './database/types'
import { registerFinanceIpcHandlers } from './ipc/register-finance-handlers'

let financeService: FinanceService | undefined
let recurringService: RecurringService | undefined
let importService: ImportService | undefined
let notificationService: NotificationService | undefined
let database: ReturnType<typeof openDatabase>['database'] | undefined
let recurringTimer: NodeJS.Timeout | undefined
let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let backupService: BackupService | undefined
let databaseKey: string | undefined
let databasePath = ''
let keyStorage: 'macos-keychain' | 'electron-safe-storage' | 'unavailable' = 'unavailable'
let keepInTray = true
let isQuitting = false
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())
}

function initializeFinanceService() {
  const userDataPath = app.getPath('userData')
  const keyResult = getDatabaseKey(userDataPath)
  databaseKey = keyResult.key
  keyStorage = keyResult.storage
  keepInTray = getKeepInTray(userDataPath)
  const connection = openDatabase(userDataPath, 'easyspends.db', databaseKey, keyStorage)
  database = connection.database
  databasePath = connection.databasePath
  runMigrations(database)

  const accounts = new AccountsRepository(database)
  const categories = new CategoriesRepository(database)
  const transactions = new TransactionsRepository(database)
  const transfers = new TransfersRepository(database)
  const ledger = new LedgerRepository(database)
  const budgets = new BudgetsRepository(database)
  const analytics = new AnalyticsRepository(database)
  const recurring = new RecurringRepository(database)
  const imports = new ImportsRepository(database)
  const notifications = new NotificationsRepository(database)

  notificationService = new NotificationService(notifications, budgets, {
    publish: (event) => {
      if (Notification.isSupported()) {
        new Notification({ title: event.title, body: event.body }).show()
      }
    }
  })
  financeService = new FinanceService(database, accounts, categories, transactions, transfers, ledger, budgets, analytics)
  recurringService = new RecurringService(database, recurring, accounts, categories, transactions)
  importService = new ImportService(database, accounts, categories, transactions, imports)
  backupService = new BackupService(userDataPath, databasePath, databaseKey, keyStorage, database)
}

function getFinanceService() {
  if (!financeService) throw new Error('财务服务尚未初始化')
  return financeService
}

function getRecurringService() {
  if (!recurringService) throw new Error('周期记账服务尚未初始化')
  return recurringService
}

function getImportService() {
  if (!importService) throw new Error('账单导入服务尚未初始化')
  return importService
}

function getNotificationService() {
  if (!notificationService) throw new Error('通知服务尚未初始化')
  return notificationService
}

function notifyAfterTransaction(input: unknown) {
  if (!input || typeof input !== 'object') return
  const value = input as { type?: string; amount?: number; occurredAt?: string; note?: string }
  const amountCents = Math.round(Number(value.amount) * 100)
  const occurredAt = typeof value.occurredAt === 'string' ? value.occurredAt : new Date().toISOString().slice(0, 10)
  if ((value.type === 'income' || value.type === 'expense') && Number.isSafeInteger(amountCents) && amountCents > 0) {
    getNotificationService().notifyAnomaly(amountCents, value.type, occurredAt, `manual:${occurredAt}:${amountCents}:${value.note ?? ''}`, value.note)
    getNotificationService().notifyBudget(occurredAt.slice(0, 7))
  }
}

function runRecurringDue() {
  const today = new Date().toISOString().slice(0, 10)
  const results = getRecurringService().runDue(today)
  getNotificationService().notifyRecurring(today, results.length)
  for (const result of results) getNotificationService().notifyBudget(result.occurred_at.slice(0, 7))
  return results
}

function startRecurringScheduler() {
  runRecurringDue()
  recurringTimer = setInterval(() => {
    try { runRecurringDue() } catch (error) { console.error('周期记账执行失败', error) }
  }, 60 * 1000)
}

function runImport(input: ImportTransactionsInput) {
  const result = getImportService().importTransactions(input)
  const notification = getNotificationService()
  for (const row of result.preview.rows.filter((item) => item.status === 'ready')) {
    notification.notifyAnomaly(row.amount_cents, row.type, row.occurred_at, `import:${input.source}:${row.external_key}`, row.note)
    notification.notifyBudget(row.occurred_at.slice(0, 7))
  }
  return result
}

function registerIpcHandlers() {
  registerFinanceIpcHandlers({ getFinanceService, getRecurringService, getImportService, getNotificationService, runRecurringDue, runImport, notifyAfterTransaction })
  ipcMain.handle('app:open-data-folder', () => shell.openPath(app.getPath('userData')))
  ipcMain.handle('background:get-settings', () => ({
    launch_at_login: app.getLoginItemSettings().openAtLogin ? 1 : 0,
    keep_in_tray: keepInTray ? 1 : 0
  }))
  ipcMain.handle('background:update-settings', (_, input: UpdateBackgroundSettingsInput = {}) => {
    const launchAtLogin = input.launchAtLogin ?? app.getLoginItemSettings().openAtLogin
    app.setLoginItemSettings({ openAtLogin: launchAtLogin, openAsHidden: true, args: ['--hidden'] })
    keepInTray = input.keepInTray ?? keepInTray
    return saveBackgroundSettings(app.getPath('userData'), { ...input, keepInTray }, launchAtLogin)
  })
  ipcMain.handle('security:get-status', () => backupService?.getSecurityStatus())
  ipcMain.handle('backup:choose-path', async () => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '备份 EasySpends 数据',
      defaultPath: join(app.getPath('documents'), `easyspends-backup-${new Date().toISOString().slice(0, 10)}.esb`),
      filters: [{ name: 'EasySpends 加密备份', extensions: ['esb'] }]
    })
    return result.canceled ? null : result.filePath
  })
  ipcMain.handle('backup:create', async (_, requestedPath?: string) => {
    if (requestedPath) return backupService!.createBackup(requestedPath)
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '备份 EasySpends 数据',
      defaultPath: join(app.getPath('documents'), `easyspends-backup-${new Date().toISOString().slice(0, 10)}.esb`),
      filters: [{ name: 'EasySpends 加密备份', extensions: ['esb'] }]
    })
    if (result.canceled || !result.filePath) throw new Error('已取消备份')
    return backupService!.createBackup(result.filePath)
  })
  ipcMain.handle('backup:choose-restore-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择 EasySpends 加密备份',
      properties: ['openFile'],
      filters: [{ name: 'EasySpends 加密备份', extensions: ['esb'] }]
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('backup:restore', async (_, requestedPath?: string) => {
    const backupPath = requestedPath ?? (await dialog.showOpenDialog(mainWindow!, {
      title: '选择 EasySpends 加密备份',
      properties: ['openFile'],
      filters: [{ name: 'EasySpends 加密备份', extensions: ['esb'] }]
    })).filePaths[0]
    if (!backupPath) throw new Error('已取消恢复')
    const confirm = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['恢复并重启数据层', '取消'],
      defaultId: 1,
      cancelId: 1,
      title: '恢复 EasySpends 数据',
      message: '恢复会替换当前本地数据库。',
      detail: '恢复前会保留一份 easyspends-pre-restore 保护副本，当前窗口会短暂刷新。'
    })
    if (confirm.response !== 0) throw new Error('已取消恢复')
    const timer = recurringTimer
    if (timer) clearInterval(timer)
    recurringTimer = undefined
    closeDatabase(database)
    database = undefined
    financeService = undefined
    recurringService = undefined
    importService = undefined
    notificationService = undefined
    backupService = undefined
    try {
      const result = new BackupService(app.getPath('userData'), databasePath, databaseKey!, keyStorage).restoreBackup(backupPath)
      initializeFinanceService()
      startRecurringScheduler()
      return result
    } catch (error) {
      initializeFinanceService()
      startRecurringScheduler()
      throw error
    }
  })
}

function trayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path fill="black" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h7.5A2.25 2.25 0 0 1 15 4.25V5h.25A1.75 1.75 0 0 1 17 6.75v4.5A1.75 1.75 0 0 1 15.25 13H15v.75A2.25 2.25 0 0 1 12.75 16h-7.5A2.25 2.25 0 0 1 3 13.75v-9.5Zm2-.75a.75.75 0 0 0 0 1.5h8.5v-.75a.75.75 0 0 0-.75-.75H5Zm9.75 3H11a2.5 2.5 0 0 0 0 5h3.75a.75.75 0 0 0 .75-.75v-3.5a.75.75 0 0 0-.75-.75ZM11 8a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg>`
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function hideWindowToTray(window: BrowserWindow) {
  window.hide()
  if (process.platform === 'darwin') app.dock?.hide()
}

function showMainWindow() {
  if (process.platform === 'darwin') void app.dock?.show()
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow(false)
  else {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

function createTray() {
  if (tray) return
  tray = new Tray(trayIcon())
  tray.setToolTip('EasySpends · 本地财务空间')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 EasySpends', click: () => showMainWindow() },
    { label: '立即执行到期记账', click: () => { try { runRecurringDue() } catch (error) { console.error(error) } } },
    { type: 'separator' },
    { label: '打开数据目录', click: () => void shell.openPath(app.getPath('userData')) },
    { label: '退出 EasySpends', click: () => { isQuitting = true; app.quit() } }
  ]))
  tray.on('click', () => showMainWindow())
}

function createWindow(hidden = false) {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#F7F8FA',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow = window
  window.on('close', (event) => {
    if (!isQuitting && keepInTray) {
      event.preventDefault()
      hideWindowToTray(window)
    }
  })
  window.on('minimize', () => {
    if (keepInTray) hideWindowToTray(window)
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  if (hidden) hideWindowToTray(window)
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  if (process.platform === 'darwin' && !app.isPackaged) {
    const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
    if (!icon.isEmpty()) app.dock?.setIcon(icon)
  }
  initializeFinanceService()
  registerIpcHandlers()
  createTray()
  const launchHidden = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin
  createWindow(launchHidden && keepInTray)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  startRecurringScheduler()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || !keepInTray) app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  if (recurringTimer) clearInterval(recurringTimer)
  recurringTimer = undefined
  closeDatabase(database)
  database = undefined
  financeService = undefined
  recurringService = undefined
  importService = undefined
  notificationService = undefined
  backupService = undefined
  mainWindow = undefined
  if (tray) { tray.destroy(); tray = undefined }
})
