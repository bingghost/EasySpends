import type Database from 'better-sqlite3'
import type { RecurringRule, TransactionType } from '../types'

export interface RecurringRecord {
  name: string
  type: TransactionType
  amountCents: number
  accountId: number
  categoryId: number
  dayOfMonth: number
  nextRunOn: string
  note: string
  isEnabled: number
}

export class RecurringRepository {
  constructor(private readonly database: Database.Database) {}

  list(includeDisabled = true): RecurringRule[] {
    const enabledClause = includeDisabled ? '' : 'WHERE r.is_enabled = 1'
    return this.database.prepare(`
      SELECT r.id, r.name, r.type, r.amount_cents, r.account_id, a.name AS account_name,
        r.category_id, c.name AS category_name, c.color AS category_color,
        r.day_of_month, r.next_run_on, r.note, r.is_enabled, r.last_run_at,
        r.created_at, r.updated_at
      FROM recurring_rules r
      JOIN accounts a ON a.id = r.account_id
      JOIN categories c ON c.id = r.category_id
      ${enabledClause}
      ORDER BY r.is_enabled DESC, r.next_run_on ASC, r.id ASC
    `).all() as RecurringRule[]
  }

  findById(id: number): RecurringRule | undefined {
    return this.database.prepare(`
      SELECT r.id, r.name, r.type, r.amount_cents, r.account_id, a.name AS account_name,
        r.category_id, c.name AS category_name, c.color AS category_color,
        r.day_of_month, r.next_run_on, r.note, r.is_enabled, r.last_run_at,
        r.created_at, r.updated_at
      FROM recurring_rules r
      JOIN accounts a ON a.id = r.account_id
      JOIN categories c ON c.id = r.category_id
      WHERE r.id = ? LIMIT 1
    `).get(id) as RecurringRule | undefined
  }

  findDue(asOfDate: string): RecurringRule[] {
    return this.database.prepare(`
      SELECT r.id, r.name, r.type, r.amount_cents, r.account_id, a.name AS account_name,
        r.category_id, c.name AS category_name, c.color AS category_color,
        r.day_of_month, r.next_run_on, r.note, r.is_enabled, r.last_run_at,
        r.created_at, r.updated_at
      FROM recurring_rules r
      JOIN accounts a ON a.id = r.account_id
      JOIN categories c ON c.id = r.category_id
      WHERE r.is_enabled = 1 AND r.next_run_on <= ?
      ORDER BY r.next_run_on ASC, r.id ASC
    `).all(asOfDate) as RecurringRule[]
  }

  save(record: RecurringRecord, id?: number) {
    if (id) {
      this.database.prepare(`
        UPDATE recurring_rules
        SET name = ?, type = ?, amount_cents = ?, account_id = ?, category_id = ?,
          day_of_month = ?, next_run_on = ?, note = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(record.name, record.type, record.amountCents, record.accountId, record.categoryId, record.dayOfMonth, record.nextRunOn, record.note, record.isEnabled, id)
      return this.findById(id)!
    }
    const result = this.database.prepare(`
      INSERT INTO recurring_rules (name, type, amount_cents, account_id, category_id, day_of_month, next_run_on, note, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(record.name, record.type, record.amountCents, record.accountId, record.categoryId, record.dayOfMonth, record.nextRunOn, record.note, record.isEnabled)
    return this.findById(Number(result.lastInsertRowid))!
  }

  markRun(id: number, nextRunOn: string, runAt: string) {
    this.database.prepare(`
      UPDATE recurring_rules
      SET last_run_at = ?, next_run_on = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(runAt, nextRunOn, id)
  }

  remove(id: number) {
    return this.database.prepare('DELETE FROM recurring_rules WHERE id = ?').run(id)
  }
}
