import { ipcMain } from 'electron'
import type { ImportTransactionsInput, TransactionType } from '../database/types'
import type { FinanceService } from '../domain/finance-service'
import type { RecurringService } from '../domain/recurring-service'
import type { ImportService } from '../domain/import-service'
import type { NotificationService } from '../domain/notification-service'

interface FinanceIpcDependencies {
  getFinanceService: () => FinanceService
  getRecurringService: () => RecurringService
  getImportService: () => ImportService
  getNotificationService: () => NotificationService
  runRecurringDue: () => ReturnType<RecurringService['runDue']>
  runImport: (input: ImportTransactionsInput) => ReturnType<ImportService['importTransactions']>
  notifyAfterTransaction: (input: unknown) => void
}

export function registerFinanceIpcHandlers(dependencies: FinanceIpcDependencies) {
  const { getFinanceService, getRecurringService, getImportService, getNotificationService, runRecurringDue, runImport, notifyAfterTransaction } = dependencies
  ipcMain.handle('dashboard:get', () => getFinanceService().getDashboard())
  ipcMain.handle('accounts:list', (_, includeArchived = false) => getFinanceService().getAccounts(includeArchived))
  ipcMain.handle('accounts:create', (_, input: unknown) => getFinanceService().createAccount(input))
  ipcMain.handle('accounts:update', (_, input: unknown) => getFinanceService().updateAccount(input))
  ipcMain.handle('accounts:archive', (_, id: unknown) => getFinanceService().archiveAccount(id))
  ipcMain.handle('accounts:restore', (_, id: unknown) => getFinanceService().restoreAccount(id))
  ipcMain.handle('accounts:delete', (_, id: unknown) => getFinanceService().deleteAccount(id))
  ipcMain.handle('transfers:list', (_, limit?: number) => getFinanceService().getTransfers(limit))
  ipcMain.handle('transfers:create', (_, input: unknown) => getFinanceService().createTransfer(input))
  ipcMain.handle('transfers:delete', (_, id: unknown) => getFinanceService().deleteTransfer(id))
  ipcMain.handle('ledger:list', (_, options = {}) => getFinanceService().getLedgerEntries(options))
  ipcMain.handle('cashflow:chart', (_, period = 'month') => getFinanceService().getCashflowChart(period))
  ipcMain.handle('assets:analytics', () => getFinanceService().getAssetAnalytics())
  ipcMain.handle('budgets:list', (_, month?: string) => getFinanceService().getBudgets(month))
  ipcMain.handle('budgets:save', (_, input: unknown) => getFinanceService().saveBudget(input))
  ipcMain.handle('budgets:delete', (_, id: unknown) => getFinanceService().deleteBudget(id))
  ipcMain.handle('recurring:list', (_, includeDisabled = true) => getRecurringService().list(includeDisabled))
  ipcMain.handle('recurring:save', (_, input: unknown) => getRecurringService().save(input))
  ipcMain.handle('recurring:delete', (_, id: unknown) => getRecurringService().delete(id))
  ipcMain.handle('recurring:run-now', () => runRecurringDue())
  ipcMain.handle('imports:preview', (_, input: ImportTransactionsInput) => getImportService().preview(input))
  ipcMain.handle('imports:run', (_, input: ImportTransactionsInput) => runImport(input))
  ipcMain.handle('imports:history', (_, limit?: number) => getImportService().listHistory(limit))
  ipcMain.handle('notifications:get-settings', () => getNotificationService().getSettings())
  ipcMain.handle('notifications:update-settings', (_, input) => getNotificationService().updateSettings(input))
  ipcMain.handle('notifications:list', (_, limit?: number) => getNotificationService().list(limit))
  ipcMain.handle('categories:list', (_, type?: TransactionType, includeArchived = false) =>
    getFinanceService().getCategories(type, includeArchived)
  )
  ipcMain.handle('categories:create', (_, input: unknown) => getFinanceService().createCategory(input))
  ipcMain.handle('categories:update', (_, input: unknown) => getFinanceService().updateCategory(input))
  ipcMain.handle('categories:archive', (_, id: unknown) => getFinanceService().archiveCategory(id))
  ipcMain.handle('categories:restore', (_, id: unknown) => getFinanceService().restoreCategory(id))
  ipcMain.handle('categories:delete', (_, id: unknown) => getFinanceService().deleteCategory(id))
  ipcMain.handle('transactions:list', (_, limit?: number) => getFinanceService().getTransactions(limit))
  ipcMain.handle('transactions:create', (_, input: unknown) => {
    const result = getFinanceService().createTransaction(input)
    notifyAfterTransaction(input)
    return result
  })
  ipcMain.handle('transactions:delete', (_, id: unknown) => getFinanceService().deleteTransaction(id))
}
