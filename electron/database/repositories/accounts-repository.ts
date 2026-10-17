import type Database from 'better-sqlite3'
import type { Account, AccountType, CreateAccountInput, UpdateAccountInput } from '../types'

export interface AccountUsage {
  transaction_count: number
  transfer_count: number
}

export class AccountsRepository {
  constructor(private readonly database: Database.Database) {}

  list(includeArchived = false): Account[] {
    const archiveClause = includeArchived ? '' : 'WHERE a.is_archived = 0'
    return this.database.prepare(`
      SELECT
        a.id,
        a.name,
        a.type,
        a.currency,
        a.opening_balance_cents,
        a.is_archived,
        a.opening_balance_cents
          + COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE -t.amount_cents END), 0)
          + COALESCE((
              SELECT SUM(CASE WHEN tr.to_account_id = a.id THEN tr.amount_cents ELSE -tr.amount_cents END)
              FROM transfers tr
              WHERE tr.from_account_id = a.id OR tr.to_account_id = a.id
            ), 0) AS balance_cents
      FROM accounts a
      LEFT JOIN transactions t ON t.account_id = a.id
      ${archiveClause}
      GROUP BY a.id
      ORDER BY a.is_archived ASC, a.id ASC
    `).all() as Account[]
  }

  exists(id: number, includeArchived = false): boolean {
    const archiveClause = includeArchived ? '' : 'AND is_archived = 0'
    return Boolean(this.database.prepare(`SELECT 1 FROM accounts WHERE id = ? ${archiveClause} LIMIT 1`).get(id))
  }

  findById(id: number, includeArchived = true): Account | undefined {
    const archiveClause = includeArchived ? '' : 'AND a.is_archived = 0'
    return this.database.prepare(`
      SELECT
        a.id,
        a.name,
        a.type,
        a.currency,
        a.opening_balance_cents,
        a.is_archived,
        a.opening_balance_cents
          + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE -t.amount_cents END) FROM transactions t WHERE t.account_id = a.id), 0)
          + COALESCE((SELECT SUM(CASE WHEN tr.to_account_id = a.id THEN tr.amount_cents ELSE -tr.amount_cents END) FROM transfers tr WHERE tr.from_account_id = a.id OR tr.to_account_id = a.id), 0)
          AS balance_cents
      FROM accounts a
      WHERE a.id = ? ${archiveClause}
      LIMIT 1
    `).get(id) as Account | undefined
  }

  findByName(name: string, excludeId?: number): Account | undefined {
    const excluded = excludeId ? 'AND id <> ?' : ''
    const params = excludeId ? [name, excludeId] : [name]
    return this.database.prepare(`
      SELECT id, name, type, currency, opening_balance_cents, is_archived, opening_balance_cents AS balance_cents
      FROM accounts
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) ${excluded}
      LIMIT 1
    `).get(...params) as Account | undefined
  }

  getUsage(id: number): AccountUsage {
    return this.database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM transactions WHERE account_id = ?) AS transaction_count,
        (SELECT COUNT(*) FROM transfers WHERE from_account_id = ? OR to_account_id = ?) AS transfer_count
    `).get(id, id, id) as AccountUsage
  }

  create(input: CreateAccountInput): Account {
    const result = this.database.prepare(`
      INSERT INTO accounts (name, type, currency, opening_balance_cents)
      VALUES (?, ?, ?, ?)
    `).run(input.name, input.type, input.currency, Math.round(input.openingBalance * 100))
    return this.findById(Number(result.lastInsertRowid))!
  }

  update(input: UpdateAccountInput): Account {
    this.database.prepare(`
      UPDATE accounts
      SET name = ?, type = ?, currency = ?
      WHERE id = ?
    `).run(input.name, input.type, input.currency, input.id)
    return this.findById(input.id)!
  }

  setArchived(id: number, archived: boolean): Account {
    this.database.prepare(`
      UPDATE accounts
      SET is_archived = ?
      WHERE id = ?
    `).run(archived ? 1 : 0, id)
    return this.findById(id)!
  }

  remove(id: number) {
    return this.database.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  }

  isSupportedType(type: string): type is AccountType {
    return ['cash', 'bank', 'alipay', 'wechat', 'credit_card', 'investment', 'loan', 'other'].includes(type)
  }
}
