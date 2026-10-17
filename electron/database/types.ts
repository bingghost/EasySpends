export type TransactionType = 'income' | 'expense'

export type AccountType = 'cash' | 'bank' | 'alipay' | 'wechat' | 'credit_card' | 'investment' | 'loan' | 'other'

export type LedgerEntryType = TransactionType | 'transfer'
export type ChartPeriod = 'month' | 'week'
export type BudgetStatus = 'normal' | 'warning' | 'exceeded'

export interface Category {
  id: number
  name: string
  type: TransactionType
  color: string
  is_archived: number
}

export interface CreateCategoryInput {
  name: string
  type: TransactionType
  color: string
}

export interface UpdateCategoryInput {
  id: number
  name: string
  color: string
  type?: TransactionType
}

export interface CategoryMutationResult {
  action: 'deleted' | 'archived' | 'restored'
  category: Category
}

export interface Account {
  id: number
  name: string
  type: AccountType
  currency: string
  opening_balance_cents: number
  balance_cents: number
  is_archived: number
}

export interface CreateAccountInput {
  name: string
  type: AccountType
  currency: string
  openingBalance: number
}

export interface UpdateAccountInput {
  id: number
  name: string
  type: AccountType
  currency: string
}

export interface AccountMutationResult {
  action: 'deleted' | 'archived' | 'restored'
  account: Account
}

export interface Transfer {
  id: number
  amount_cents: number
  from_account_id: number
  from_account_name: string
  to_account_id: number
  to_account_name: string
  currency: string
  note: string
  occurred_at: string
  created_at: string
}

export interface NewTransferInput {
  fromAccountId: number
  toAccountId: number
  amount: number
  occurredAt: string
  note?: string
}

export interface AccountUsage {
  transaction_count: number
  transfer_count: number
}

export interface Transaction {
  id: number
  type: TransactionType
  amount_cents: number
  note: string
  occurred_at: string
  created_at: string
  account_id: number
  account_name: string
  category_id: number
  category_name: string
  category_color: string
}

export interface LedgerEntry {
  id: number
  source: 'transaction' | 'transfer'
  entry_type: LedgerEntryType
  amount_cents: number
  note: string
  occurred_at: string
  created_at: string
  account_id: number | null
  account_name: string | null
  category_id: number | null
  category_name: string | null
  category_color: string | null
  from_account_id: number | null
  from_account_name: string | null
  to_account_id: number | null
  to_account_name: string | null
  currency: string
}

export interface LedgerListOptions {
  type?: LedgerEntryType | 'all'
  search?: string
  fromDate?: string
  toDate?: string
  accountId?: number
  limit?: number
  offset?: number
}

export interface CashflowDay {
  period: string
  income_cents: number
  expense_cents: number
  transaction_count: number
}

export interface CashflowPoint {
  key: string
  label: string
  start_date: string
  end_date: string
  income_cents: number
  expense_cents: number
  net_cents: number
  transaction_count: number
}

export interface CashflowChartData {
  period: ChartPeriod
  start_date: string
  end_date: string
  points: CashflowPoint[]
}

export interface Budget {
  id: number
  category_id: number
  category_name: string
  category_color: string
  month: string
  limit_cents: number
  spent_cents: number
  remaining_cents: number
  usage_percent: number
  alert_percent: number
  status: BudgetStatus
  note: string
  created_at: string
  updated_at: string
}

export interface SaveBudgetInput {
  id?: number
  categoryId: number
  month: string
  limit: number
  alertPercent?: number
  note?: string
}

export interface BudgetSummary {
  month: string
  total_limit_cents: number
  total_spent_cents: number
  total_remaining_cents: number
  usage_percent: number
  budget_count: number
  warning_count: number
  exceeded_count: number
  reminder_message: string | null
  items: Budget[]
}

export interface AssetTrendPoint {
  key: string
  label: string
  as_of_date: string
  total_assets_cents: number
  total_liabilities_cents: number
  net_worth_cents: number
}

