import type Database from 'better-sqlite3'
import { AccountsRepository } from '../database/repositories/accounts-repository'
import { CategoriesRepository } from '../database/repositories/categories-repository'
import { RecurringRepository } from '../database/repositories/recurring-repository'
import { TransactionsRepository } from '../database/repositories/transactions-repository'
import type { RecurringRunResult, RecurringRule, SaveRecurringRuleInput, TransactionType } from '../database/types'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function nextMonthDate(current: string, day: number) {
  const [year, month] = current.split('-').map(Number)
  const next = new Date(year, month, 1)
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

export class RecurringService {
  constructor(
    private readonly database: Database.Database,
    private readonly recurring: RecurringRepository,
    private readonly accounts: AccountsRepository,
    private readonly categories: CategoriesRepository,
    private readonly transactions: TransactionsRepository
  ) {}

  list(includeDisabled = true) {
    return this.recurring.list(includeDisabled)
  }

  save(input: unknown): RecurringRule {
    if (!input || typeof input !== 'object') throw new Error('周期记账参数无效')
    const value = input as Partial<SaveRecurringRuleInput>
    const name = typeof value.name === 'string' ? value.name.trim() : ''
    if (!name || name.length > 80) throw new Error('周期记账名称不能为空且不能超过 80 个字符')
    if (value.type !== 'income' && value.type !== 'expense') throw new Error('周期记账类型无效')
    if (!Number.isSafeInteger(value.accountId) || Number(value.accountId) <= 0) throw new Error('账户 ID 无效')
    if (!Number.isSafeInteger(value.categoryId) || Number(value.categoryId) <= 0) throw new Error('分类 ID 无效')
    const amount = Number(value.amount)
    const amountCents = Math.round(amount * 100)
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amountCents)) throw new Error('周期记账金额必须大于 0')
    const dayOfMonth = Number(value.dayOfMonth)
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) throw new Error('执行日必须是 1-31')
    if (typeof value.nextRunOn !== 'string' || !isValidDate(value.nextRunOn)) throw new Error('下次执行日期格式无效')
    if (value.id !== undefined && (!Number.isSafeInteger(value.id) || Number(value.id) <= 0)) throw new Error('周期规则 ID 无效')
    const accountId = value.accountId as number
    const categoryId = value.categoryId as number
    const account = this.accounts.findById(accountId, false)
    if (!account) throw new Error('账户不存在、已归档或已被删除')
    const category = this.categories.findById(categoryId, false)
    if (!category) throw new Error('分类不存在、已归档或已被删除')
    if (category.type !== value.type) throw new Error('周期记账类型与分类类型不匹配')
    const note = typeof value.note === 'string' ? value.note.trim() : ''
    if (note.length > 500) throw new Error('备注不能超过 500 个字符')
    const saved = this.database.transaction(() => this.recurring.save({
      name,
      type: value.type as TransactionType,
      amountCents,
      accountId,
      categoryId,
      dayOfMonth,
      nextRunOn: value.nextRunOn!,
      note,
      isEnabled: value.isEnabled === false ? 0 : 1
    }, value.id))
    return saved()
  }

  delete(id: unknown) {
    if (!Number.isSafeInteger(id) || Number(id) <= 0) throw new Error('周期规则 ID 无效')
    const result = this.recurring.remove(Number(id))
    if (result.changes === 0) throw new Error('周期规则不存在或已被删除')
  }

  runDue(asOfDate = new Date().toISOString().slice(0, 10)): RecurringRunResult[] {
    if (!isValidDate(asOfDate)) throw new Error('执行日期格式无效')
    const now = new Date().toISOString()
    const run = this.database.transaction(() => {
      const results: RecurringRunResult[] = []
      for (const rule of this.recurring.findDue(asOfDate)) {
        const transaction = this.transactions.insert({
          type: rule.type,
          amountCents: rule.amount_cents,
          accountId: rule.account_id,
          categoryId: rule.category_id,
          occurredAt: rule.next_run_on,
          note: rule.note ? `${rule.note} · 自动记账` : '周期自动记账'
        })
        const nextRunOn = nextMonthDate(rule.next_run_on, rule.day_of_month)
        this.recurring.markRun(rule.id, nextRunOn, now)
        results.push({ rule_id: rule.id, transaction_id: Number(transaction.lastInsertRowid), occurred_at: rule.next_run_on, next_run_on: nextRunOn })
      }
      return results
    })
    return run()
  }
}
