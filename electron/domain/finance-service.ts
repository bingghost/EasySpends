import type Database from 'better-sqlite3'
import { AccountsRepository } from '../database/repositories/accounts-repository'
import { CategoriesRepository } from '../database/repositories/categories-repository'
import { TransactionsRepository } from '../database/repositories/transactions-repository'
import { TransfersRepository } from '../database/repositories/transfers-repository'
import { LedgerRepository } from '../database/repositories/ledger-repository'
import { BudgetsRepository } from '../database/repositories/budgets-repository'
import { AnalyticsRepository, type AccountBalanceSnapshot } from '../database/repositories/analytics-repository'
import type {
  Account,
  AccountMutationResult,
  AssetAnalytics,
  AccountAllocation,
  AssetTrendPoint,
  Budget,
  BudgetStatus,
  BudgetSummary,
  CashflowChartData,
  ChartPeriod,
  AccountType,
  Category,
  CategoryMutationResult,
  CreateAccountInput,
  CreateCategoryInput,
  DashboardData,
  LedgerEntry,
  LedgerListOptions,
  NewTransactionInput,
  SaveBudgetInput,
  NewTransferInput,
  TransactionType,
  UpdateAccountInput,
  UpdateCategoryInput
} from '../database/types'

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/
const DEFAULT_CATEGORY_COLOR = '#A8AFBB'
const ACCOUNT_TYPES: AccountType[] = ['cash', 'bank', 'alipay', 'wechat', 'credit_card', 'investment', 'loan', 'other']

function formatDateOnly(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getCurrentMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return {
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    startDate: formatDateOnly(start),
    endDate: formatDateOnly(end)
  }
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function getChartRange(period: ChartPeriod) {
  const now = new Date()
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { start, end, startDate: formatDateOnly(start), endDate: formatDateOnly(end) }
  }

  const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const start = addDays(currentWeekStart, -77)
  const end = addDays(currentWeekStart, 7)
  return { start, end, startDate: formatDateOnly(start), endDate: formatDateOnly(end) }
}

function getBudgetMonth(value?: unknown) {
  const month = value === undefined || value === '' ? getCurrentMonthRange().month : String(value)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('预算月份格式无效，应为 YYYY-MM')
  return month
}

function roundPercent(value: number) {
  return Math.round(value * 10) / 10
}

function getBudgetStatus(spentCents: number, limitCents: number, alertPercent: number): BudgetStatus {
  if (spentCents > limitCents) return 'exceeded'
  if (spentCents >= limitCents * alertPercent / 100) return 'warning'
  return 'normal'
}

function summarizeBalances(balances: AccountBalanceSnapshot[]) {
  const allocations = balances.map((account) => {
    const isLiabilityAccount = account.type === 'credit_card' || account.type === 'loan'
    const assetBalance = isLiabilityAccount ? Math.max(account.balance_cents, 0) : Math.max(account.balance_cents, 0)
    const liabilityBalance = Math.max(-account.balance_cents, 0)
    return { account, assetBalance, liabilityBalance, isLiabilityAccount }
  })
  const totalAssets = allocations.reduce((sum, item) => sum + item.assetBalance, 0)
  const totalLiabilities = allocations.reduce((sum, item) => sum + item.liabilityBalance, 0)
  const accountAllocations: AccountAllocation[] = allocations.map(({ account, assetBalance, isLiabilityAccount }) => ({
    account_id: account.id,
    account_name: account.name,
    account_type: account.type,
    currency: account.currency,
    balance_cents: account.balance_cents,
    share_percent: totalAssets > 0 ? roundPercent((assetBalance / totalAssets) * 100) : 0,
    is_liability: isLiabilityAccount || account.balance_cents < 0 ? 1 : 0
  }))
  return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities, accountAllocations }
}

function isTransactionType(value: unknown): value is TransactionType {
  return value === 'income' || value === 'expense'
}

function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && ACCOUNT_TYPES.includes(value as AccountType)
}

