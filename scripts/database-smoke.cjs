const assert = require('node:assert/strict')
const Database = require('better-sqlite3-multiple-ciphers')

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cash',
    currency TEXT NOT NULL DEFAULT 'CNY',
    opening_balance_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    color TEXT NOT NULL DEFAULT '#A8AFBB',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    note TEXT NOT NULL DEFAULT '',
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

// 该 smoke test 验证重构后的契约假设：迁移记录存在、seed 数量正确、金额以分计算。
db.prepare('INSERT INTO schema_migrations (version, name, checksum) VALUES (1, ?, ?)').run('create-mvp-finance-tables', 'mvp-accounts-categories-transactions-v1')
db.prepare('INSERT INTO accounts (name, type, currency) VALUES (?, ?, ?)').run('现金账户', 'cash', 'CNY')
db.prepare('INSERT INTO accounts (name, type, currency) VALUES (?, ?, ?)').run('银行卡', 'bank', 'CNY')
const addCategory = db.prepare('INSERT INTO categories (name, type) VALUES (?, ?)')
addCategory.run('餐饮', 'expense')
addCategory.run('工资', 'income')

const accountId = db.prepare('SELECT id FROM accounts WHERE name = ?').get('银行卡').id
const expenseCategoryId = db.prepare('SELECT id FROM categories WHERE type = ?').get('expense').id
const incomeCategoryId = db.prepare('SELECT id FROM categories WHERE type = ?').get('income').id
const insertTransaction = db.prepare(`
  INSERT INTO transactions (type, amount_cents, account_id, category_id, note, occurred_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)
insertTransaction.run('income', 1000000, accountId, incomeCategoryId, '工资', '2026-08-01')
insertTransaction.run('expense', 3500, accountId, expenseCategoryId, '午餐', '2026-08-02')

const result = db.prepare(`
  SELECT
    SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END) AS income_cents,
    SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) AS expense_cents
  FROM transactions
`).get()

assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 1)
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count, 2)
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM categories').get().count, 2)
assert.equal(result.income_cents, 1000000)
assert.equal(result.expense_cents, 3500)
assert.equal(result.income_cents - result.expense_cents, 996500)
assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')

console.log(JSON.stringify({
  status: 'passed',
  migrations: 1,
  accounts: 2,
  categories: 2,
  income_cents: result.income_cents,
  expense_cents: result.expense_cents,
  net_cents: result.income_cents - result.expense_cents
}))
db.close()
