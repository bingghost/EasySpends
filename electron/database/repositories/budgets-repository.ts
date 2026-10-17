import type Database from 'better-sqlite3'
import type { Budget } from '../types'

export class BudgetsRepository {
  constructor(private readonly database: Database.Database) {}

  listByMonth(month: string): Budget[] {
    return this.database.prepare(`
      SELECT
        b.id,
        b.category_id,
        c.name AS category_name,
        c.color AS category_color,
        b.month,
        b.limit_cents,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS spent_cents,
        b.limit_cents - COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS remaining_cents,
        b.alert_percent,
        b.note,
        b.created_at,
        b.updated_at
      FROM budgets b
      JOIN categories c ON c.id = b.category_id
      LEFT JOIN transactions t
        ON t.category_id = b.category_id
        AND t.type = 'expense'
        AND strftime('%Y-%m', t.occurred_at) = b.month
      WHERE b.month = ?
      GROUP BY b.id, c.id
      ORDER BY c.type DESC, c.name COLLATE NOCASE ASC
    `).all(month) as Budget[]
  }

  findById(id: number): Budget | undefined {
    return this.database.prepare(`
      SELECT
        b.id,
        b.category_id,
        c.name AS category_name,
        c.color AS category_color,
        b.month,
        b.limit_cents,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS spent_cents,
        b.limit_cents - COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS remaining_cents,
        b.alert_percent,
        b.note,
        b.created_at,
        b.updated_at
      FROM budgets b
      JOIN categories c ON c.id = b.category_id
      LEFT JOIN transactions t
        ON t.category_id = b.category_id
        AND t.type = 'expense'
        AND strftime('%Y-%m', t.occurred_at) = b.month
      WHERE b.id = ?
      GROUP BY b.id, c.id
      LIMIT 1
    `).get(id) as Budget | undefined
  }

  findByCategoryAndMonth(categoryId: number, month: string): Budget | undefined {
    return this.database.prepare('SELECT id FROM budgets WHERE category_id = ? AND month = ? LIMIT 1').get(categoryId, month) as Budget | undefined
  }

  save(input: { id?: number; categoryId: number; month: string; limitCents: number; alertPercent: number; note: string }) {
    if (input.id) {
      this.database.prepare(`
        UPDATE budgets
        SET category_id = ?, month = ?, limit_cents = ?, alert_percent = ?, note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(input.categoryId, input.month, input.limitCents, input.alertPercent, input.note, input.id)
      return this.findById(input.id)!
    }

    const result = this.database.prepare(`
      INSERT INTO budgets (category_id, month, limit_cents, alert_percent, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(input.categoryId, input.month, input.limitCents, input.alertPercent, input.note)
    return this.findById(Number(result.lastInsertRowid))!
  }

  remove(id: number) {
    return this.database.prepare('DELETE FROM budgets WHERE id = ?').run(id)
  }
}
