import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { AccountsRepository } from '../database/repositories/accounts-repository'
import { CategoriesRepository } from '../database/repositories/categories-repository'
import { ImportsRepository } from '../database/repositories/imports-repository'
import { TransactionsRepository } from '../database/repositories/transactions-repository'
import type { ImportPreview, ImportPreviewRow, ImportResult, ImportTransactionsInput, TransactionType } from '../database/types'

const DATE_PATTERN = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:\s+.*)?$/

function normalize(value: string) {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_\-（）()]/g, '')
}

function parseCsv(content: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    const next = content[index + 1]
    if (char === '"' && quoted && next === '"') { value += '"'; index += 1; continue }
    if (char === '"') { quoted = !quoted; continue }
    if (!quoted && (char === ',' || char === '\t')) { row.push(value); value = ''; continue }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1
      row.push(value); value = ''
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      continue
    }
    value += char
  }
  if (value || row.length > 0) { row.push(value); if (row.some((cell) => cell.trim() !== '')) rows.push(row) }
  return rows
}

function findColumn(headers: string[], candidates: string[]) {
  const normalizedHeaders = headers.map(normalize)
  const index = candidates.map(normalize).map((candidate) => normalizedHeaders.findIndex((header) => header.includes(candidate))).find((value) => value >= 0)
  return index ?? -1
}

