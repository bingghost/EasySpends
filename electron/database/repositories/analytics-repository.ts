import type Database from 'better-sqlite3'
import type { AccountType } from '../types'

export interface AccountBalanceSnapshot {
  id: number
  name: string
  type: AccountType
  currency: string
  balance_cents: number
}

export class AnalyticsRepository {
  constructor(private readonly database: Database.Database) {}

  getAccountBalancesAt(asOfDate: string): AccountBalanceSnapshot[] {
    return this.database.prepare(`
      SELECT
        a.id,
        a.name,
        a.type,
        a.currency,
        a.opening_balance_cents
          + COALESCE((
              SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE -t.amount_cents END)
              FROM transactions t
              WHERE t.account_id = a.id AND t.occurred_at <= ?
            ), 0)
          + COALESCE((
              SELECT SUM(CASE WHEN tr.to_account_id = a.id THEN tr.amount_cents ELSE -tr.amount_cents END)
              FROM transfers tr
              WHERE (tr.from_account_id = a.id OR tr.to_account_id = a.id) AND tr.occurred_at <= ?
            ), 0) AS balance_cents
      FROM accounts a
      WHERE a.is_archived = 0
      ORDER BY a.id ASC
    `).all(asOfDate, asOfDate) as AccountBalanceSnapshot[]
  }
}
