const assert = require('node:assert/strict')
const Database = require('better-sqlite3-multiple-ciphers')

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'CNY');
  CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#A8AFBB');
  CREATE TABLE transactions (id INTEGER PRIMARY KEY, type TEXT NOT NULL, amount_cents INTEGER NOT NULL, account_id INTEGER NOT NULL, category_id INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', occurred_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE transfers (id INTEGER PRIMARY KEY, amount_cents INTEGER NOT NULL, from_account_id INTEGER NOT NULL, to_account_id INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'CNY', note TEXT NOT NULL DEFAULT '', occurred_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`)
db.exec(`
  INSERT INTO accounts (id, name) VALUES (1, '银行卡'), (2, '支付宝');
  INSERT INTO categories (id, name, type, color) VALUES (1, '工资', 'income', '#4DAA7C'), (2, '餐饮', 'expense', '#E89B72');
`)
db.prepare(`INSERT INTO transactions (id, type, amount_cents, account_id, category_id, note, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(1, 'income', 100000, 1, 1, '八月工资', '2026-08-03')
db.prepare(`INSERT INTO transactions (id, type, amount_cents, account_id, category_id, note, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(2, 'expense', 2500, 2, 2, '午餐', '2026-08-05')
db.prepare(`INSERT INTO transfers (id, amount_cents, from_account_id, to_account_id, note, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`).run(1, 30000, 1, 2, '本周生活费', '2026-08-06')

const entries = db.prepare(`
  SELECT * FROM (
    SELECT t.id, 'transaction' AS source, t.type AS entry_type, t.amount_cents, t.note, t.occurred_at, a.name AS account_name, c.name AS category_name, NULL AS from_account_name, NULL AS to_account_name
    FROM transactions t JOIN accounts a ON a.id = t.account_id JOIN categories c ON c.id = t.category_id
    UNION ALL
    SELECT tr.id, 'transfer' AS source, 'transfer' AS entry_type, tr.amount_cents, tr.note, tr.occurred_at, NULL, NULL, fa.name, ta.name
    FROM transfers tr JOIN accounts fa ON fa.id = tr.from_account_id JOIN accounts ta ON ta.id = tr.to_account_id
  ) entries
  ORDER BY occurred_at ASC, id ASC
`).all()
assert.deepEqual(entries.map((entry) => entry.entry_type), ['income', 'expense', 'transfer'])
assert.equal(entries.find((entry) => entry.entry_type === 'transfer').from_account_name, '银行卡')

const month = db.prepare(`
  SELECT strftime('%Y-%m', occurred_at) AS period,
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents,
    COUNT(*) AS transaction_count
  FROM transactions WHERE occurred_at >= ? AND occurred_at < ? GROUP BY period
`).get('2026-08-01', '2026-09-01')
assert.deepEqual(month, { period: '2026-08', income_cents: 100000, expense_cents: 2500, transaction_count: 2 })

const week = db.prepare(`
  SELECT date(occurred_at, '-' || ((CAST(strftime('%w', occurred_at) AS INTEGER) + 6) % 7) || ' days') AS period,
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents,
    COUNT(*) AS transaction_count
  FROM transactions WHERE occurred_at >= ? AND occurred_at < ? GROUP BY period
`).get('2026-08-03', '2026-08-10')
assert.deepEqual(week, { period: '2026-08-03', income_cents: 100000, expense_cents: 2500, transaction_count: 2 })
assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM transfers`).get().n, 1)
assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')

console.log(JSON.stringify({ status: 'passed', entries: entries.length, month_income_cents: month.income_cents, month_expense_cents: month.expense_cents, week_period: week.period, transfers_excluded_from_chart: true }))
db.close()