function parseDate(value: string) {
  const input = value.trim().replace(/T/, ' ')
  const match = input.match(DATE_PATTERN)
  if (!match) return null
  const month = String(Number(match[2])).padStart(2, '0')
  const day = String(Number(match[3])).padStart(2, '0')
  const result = `${match[1]}-${month}-${day}`
  const date = new Date(`${result}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : result
}

function parseAmount(value: string) {
  const cleaned = value.replace(/[¥￥,\s]/g, '').replace(/\((.*)\)/, '-$1')
  const number = Number(cleaned)
  if (!Number.isFinite(number) || number === 0) return null
  return Math.round(Math.abs(number) * 100)
}

function inferType(typeValue: string, amountValue: string): TransactionType | null {
  const type = typeValue.toLowerCase()
  if (/收入|收款|入账|转入|退款|income|credit|refund/.test(type)) return 'income'
  if (/支出|付款|消费|转出|expense|debit|payment/.test(type)) return 'expense'
  const numeric = Number(amountValue.replace(/[¥￥,\s]/g, ''))
  if (Number.isFinite(numeric) && numeric !== 0) return numeric > 0 ? 'income' : 'expense'
  return null
}

function digest(row: string[]) {
  return createHash('sha1').update(row.join('\u001f')).digest('hex')
}

function findValue(row: string[], index: number) {
  return index >= 0 ? String(row[index] ?? '').trim() : ''
}

export class ImportService {
  constructor(
    private readonly database: Database.Database,
    private readonly accounts: AccountsRepository,
    private readonly categories: CategoriesRepository,
    private readonly transactions: TransactionsRepository,
    private readonly imports: ImportsRepository
  ) {}

  preview(input: ImportTransactionsInput): ImportPreview {
    if (!input || typeof input.content !== 'string' || input.content.trim().length === 0) throw new Error('账单文件内容为空')
    if (!['csv', 'wechat', 'alipay', 'other'].includes(input.source)) throw new Error('账单来源无效')
    const rows = parseCsv(input.content)
    if (rows.length < 2) throw new Error('账单至少需要包含表头和一条数据')
    const headers = rows[0]
    const dateIndex = findColumn(headers, ['日期', '交易时间', '交易日期', '发生时间', 'date', 'time'])
    const amountIndex = findColumn(headers, ['金额', '收支金额', '交易金额', 'amount', 'money'])
    const typeIndex = findColumn(headers, ['收支类型', '收支', '交易类型', 'type', 'direction'])
    const noteIndex = findColumn(headers, ['商品说明', '商品', '交易对方', '备注', '说明', 'description', 'note', 'name'])
    const keyIndex = findColumn(headers, ['交易单号', '交易号', '流水号', '订单号', '外部id', 'id'])
    const categoryIndex = findColumn(headers, ['分类', '类别', 'category'])
    if (dateIndex < 0 || amountIndex < 0) throw new Error('无法识别账单日期或金额列，请使用 CSV 表头：日期、金额、收支类型、备注')

    const previewRows: ImportPreviewRow[] = rows.slice(1).map((row, rowIndex) => {
      const rawDate = findValue(row, dateIndex)
      const rawAmount = findValue(row, amountIndex)
      const rawType = findValue(row, typeIndex)
      const type = inferType(rawType, rawAmount)
      const amountCents = parseAmount(rawAmount)
      const occurredAt = parseDate(rawDate)
      const externalKey = findValue(row, keyIndex) || digest(row)
      const categoryName = findValue(row, categoryIndex)
      let errorMessage: string | null = null
      if (!occurredAt) errorMessage = '日期格式无法识别'
      else if (!amountCents) errorMessage = '金额必须是非零数字'
      else if (!type) errorMessage = '无法判断收入或支出类型'
      const category = type && categoryName ? this.categories.findByName(categoryName, type) : undefined
      const fallbackCategoryId = type === 'income' ? input.defaultIncomeCategoryId : input.defaultExpenseCategoryId
      if (!errorMessage && !category && !fallbackCategoryId) errorMessage = '未找到分类，请指定默认分类或在 CSV 中提供已有分类'
      const duplicate = this.imports.hasExternalKey(input.source, externalKey)
      if (!errorMessage && duplicate) errorMessage = null
      return {
        row_number: rowIndex + 2,
        external_key: externalKey,
        type: type ?? 'expense',
        amount_cents: amountCents ?? 0,
        occurred_at: occurredAt ?? '',
        note: findValue(row, noteIndex),
        category_name: category?.name ?? (categoryName || (type === 'income' ? '默认收入分类' : '默认支出分类')),
        account_name: this.accounts.findById(input.accountId, false)?.name ?? '未选择账户',
        status: errorMessage ? 'invalid' : duplicate ? 'duplicate' : 'ready',
        error_message: errorMessage
      }
    })
    return {
      source: input.source,
      file_name: input.fileName,
      rows: previewRows,
      valid_count: previewRows.filter((row) => row.status === 'ready').length,
      duplicate_count: previewRows.filter((row) => row.status === 'duplicate').length,
      invalid_count: previewRows.filter((row) => row.status === 'invalid').length
    }
  }

  listHistory(limit?: number) {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100)
    return this.imports.list(normalizedLimit)
  }

  importTransactions(input: ImportTransactionsInput): ImportResult {
    const preview = this.preview(input)
    const account = this.accounts.findById(input.accountId, false)
    if (!account) throw new Error('导入账户不存在、已归档或已被删除')
    const batch = this.imports.createBatch(input.source, input.fileName)
    try {
      const importRows = this.database.transaction(() => {
        let importedCount = 0
        let skippedCount = 0
        const rawRows = parseCsv(input.content).slice(1)
        for (const row of preview.rows) {
          if (row.status !== 'ready') { skippedCount += 1; continue }
          if (this.imports.hasExternalKey(input.source, row.external_key)) { skippedCount += 1; continue }
          const typeCategory = row.type === 'income' ? input.defaultIncomeCategoryId : input.defaultExpenseCategoryId
          const namedCategory = this.categories.findByName(row.category_name, row.type)
          const categoryId = namedCategory?.is_archived === 0 ? namedCategory.id : typeCategory
          if (!categoryId) { skippedCount += 1; continue }
          const result = this.transactions.insert({
            type: row.type,
            amountCents: row.amount_cents,
            accountId: input.accountId,
            categoryId,
            occurredAt: row.occurred_at,
            note: row.note || `${input.source === 'wechat' ? '微信' : input.source === 'alipay' ? '支付宝' : 'CSV'}账单导入`
          })
          this.imports.addRecord(batch.id, input.source, row.external_key, Number(result.lastInsertRowid), JSON.stringify(rawRows[row.row_number - 2] ?? []))
          importedCount += 1
        }
        return { importedCount, skippedCount }
      })()
      const completed = this.imports.completeBatch(batch.id, preview.rows.length, importRows.importedCount, importRows.skippedCount)
      return { batch: completed, preview: { ...preview, valid_count: importRows.importedCount } }
    } catch (error) {
      this.imports.failBatch(batch.id, error instanceof Error ? error.message : '导入失败', preview.rows.length)
      throw error
    }
  }
}
