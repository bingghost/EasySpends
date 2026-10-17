const assert = require('node:assert/strict')
const Database = require('better-sqlite3-multiple-ciphers')

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    opening_balance_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1))
  );
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    color TEXT NOT NULL DEFAULT '#A8AFBB',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1))
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
  CREATE TABLE transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    from_account_id INTEGER NOT NULL REFERENCES accounts(id),
    to_account_id INTEGER NOT NULL REFERENCES accounts(id),
    currency TEXT NOT NULL DEFAULT 'CNY',
    note TEXT NOT NULL DEFAULT '',
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (from_account_id <> to_account_id)
  );
`)

const insertAccount = db.prepare('INSERT INTO accounts (name, type, opening_balance_cents) VALUES (?, ?, ?)')
insertAccount.run('银行卡', 'bank', 100000)
insertAccount.run('支付宝', 'alipay', 0)
const bankId = 1
const alipayId = 2
const categoryId = db.prepare("INSERT INTO categories (name, type) VALUES ('工资', 'income')").run().lastInsertRowid

db.prepare(`
  INSERT INTO transactions (type, amount_cents, account_id, category_id, occurred_at)
  VALUES ('income', 50000, ?, ?, '2026-08-01')
`).run(bankId, categoryId)

db.prepare(`
  INSERT INTO transfers (amount_cents, from_account_id, to_account_id, currency, occurred_at, note)
  VALUES (?, ?, ?, 'CNY', '2026-08-02', '本月生活费')
`).run(30000, bankId, alipayId)

const balances = db.prepare(`
  SELECT a.name,
    a.opening_balance_cents
      + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE -t.amount_cents END) FROM transactions t WHERE t.account_id = a.id), 0)
      + COALESCE((SELECT SUM(CASE WHEN tr.to_account_id = a.id THEN tr.amount_cents ELSE -tr.amount_cents END) FROM transfers tr WHERE tr.from_account_id = a.id OR tr.to_account_id = a.id), 0) AS balance_cents
  FROM accounts a
  ORDER BY a.id
`).all()

const income = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM transactions WHERE type = 'income'").get().cents
assert.deepEqual(balances, [
  { name: '银行卡', balance_cents: 120000 },
  { name: '支付宝', balance_cents: 30000 }
])
assert.equal(income, 50000)
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM transfers').get().n, 1)
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')

console.log(JSON.stringify({ status: 'passed', bank_balance_cents: 120000, alipay_balance_cents: 30000, income_cents: income, transfers: 1 }))
db.close()
