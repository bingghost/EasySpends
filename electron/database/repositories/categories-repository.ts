import type Database from 'better-sqlite3'
import type {
  Category,
  CreateCategoryInput,
  TransactionType,
  UpdateCategoryInput
} from '../types'

export interface CategoryUsage {
  transaction_count: number
}

export class CategoriesRepository {
  constructor(private readonly database: Database.Database) {}

  list(type?: TransactionType, includeArchived = false): Category[] {
    const archiveClause = includeArchived ? '' : 'AND is_archived = 0'
    if (type) {
      return this.database.prepare(`
        SELECT id, name, type, color, is_archived
        FROM categories
        WHERE type = ? ${archiveClause}
        ORDER BY is_archived ASC, id ASC
      `).all(type) as Category[]
    }

    return this.database.prepare(`
      SELECT id, name, type, color, is_archived
      FROM categories
      WHERE 1 = 1 ${archiveClause}
      ORDER BY type ASC, is_archived ASC, id ASC
    `).all() as Category[]
  }

  findById(id: number, includeArchived = true): Category | undefined {
    const archiveClause = includeArchived ? '' : 'AND is_archived = 0'
    return this.database.prepare(`
      SELECT id, name, type, color, is_archived
      FROM categories
      WHERE id = ? ${archiveClause}
      LIMIT 1
    `).get(id) as Category | undefined
  }

  findByName(name: string, type: TransactionType, excludeId?: number): Category | undefined {
    const excluded = excludeId ? 'AND id <> ?' : ''
    const params = excludeId ? [type, name, excludeId] : [type, name]
    return this.database.prepare(`
      SELECT id, name, type, color, is_archived
      FROM categories
      WHERE type = ? AND name = ? ${excluded}
      LIMIT 1
    `).get(...params) as Category | undefined
  }

  getUsage(id: number): CategoryUsage {
    return this.database.prepare(`
      SELECT COUNT(*) AS transaction_count
      FROM transactions
      WHERE category_id = ?
    `).get(id) as CategoryUsage
  }

  create(input: CreateCategoryInput): Category {
    const result = this.database.prepare(`
      INSERT INTO categories (name, type, color)
      VALUES (?, ?, ?)
    `).run(input.name, input.type, input.color)
    return this.findById(Number(result.lastInsertRowid))!
  }

  update(input: UpdateCategoryInput): Category {
    if (input.type) {
      this.database.prepare(`
        UPDATE categories
        SET name = ?, type = ?, color = ?
        WHERE id = ?
      `).run(input.name, input.type, input.color, input.id)
    } else {
      this.database.prepare(`
        UPDATE categories
        SET name = ?, color = ?
        WHERE id = ?
      `).run(input.name, input.color, input.id)
    }
    return this.findById(input.id)!
  }

  setArchived(id: number, archived: boolean): Category {
    this.database.prepare(`
      UPDATE categories
      SET is_archived = ?
      WHERE id = ?
    `).run(archived ? 1 : 0, id)
    return this.findById(id)!
  }

  remove(id: number) {
    return this.database.prepare('DELETE FROM categories WHERE id = ?').run(id)
  }
}
