const assert = require('node:assert/strict')
const Database = require('better-sqlite3-multiple-ciphers')

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'CNY', opening_balance_cents INTEGER NOT NULL DEFAULT 0, is_archived INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#A8AFBB', is_archived INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE transactions (id INTEGER PRIMARY KEY, type TEXT NOT NULL, amount_cents INTEGER NOT NULL, account_id INTEGER NOT NULL, category_id INTEGER NOT NULL, occurred_at TEXT NOT NULL);
  CREATE TABLE transfers (id INTEGER PRIMARY KEY, amount_cents INTEGER NOT NULL, from_account_id INTEGER NOT NULL, to_account_id INTEGER NOT NULL, occurred_at TEXT NOT NULL);
  CREATE TABLE budgets (id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL, month TEXT NOT NULL, limit_cents INTEGER NOT NULL, alert_percent INTEGER NOT NULL DEFAULT 80, UNIQUE(category_id, month));
  INSERT INTO accounts VALUES (1, '银行卡', 'bank', 'CNY', 100000, 0), (2, '支付宝', 'alipay', 'CNY', 0, 0);
  INSERT INTO categories VALUES (1, '餐饮', 'expense', '#E89B72', 0), (2, '工资', 'income', '#4DAA7C', 0);
  INSERT INTO transactions VALUES (1, 'income', 50000, 1, 2, '2026-08-03'), (2, 'expense', 25000, 1, 1, '2026-08-05'), (3, 'expense', 30000, 2, 1, '2026-08-10');
  INSERT INTO transfers VALUES (1, 20000, 1, 2, '2026-08-06');
  INSERT INTO budgets VALUES (1, 1, '2026-08', 40000, 80);
`)

const balances = db.prepare(`
  SELECT a.id, a.name,
    a.opening_balance_cents
      + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE -t.amount_cents END) FROM transactions t WHERE t.account_id = a.id), 0)
      + COALESCE((SELECT SUM(CASE WHEN tr.to_account_id = a.id THEN tr.amount_cents ELSE -tr.amount_cents END) FROM transfers tr WHERE tr.from_account_id = a.id OR tr.to_account_id = a.id), 0) AS balance_cents
  FROM accounts a WHERE a.is_archived = 0 ORDER BY a.id
`).all()
assert.deepEqual(balances, [
  { id: 1, name: '银行卡', balance_cents: 105000 },
  { id: 2, name: '支付宝', balance_cents: -10000 }
])
const totalAssets = balances.reduce((sum, account) => sum + Math.max(account.balance_cents, 0), 0)
const totalLiabilities = balances.reduce((sum, account) => sum + Math.max(-account.balance_cents, 0), 0)
assert.equal(totalAssets, 105000)
assert.equal(totalLiabilities, 10000)
assert.equal(Math.round((balances[0].balance_cents / totalAssets) * 1000) / 10, 100)

const budget = db.prepare(`
  SELECT b.limit_cents, COALESCE(SUM(t.amount_cents), 0) AS spent_cents,
    b.limit_cents - COALESCE(SUM(t.amount_cents), 0) AS remaining_cents
  FROM budgets b LEFT JOIN transactions t
    ON t.category_id = b.category_id AND t.type = 'expense' AND strftime('%Y-%m', t.occurred_at) = b.month
  WHERE b.month = '2026-08' GROUP BY b.id
`).get()
assert.deepEqual(budget, { limit_cents: 40000, spent_cents: 55000, remaining_cents: -15000 })
assert.equal(budget.spent_cents > budget.limit_cents, true)
assert.equal(Math.round((budget.spent_cents / budget.limit_cents) * 1000) / 10, 137.5)
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')

console.log(JSON.stringify({ status: 'passed', net_worth_cents: totalAssets - totalLiabilities, bank_share_percent: 100, budget_spent_cents: budget.spent_cents, budget_usage_percent: 137.5, budget_status: 'exceeded' }))
db.close()