export interface AccountAllocation {
  account_id: number
  account_name: string
  account_type: AccountType
  currency: string
  balance_cents: number
  share_percent: number
  is_liability: number
}

export interface AssetAnalytics {
  as_of_date: string
  total_assets_cents: number
  total_liabilities_cents: number
  net_worth_cents: number
  net_worth_change_cents: number
  allocation_total_cents: number
  account_allocations: AccountAllocation[]
  net_worth_trend: AssetTrendPoint[]
}

export interface DashboardData {
  month: string
  income_cents: number
  expense_cents: number
  net_cents: number
  all_time_net_cents: number
  transaction_count: number
  accounts: Account[]
  recent_transactions: Transaction[]
  recent_transfers: Transfer[]
}

export interface NewTransactionInput {
  type: TransactionType
  amount: number
  accountId: number
  categoryId: number
  occurredAt: string
  note?: string
}

export interface MonthlySummary {
  income_cents: number
  expense_cents: number
  transaction_count: number
}


export type AutomationSource = 'manual' | 'recurring' | 'csv' | 'wechat' | 'alipay' | 'other'
export type ImportSource = 'csv' | 'wechat' | 'alipay' | 'other'
export type ImportBatchStatus = 'processing' | 'completed' | 'failed'
export type NotificationEventType = 'budget' | 'anomaly' | 'recurring' | 'import'

export interface RecurringRule {
  id: number
  name: string
  type: TransactionType
  amount_cents: number
  account_id: number
  account_name: string
  category_id: number
  category_name: string
  category_color: string
  day_of_month: number
  next_run_on: string
  note: string
  is_enabled: number
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export interface SaveRecurringRuleInput {
  id?: number
  name: string
  type: TransactionType
  amount: number
  accountId: number
  categoryId: number
  dayOfMonth: number
  nextRunOn: string
  note?: string
  isEnabled?: boolean
}

export interface RecurringRunResult {
  rule_id: number
  transaction_id: number
  occurred_at: string
  next_run_on: string
}

export interface ImportBatch {
  id: number
  source: ImportSource
  file_name: string
  row_count: number
  imported_count: number
  skipped_count: number
  status: ImportBatchStatus
  error_message: string
  created_at: string
}

export interface ImportPreviewRow {
  row_number: number
  external_key: string
  type: TransactionType
  amount_cents: number
  occurred_at: string
  note: string
  category_name: string
  account_name: string
  status: 'ready' | 'duplicate' | 'invalid'
  error_message: string | null
}

export interface ImportPreview {
  source: ImportSource
  file_name: string
  rows: ImportPreviewRow[]
  valid_count: number
  duplicate_count: number
  invalid_count: number
}

export interface ImportTransactionsInput {
  source: ImportSource
  fileName: string
  content: string
  accountId: number
  defaultIncomeCategoryId?: number
  defaultExpenseCategoryId?: number
}

export interface ImportResult {
  batch: ImportBatch
  preview: ImportPreview
}

export interface NotificationSettings {
  budget_enabled: number
  anomaly_enabled: number
  recurring_enabled: number
  anomaly_amount_cents: number
}

export interface UpdateNotificationSettingsInput {
  budgetEnabled?: boolean
  anomalyEnabled?: boolean
  recurringEnabled?: boolean
  anomalyAmount?: number
}

export interface NotificationEvent {
  id: number
  event_type: NotificationEventType
  dedupe_key: string
  title: string
  body: string
  created_at: string
}


export interface BackgroundSettings {
  launch_at_login: number
  keep_in_tray: number
}

export interface UpdateBackgroundSettingsInput {
  launchAtLogin?: boolean
  keepInTray?: boolean
}

export interface SecurityStatus {
  encrypted: boolean
  keyStorage: 'macos-keychain' | 'electron-safe-storage' | 'unavailable'
  databasePath: string
  backupFormat: 'encrypted-aes-256-gcm'
}

export interface BackupResult {
  path: string
  bytes: number
  createdAt: string
  encrypted: boolean
}
