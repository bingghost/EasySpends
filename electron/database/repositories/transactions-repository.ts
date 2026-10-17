import type Database from 'better-sqlite3'
import type { MonthlySummary, NewTransactionInput, Transaction } from '../types'

export interface TransactionRecord {
  type: NewTransactionInput['type']
  amountCents: number
  accountId: number
  categoryId: number
  occurredAt: string
  note: string
}

export class TransactionsRepository {
  constructor(private readonly database: Database.Database) {}

  list(limit = 100): Transaction[] {
    return this.database.prepare(`
      SELECT
        t.id,
        t.type,
        t.amount_cents,
        t.note,
        t.occurred_at,
        t.created_at,
        a.id AS account_id,
        a.name AS account_name,
        c.id AS category_id,
        c.name AS category_name,
        c.color AS category_color
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      JOIN categories c ON c.id = t.category_id
      ORDER BY t.occurred_at DESC, t.id DESC
      LIMIT ?
    `).all(limit) as Transaction[]
  }

  insert(record: TransactionRecord) {
    return this.database.prepare(`
      INSERT INTO transactions (type, amount_cents, account_id, category_id, note, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.type,
      record.amountCents,
      record.accountId,
      record.categoryId,
      record.note,
      record.occurredAt
    )
  }

  remove(id: number) {
    return this.database.prepare('DELETE FROM transactions WHERE id = ?').run(id)
  }

  getMonthlySummary(startDate: string, endDate: string): MonthlySummary {
    return this.database.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE occurred_at >= ? AND occurred_at < ?
    `).get(startDate, endDate) as MonthlySummary
  }

  getAllTimeNet(): { net_cents: number } {
    return this.database.prepare(`
      SELECT COALESCE(SUM(
        CASE WHEN type = 'income' THEN amount_cents ELSE -amount_cents END
      ), 0) AS net_cents
      FROM transactions
    `).get() as { net_cents: number }
  }
}
