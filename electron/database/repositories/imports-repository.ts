import type Database from 'better-sqlite3'
import type { ImportBatch, ImportSource } from '../types'

export class ImportsRepository {
  constructor(private readonly database: Database.Database) {}

  createBatch(source: ImportSource, fileName: string): ImportBatch {
    const result = this.database.prepare(`
      INSERT INTO import_batches (source, file_name, status)
      VALUES (?, ?, 'processing')
    `).run(source, fileName)
    return this.findBatch(Number(result.lastInsertRowid))!
  }

  findBatch(id: number): ImportBatch | undefined {
    return this.database.prepare(`
      SELECT id, source, file_name, row_count, imported_count, skipped_count, status, error_message, created_at
      FROM import_batches WHERE id = ? LIMIT 1
    `).get(id) as ImportBatch | undefined
  }

  hasExternalKey(source: ImportSource, externalKey: string) {
    return Boolean(this.database.prepare(`
      SELECT 1 FROM imported_records WHERE source = ? AND external_key = ? LIMIT 1
    `).get(source, externalKey))
  }

  addRecord(batchId: number, source: ImportSource, externalKey: string, transactionId: number, rawData: string) {
    this.database.prepare(`
      INSERT INTO imported_records (batch_id, source, external_key, transaction_id, raw_data)
      VALUES (?, ?, ?, ?, ?)
    `).run(batchId, source, externalKey, transactionId, rawData)
  }

  completeBatch(id: number, rowCount: number, importedCount: number, skippedCount: number) {
    this.database.prepare(`
      UPDATE import_batches
      SET row_count = ?, imported_count = ?, skipped_count = ?, status = 'completed', error_message = ''
      WHERE id = ?
    `).run(rowCount, importedCount, skippedCount, id)
    return this.findBatch(id)!
  }

  failBatch(id: number, errorMessage: string, rowCount = 0) {
    this.database.prepare(`
      UPDATE import_batches
      SET row_count = ?, status = 'failed', error_message = ?
      WHERE id = ?
    `).run(rowCount, errorMessage, id)
    return this.findBatch(id)!
  }

  list(limit = 20): ImportBatch[] {
    return this.database.prepare(`
      SELECT id, source, file_name, row_count, imported_count, skipped_count, status, error_message, created_at
      FROM import_batches ORDER BY id DESC LIMIT ?
    `).all(limit) as ImportBatch[]
  }
}
