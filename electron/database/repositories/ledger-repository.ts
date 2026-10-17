import type Database from 'better-sqlite3'
import type {
  CashflowDay,
  LedgerEntry,
  LedgerListOptions,
  LedgerEntryType
} from '../types'

export class LedgerRepository {
  constructor(private readonly database: Database.Database) {}

  list(options: LedgerListOptions = {}): LedgerEntry[] {
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500)
    const offset = Math.max(Number(options.offset) || 0, 0)
    const conditions: string[] = []
    const params: Array<string | number> = []

    if (options.type && options.type !== 'all') {
      conditions.push('entry_type = ?')
      params.push(options.type)
    }
    if (options.search?.trim()) {
      const search = `%${options.search.trim().slice(0, 80)}%`
      conditions.push(`(
        note LIKE ? OR category_name LIKE ? OR account_name LIKE ?
        OR from_account_name LIKE ? OR to_account_name LIKE ?
      )`)
      params.push(search, search, search, search, search)
    }
    if (options.fromDate) {
      conditions.push('occurred_at >= ?')
      params.push(options.fromDate)
    }
    if (options.toDate) {
      conditions.push('occurred_at < ?')
      params.push(options.toDate)
    }
    if (options.accountId) {
      conditions.push('(account_id = ? OR from_account_id = ? OR to_account_id = ?)')
      params.push(options.accountId, options.accountId, options.accountId)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    return this.database.prepare(`
      SELECT *
      FROM (
        SELECT
          t.id,
          'transaction' AS source,
          t.type AS entry_type,
          t.amount_cents,
          t.note,
          t.occurred_at,
          t.created_at,
          t.account_id,
          a.name AS account_name,
          t.category_id,
          c.name AS category_name,
          c.color AS category_color,
          NULL AS from_account_id,
          NULL AS from_account_name,
          NULL AS to_account_id,
          NULL AS to_account_name,
          a.currency AS currency
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        JOIN categories c ON c.id = t.category_id

        UNION ALL

        SELECT
          tr.id,
          'transfer' AS source,
          'transfer' AS entry_type,
          tr.amount_cents,
          tr.note,
          tr.occurred_at,
          tr.created_at,
          NULL AS account_id,
          NULL AS account_name,
          NULL AS category_id,
          NULL AS category_name,
          NULL AS category_color,
          tr.from_account_id,
          from_account.name AS from_account_name,
          tr.to_account_id,
          to_account.name AS to_account_name,
          tr.currency AS currency
        FROM transfers tr
        JOIN accounts from_account ON from_account.id = tr.from_account_id
        JOIN accounts to_account ON to_account.id = tr.to_account_id
      ) entries
      ${where}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as LedgerEntry[]
  }

  getCashflowRows(fromDate: string, toDate: string, period: 'month' | 'week'): CashflowDay[] {
    const periodExpression = period === 'month'
      ? "strftime('%Y-%m', occurred_at)"
      : "date(occurred_at, '-' || ((CAST(strftime('%w', occurred_at) AS INTEGER) + 6) % 7) || ' days')"

    return this.database.prepare(`
      SELECT
        ${periodExpression} AS period,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE occurred_at >= ? AND occurred_at < ?
      GROUP BY period
      ORDER BY period ASC
    `).all(fromDate, toDate) as CashflowDay[]
  }

  countByType(fromDate: string, toDate: string): Array<{ entry_type: LedgerEntryType; count: number }> {
    return this.database.prepare(`
      SELECT entry_type, COUNT(*) AS count
      FROM (
        SELECT type AS entry_type, occurred_at FROM transactions
        UNION ALL
        SELECT 'transfer' AS entry_type, occurred_at FROM transfers
      ) entries
      WHERE occurred_at >= ? AND occurred_at < ?
      GROUP BY entry_type
    `).all(fromDate, toDate) as Array<{ entry_type: LedgerEntryType; count: number }>
  }
}