function isValidDateOnly(value: string) {
  if (!DATE_ONLY_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function assertPositiveInteger(value: unknown, fieldName: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${fieldName}必须是正整数`)
  }
}

export class FinanceService {
  constructor(
    private readonly database: Database.Database,
    private readonly accounts: AccountsRepository,
    private readonly categories: CategoriesRepository,
    private readonly transactions: TransactionsRepository,
    private readonly transfers: TransfersRepository,
    private readonly ledger: LedgerRepository,
    private readonly budgets: BudgetsRepository,
    private readonly analytics: AnalyticsRepository
  ) {}

  getAccounts(includeArchived = false) {
    return this.accounts.list(includeArchived)
  }

  getCategories(type?: TransactionType, includeArchived = false) {
    return this.categories.list(type, includeArchived)
  }

  getTransactions(limit?: number) {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500)
    return this.transactions.list(normalizedLimit)
  }

  getTransfers(limit?: number) {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500)
    return this.transfers.list(normalizedLimit)
  }

  getLedgerEntries(options: LedgerListOptions = {}): LedgerEntry[] {
    const type = options.type ?? 'all'
    if (type !== 'all' && !isTransactionType(type) && type !== 'transfer') throw new Error('流水类型无效')
    if (options.accountId !== undefined) assertPositiveInteger(options.accountId, '账户 ID')
    if (options.fromDate && !isValidDateOnly(options.fromDate)) throw new Error('流水起始日期格式无效')
    if (options.toDate && !isValidDateOnly(options.toDate)) throw new Error('流水结束日期格式无效')
    return this.ledger.list({ ...options, type })
  }

  getBudgets(month?: string): BudgetSummary {
    const targetMonth = getBudgetMonth(month)
    const items = this.budgets.listByMonth(targetMonth).map((item) => this.enrichBudget(item))
    const totalLimit = items.reduce((sum, item) => sum + item.limit_cents, 0)
    const totalSpent = items.reduce((sum, item) => sum + item.spent_cents, 0)
    const warningCount = items.filter((item) => item.status === 'warning').length
    const exceededCount = items.filter((item) => item.status === 'exceeded').length
    return {
      month: targetMonth,
      total_limit_cents: totalLimit,
      total_spent_cents: totalSpent,
      total_remaining_cents: totalLimit - totalSpent,
      usage_percent: totalLimit > 0 ? roundPercent((totalSpent / totalLimit) * 100) : 0,
      budget_count: items.length,
      warning_count: warningCount,
      exceeded_count: exceededCount,
      reminder_message: exceededCount > 0
        ? `本月有 ${exceededCount} 个分类已超出预算上限`
        : warningCount > 0 ? `本月有 ${warningCount} 个分类已达到预算提醒线` : null,
      items
    }
  }

  saveBudget(input: unknown): BudgetSummary {
    if (!input || typeof input !== 'object') throw new Error('预算参数无效')
    const value = input as Partial<SaveBudgetInput>
    if (value.id !== undefined) assertPositiveInteger(value.id, '预算 ID')
    assertPositiveInteger(value.categoryId, '分类 ID')
    const month = getBudgetMonth(value.month)
    const category = this.categories.findById(value.categoryId, false)
    if (!category) throw new Error('预算分类不存在、已归档或已被删除')
    if (category.type !== 'expense') throw new Error('只有支出分类可以设置预算')
    const limit = Number(value.limit)
    const limitCents = Math.round(limit * 100)
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isSafeInteger(limitCents) || limitCents <= 0) throw new Error('预算上限必须大于 0')
    const alertPercent = value.alertPercent === undefined ? 80 : Number(value.alertPercent)
    if (!Number.isInteger(alertPercent) || alertPercent < 1 || alertPercent > 100) throw new Error('提醒阈值必须是 1-100 的整数')
    const note = typeof value.note === 'string' ? value.note.trim() : ''
    if (note.length > 500) throw new Error('预算备注不能超过 500 个字符')

    const save = this.database.transaction(() => {
      const duplicated = this.budgets.findByCategoryAndMonth(value.categoryId!, month)
      if (duplicated && duplicated.id !== value.id) throw new Error('该分类本月已经设置过预算')
      if (value.id) {
        if (!this.budgets.findById(value.id)) throw new Error('预算记录不存在')
      }
      return this.budgets.save({ id: value.id, categoryId: value.categoryId!, month, limitCents, alertPercent, note })
    })
    save()
    return this.getBudgets(month)
  }

  deleteBudget(id: unknown): BudgetSummary {
    assertPositiveInteger(id, '预算 ID')
    const budget = this.budgets.findById(id)
    if (!budget) throw new Error('预算记录不存在或已被删除')
    const remove = this.database.transaction(() => this.budgets.remove(id))
    remove()
    return this.getBudgets(budget.month)
  }

  getAssetAnalytics(): AssetAnalytics {
    const now = new Date()
    const asOfDate = formatDateOnly(now)
    const current = summarizeBalances(this.analytics.getAccountBalancesAt(asOfDate))
    const points: AssetTrendPoint[] = []

    for (let offset = 11; offset >= 0; offset -= 1) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0)
      const pointDate = offset === 0 ? asOfDate : formatDateOnly(monthEnd)
      const summary = summarizeBalances(this.analytics.getAccountBalancesAt(pointDate))
      points.push({
        key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
        label: `${monthStart.getFullYear()}.${monthStart.getMonth() + 1}`,
        as_of_date: pointDate,
        total_assets_cents: summary.totalAssets,
        total_liabilities_cents: summary.totalLiabilities,
        net_worth_cents: summary.netWorth
      })
    }

    const previous = points.length > 1 ? points[points.length - 2].net_worth_cents : current.netWorth
    return {
      as_of_date: asOfDate,
      total_assets_cents: current.totalAssets,
      total_liabilities_cents: current.totalLiabilities,
      net_worth_cents: current.netWorth,
      net_worth_change_cents: current.netWorth - previous,
      allocation_total_cents: current.totalAssets,
      account_allocations: current.accountAllocations,
      net_worth_trend: points
    }
  }

  private enrichBudget(item: Budget): Budget {
    const usagePercent = item.limit_cents > 0 ? roundPercent((item.spent_cents / item.limit_cents) * 100) : 0
    return { ...item, usage_percent: usagePercent, status: getBudgetStatus(item.spent_cents, item.limit_cents, item.alert_percent) }
  }

  getCashflowChart(period: ChartPeriod = 'month'): CashflowChartData {
    if (period !== 'month' && period !== 'week') throw new Error('统计周期无效')
    const range = getChartRange(period)
    const rows = this.ledger.getCashflowRows(range.startDate, range.endDate, period)
    const rowMap = new Map(rows.map((row) => [row.period, row]))
    const points = []
    let cursor = range.start

    while (cursor < range.end) {
      const startDate = formatDateOnly(cursor)
      const next = period === 'month'
        ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
        : addDays(cursor, 7)
      const key = period === 'month' ? startDate.slice(0, 7) : startDate
      const row = rowMap.get(key)
      points.push({
        key,
        label: period === 'month' ? `${cursor.getMonth() + 1}月` : `${cursor.getMonth() + 1}/${cursor.getDate()}`,
        start_date: startDate,
        end_date: formatDateOnly(next),
        income_cents: row?.income_cents ?? 0,
        expense_cents: row?.expense_cents ?? 0,
        net_cents: (row?.income_cents ?? 0) - (row?.expense_cents ?? 0),
        transaction_count: row?.transaction_count ?? 0
      })
      cursor = next
    }

    return { period, start_date: range.startDate, end_date: range.endDate, points }
  }

  getDashboard(): DashboardData {
    const { month, startDate, endDate } = getCurrentMonthRange()
    const summary = this.transactions.getMonthlySummary(startDate, endDate)
    const allTime = this.transactions.getAllTimeNet()

    return {
      month,
      income_cents: summary.income_cents,
      expense_cents: summary.expense_cents,
      net_cents: summary.income_cents - summary.expense_cents,
      all_time_net_cents: allTime.net_cents,
      transaction_count: summary.transaction_count,
      accounts: this.accounts.list(false),
      recent_transactions: this.transactions.list(8),
      recent_transfers: this.transfers.list(5)
    }
  }

  createAccount(input: unknown): Account {
    const normalized = this.validateCreateAccountInput(input)
    const create = this.database.transaction(() => {
      if (this.accounts.findByName(normalized.name)) {
        throw new Error('账户名称已存在，包括已归档账户')
      }
      return this.accounts.create(normalized)
    })
    return create() as Account
  }

  updateAccount(input: unknown): Account {
    const normalized = this.validateUpdateAccountInput(input)
    const current = this.accounts.findById(normalized.id)
    if (!current) throw new Error('账户不存在或已被删除')
    if (this.accounts.findByName(normalized.name, normalized.id)) {
      throw new Error('账户名称已存在，包括已归档账户')
    }

    const usage = this.accounts.getUsage(current.id)
    if (usage.transaction_count > 0 || usage.transfer_count > 0) {
      if (current.type !== normalized.type) throw new Error('账户已有资金记录，不能修改账户类型')
      if (current.currency !== normalized.currency) throw new Error('账户已有资金记录，不能修改账户币种')
    }

    const update = this.database.transaction(() => this.accounts.update(normalized))
    return update() as Account
  }

  archiveAccount(id: unknown): AccountMutationResult {
    return this.setAccountArchived(id, true)
  }

  restoreAccount(id: unknown): AccountMutationResult {
    return this.setAccountArchived(id, false)
  }

  deleteAccount(id: unknown): AccountMutationResult {
    assertPositiveInteger(id, '账户 ID')
    const current = this.accounts.findById(id)
    if (!current) throw new Error('账户不存在或已被删除')
    const usage = this.accounts.getUsage(current.id)
    if (usage.transaction_count > 0 || usage.transfer_count > 0) {
      throw new Error(`该账户已关联 ${usage.transaction_count + usage.transfer_count} 条资金记录，不能删除，请先归档`)
    }
    if (current.opening_balance_cents !== 0) {
      throw new Error('账户存在期初余额，不能删除，请先将余额调整为 0 或归档')
    }

    const remove = this.database.transaction(() => {
      this.accounts.remove(current.id)
      return current
    })()
    return { action: 'deleted', account: { ...remove, is_archived: 1 } }
  }

  createTransfer(input: unknown): DashboardData {
    const normalized = this.validateTransferInput(input)
    const fromAccount = this.accounts.findById(normalized.fromAccountId, false)
    const toAccount = this.accounts.findById(normalized.toAccountId, false)
    if (!fromAccount) throw new Error('转出账户不存在、已归档或已被删除')
    if (!toAccount) throw new Error('转入账户不存在、已归档或已被删除')
    if (fromAccount.id === toAccount.id) throw new Error('转出账户和转入账户不能相同')
    if (fromAccount.currency !== toAccount.currency) {
      throw new Error('当前版本只支持相同币种账户之间转账')
    }

    const create = this.database.transaction(() => {
      this.transfers.insert({
        amountCents: normalized.amountCents,
        fromAccountId: normalized.fromAccountId,
        toAccountId: normalized.toAccountId,
        currency: fromAccount.currency,
        occurredAt: normalized.occurredAt,
        note: normalized.note
      })
    })
    create()
    return this.getDashboard()
  }

  deleteTransfer(id: unknown): DashboardData {
    assertPositiveInteger(id, '转账 ID')
    const remove = this.database.transaction(() => this.transfers.remove(id))
    const result = remove()
    if (result.changes === 0) throw new Error('转账记录不存在或已被删除')
    return this.getDashboard()
  }

  createCategory(input: unknown): Category {
    const normalized = this.validateCreateCategoryInput(input)
    const create = this.database.transaction(() => {
      if (this.categories.findByName(normalized.name, normalized.type)) {
        throw new Error('同类型收支分类名称已存在，包括已归档分类')
      }
      return this.categories.create(normalized)
    })
    return create() as Category
  }

  updateCategory(input: unknown): Category {
    const normalized = this.validateUpdateCategoryInput(input)
    const current = this.categories.findById(normalized.id)
    if (!current) throw new Error('分类不存在或已被删除')

    const nextType = normalized.type ?? current.type
    const update = this.database.transaction(() => {
      const duplicated = this.categories.findByName(normalized.name, nextType, normalized.id)
      if (duplicated) throw new Error('同类型收支分类名称已存在，包括已归档分类')

      if (normalized.type && normalized.type !== current.type && this.categories.getUsage(current.id).transaction_count > 0) {
        throw new Error('该分类已有收支记录，不能修改收入/支出类型')
      }

      return this.categories.update({ ...normalized, type: normalized.type })
    })
    return update() as Category
  }

  archiveCategory(id: unknown): CategoryMutationResult {
    return this.setCategoryArchived(id, true)
  }

  restoreCategory(id: unknown): CategoryMutationResult {
    assertPositiveInteger(id, '分类 ID')
    const current = this.categories.findById(id)
    if (!current) throw new Error('分类不存在或已被删除')
    const restored = this.database.transaction(() => {
      if (this.categories.findByName(current.name, current.type, current.id)) {
        throw new Error('已有同名启用分类，无法恢复该分类')
      }
      return this.categories.setArchived(current.id, false)
    })()
    return { action: 'restored', category: restored }
  }

  deleteCategory(id: unknown): CategoryMutationResult {
    assertPositiveInteger(id, '分类 ID')
    const current = this.categories.findById(id)
    if (!current) throw new Error('分类不存在或已被删除')
    const usage = this.categories.getUsage(current.id)
    if (usage.transaction_count > 0) {
      throw new Error(`该分类已被 ${usage.transaction_count} 条收支记录使用，不能删除，请先归档`)
    }

    const remove = this.database.transaction(() => {
      this.categories.remove(current.id)
      return current
    })()
    return { action: 'deleted', category: { ...remove, is_archived: 1 } }
  }

  createTransaction(input: unknown) {
    const normalized = this.validateTransactionInput(input)
    const create = this.database.transaction(() => {
      if (!this.accounts.exists(normalized.accountId)) {
        throw new Error('所选账户不存在或已被删除')
      }

      const category = this.categories.findById(normalized.categoryId, false)
      if (!category) throw new Error('所选分类不存在或已归档')
      if (category.type !== normalized.type) {
        throw new Error('分类类型与交易类型不匹配')
      }

      this.transactions.insert(normalized)
    })
    create()
    return this.getDashboard()
  }

  deleteTransaction(id: unknown) {
    assertPositiveInteger(id, '交易 ID')
    this.transactions.remove(id)
    return this.getDashboard()
  }

  private setAccountArchived(id: unknown, archived: boolean): AccountMutationResult {
    assertPositiveInteger(id, '账户 ID')
    const current = this.accounts.findById(id)
    if (!current) throw new Error('账户不存在或已被删除')
    if (current.is_archived === (archived ? 1 : 0)) {
      return { action: archived ? 'archived' : 'restored', account: current }
    }

    const update = this.database.transaction(() => {
      if (!archived && this.accounts.findByName(current.name, current.id)) {
        throw new Error('已有同名账户，无法恢复该账户')
      }
      return this.accounts.setArchived(current.id, archived)
    })()
    return { action: archived ? 'archived' : 'restored', account: update }
  }

  private setCategoryArchived(id: unknown, archived: boolean): CategoryMutationResult {
    assertPositiveInteger(id, '分类 ID')
    const current = this.categories.findById(id)
    if (!current) throw new Error('分类不存在或已被删除')
    if (current.is_archived === (archived ? 1 : 0)) {
      return { action: archived ? 'archived' : 'restored', category: current }
    }

    const update = this.database.transaction(() => {
      if (archived === false && this.categories.findByName(current.name, current.type, current.id)) {
        throw new Error('已有同名启用分类，无法恢复该分类')
      }
      return this.categories.setArchived(current.id, archived)
    })()
    return { action: archived ? 'archived' : 'restored', category: update }
  }

  private validateCreateAccountInput(input: unknown): CreateAccountInput {
    if (!input || typeof input !== 'object') throw new Error('账户参数无效')
    const value = input as Partial<CreateAccountInput>
    const name = this.normalizeAccountName(value.name)
    if (!isAccountType(value.type)) throw new Error('账户类型无效')
    const currency = this.normalizeCurrency(value.currency)
    const openingBalance = this.normalizeNonNegativeAmount(value.openingBalance, '期初余额')
    return { name, type: value.type, currency, openingBalance }
  }

  private validateUpdateAccountInput(input: unknown): UpdateAccountInput {
    if (!input || typeof input !== 'object') throw new Error('账户参数无效')
    const value = input as Partial<UpdateAccountInput>
    assertPositiveInteger(value.id, '账户 ID')
    const name = this.normalizeAccountName(value.name)
    if (!isAccountType(value.type)) throw new Error('账户类型无效')
    return { id: value.id, name, type: value.type, currency: this.normalizeCurrency(value.currency) }
  }

  private validateTransferInput(input: unknown): {
    fromAccountId: number
    toAccountId: number
    amountCents: number
    occurredAt: string
    note: string
  } {
    if (!input || typeof input !== 'object') throw new Error('转账参数无效')
    const value = input as Partial<NewTransferInput>
    assertPositiveInteger(value.fromAccountId, '转出账户 ID')
    assertPositiveInteger(value.toAccountId, '转入账户 ID')
    if (value.fromAccountId === value.toAccountId) throw new Error('转出账户和转入账户不能相同')
    const amount = Number(value.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('转账金额必须大于 0')
    const amountCents = Math.round(amount * 100)
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('转账金额超出可处理范围')
    const occurredAt = value.occurredAt || formatDateOnly(new Date())
    if (!isValidDateOnly(occurredAt)) throw new Error('日期格式无效')
    const note = typeof value.note === 'string' ? value.note.trim() : ''
    if (note.length > 500) throw new Error('备注不能超过 500 个字符')
    return { fromAccountId: value.fromAccountId, toAccountId: value.toAccountId, amountCents, occurredAt, note }
  }

  private normalizeAccountName(value: unknown) {
    if (typeof value !== 'string') throw new Error('账户名称不能为空')
    const name = value.trim()
    if (name.length < 1 || name.length > 50) throw new Error('账户名称长度需为 1-50 个字符')
    if (/[\u0000-\u001F\u007F]/.test(name)) throw new Error('账户名称包含非法控制字符')
    return name
  }

  private normalizeCurrency(value: unknown) {
    const currency = typeof value === 'string' ? value.trim().toUpperCase() : ''
    if (!CURRENCY_PATTERN.test(currency)) throw new Error('币种必须是 3 位大写字母，例如 CNY')
    return currency
  }

  private normalizeNonNegativeAmount(value: unknown, fieldName: string) {
    const amount = value === undefined || value === '' ? 0 : Number(value)
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`${fieldName}不能小于 0`)
    const cents = Math.round(amount * 100)
    if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`${fieldName}超出可处理范围`)
    return cents / 100
  }

  private validateCreateCategoryInput(input: unknown): CreateCategoryInput {
    if (!input || typeof input !== 'object') throw new Error('分类参数无效')
    const value = input as Partial<CreateCategoryInput>
    const name = this.normalizeCategoryName(value.name)
    const type = value.type
    if (!isTransactionType(type)) throw new Error('分类类型无效')
    return { name, type, color: this.normalizeCategoryColor(value.color) }
  }

  private validateUpdateCategoryInput(input: unknown): UpdateCategoryInput {
    if (!input || typeof input !== 'object') throw new Error('分类参数无效')
    const value = input as Partial<UpdateCategoryInput>
    assertPositiveInteger(value.id, '分类 ID')
    const name = this.normalizeCategoryName(value.name)
    if (value.type !== undefined && !isTransactionType(value.type)) throw new Error('分类类型无效')
    return { id: value.id, name, color: this.normalizeCategoryColor(value.color), type: value.type }
  }

  private normalizeCategoryName(value: unknown) {
    if (typeof value !== 'string') throw new Error('分类名称不能为空')
    const name = value.trim()
    if (name.length < 1 || name.length > 40) throw new Error('分类名称长度需为 1-40 个字符')
    if (/[\u0000-\u001F\u007F]/.test(name)) throw new Error('分类名称包含非法控制字符')
    return name
  }

  private normalizeCategoryColor(value: unknown) {
    const color = typeof value === 'string' && HEX_COLOR_PATTERN.test(value) ? value.toUpperCase() : DEFAULT_CATEGORY_COLOR
    return color
  }

  private validateTransactionInput(input: unknown): {
    type: TransactionType
    amountCents: number
    accountId: number
    categoryId: number
    occurredAt: string
    note: string
  } {
    if (!input || typeof input !== 'object') throw new Error('记账参数无效')
    const value = input as Partial<NewTransactionInput>

    if (!isTransactionType(value.type)) throw new Error('交易类型无效')
    assertPositiveInteger(value.accountId, '账户 ID')
    assertPositiveInteger(value.categoryId, '分类 ID')

    const amount = Number(value.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('金额必须大于 0')
    const amountCents = Math.round(amount * 100)
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('金额超出可处理范围')

    const occurredAt = value.occurredAt || formatDateOnly(new Date())
    if (!isValidDateOnly(occurredAt)) throw new Error('日期格式无效')

    const note = typeof value.note === 'string' ? value.note.trim() : ''
    if (note.length > 500) throw new Error('备注不能超过 500 个字符')

    return {
      type: value.type,
      amountCents,
      accountId: value.accountId,
      categoryId: value.categoryId,
      occurredAt,
      note
    }
  }
}
