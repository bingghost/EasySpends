import type Database from 'better-sqlite3'
import type { Transfer } from '../types'

export interface TransferRecord {
  amountCents: number
  fromAccountId: number
  toAccountId: number
  currency: string
  occurredAt: string
  note: string
}

export class TransfersRepository {
  constructor(private readonly database: Database.Database) {}

  list(limit = 100): Transfer[] {
    return this.database.prepare(`
      SELECT
        tr.id,
        tr.amount_cents,
        tr.from_account_id,
        from_account.name AS from_account_name,
        tr.to_account_id,
        to_account.name AS to_account_name,
        tr.currency,
        tr.note,
        tr.occurred_at,
        tr.created_at
      FROM transfers tr
      JOIN accounts from_account ON from_account.id = tr.from_account_id
      JOIN accounts to_account ON to_account.id = tr.to_account_id
      ORDER BY tr.occurred_at DESC, tr.id DESC
      LIMIT ?
    `).all(limit) as Transfer[]
  }

  insert(record: TransferRecord) {
    return this.database.prepare(`
      INSERT INTO transfers (amount_cents, from_account_id, to_account_id, currency, note, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.amountCents,
      record.fromAccountId,
      record.toAccountId,
      record.currency,
      record.note,
      record.occurredAt
    )
  }

  remove(id: number) {
    return this.database.prepare('DELETE FROM transfers WHERE id = ?').run(id)
  }
}
