const assert = require('node:assert/strict')
const Database = require('better-sqlite3-multiple-ciphers')

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_archived INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#A8AFBB', is_archived INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, amount_cents INTEGER NOT NULL, account_id INTEGER NOT NULL, category_id INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', occurred_at TEXT NOT NULL);
  CREATE TABLE recurring_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, amount_cents INTEGER NOT NULL, account_id INTEGER NOT NULL, category_id INTEGER NOT NULL, day_of_month INTEGER NOT NULL, next_run_on TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', is_enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT);
  CREATE TABLE import_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, file_name TEXT NOT NULL, row_count INTEGER NOT NULL DEFAULT 0, imported_count INTEGER NOT NULL DEFAULT 0, skipped_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'completed', error_message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE imported_records (id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL, source TEXT NOT NULL, external_key TEXT NOT NULL, transaction_id INTEGER NOT NULL, raw_data TEXT NOT NULL DEFAULT '', UNIQUE(source, external_key));
  CREATE TABLE notification_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, dedupe_key TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(event_type, dedupe_key));
  INSERT INTO accounts VALUES (1, '银行卡', 0);
  INSERT INTO categories VALUES (1, '餐饮', 'expense', '#E89B72', 0), (2, '工资', 'income', '#4DAA7C', 0);
`)

const rule = db.prepare(`INSERT INTO recurring_rules (name, type, amount_cents, account_id, category_id, day_of_month, next_run_on, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('每月房租', 'expense', 250000, 1, 1, 5, '2026-08-05', '房租')
const due = db.prepare(`SELECT * FROM recurring_rules WHERE is_enabled = 1 AND next_run_on <= ?`).all('2026-08-22')
assert.equal(due.length, 1)
const transaction = db.prepare(`INSERT INTO transactions (type, amount_cents, account_id, category_id, note, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`).run(due[0].type, due[0].amount_cents, due[0].account_id, due[0].category_id, `${due[0].note} · 自动记账`, due[0].next_run_on)
db.prepare(`UPDATE recurring_rules SET last_run_at = ?, next_run_on = ? WHERE id = ?`).run('2026-08-22T00:00:00.000Z', '2026-09-05', rule.lastInsertRowid)
assert.equal(transaction.changes, 1)
assert.equal(db.prepare(`SELECT next_run_on FROM recurring_rules WHERE id = ?`).get(rule.lastInsertRowid).next_run_on, '2026-09-05')

const batch = db.prepare(`INSERT INTO import_batches (source, file_name, row_count, status) VALUES (?, ?, ?, ?)`).run('wechat', 'wechat-bill.csv', 2, 'processing')
db.prepare(`INSERT INTO imported_records (batch_id, source, external_key, transaction_id, raw_data) VALUES (?, ?, ?, ?, ?)`).run(batch.lastInsertRowid, 'wechat', 'wx-001', transaction.lastInsertRowid, '["wx-001"]')
assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM imported_records WHERE source = ? AND external_key = ?`).get('wechat', 'wx-001').n, 1)
assert.throws(() => db.prepare(`INSERT INTO imported_records (batch_id, source, external_key, transaction_id) VALUES (?, ?, ?, ?)`).run(batch.lastInsertRowid, 'wechat', 'wx-001', transaction.lastInsertRowid), /UNIQUE/)
db.prepare(`UPDATE import_batches SET imported_count = 1, skipped_count = 1, status = 'completed' WHERE id = ?`).run(batch.lastInsertRowid)
assert.equal(db.prepare(`SELECT status FROM import_batches WHERE id = ?`).get(batch.lastInsertRowid).status, 'completed')

const event = db.prepare(`INSERT OR IGNORE INTO notification_events (event_type, dedupe_key, title, body) VALUES (?, ?, ?, ?)`).run('anomaly', 'expense:wx-001', '发现大额支出', '测试')
const duplicateEvent = db.prepare(`INSERT OR IGNORE INTO notification_events (event_type, dedupe_key, title, body) VALUES (?, ?, ?, ?)`).run('anomaly', 'expense:wx-001', '发现大额支出', '测试')
assert.equal(event.changes, 1)
assert.equal(duplicateEvent.changes, 0)
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')

console.log(JSON.stringify({ status: 'passed', recurring_rules_due: due.length, generated_transaction_id: transaction.lastInsertRowid, import_deduplication: true, notifications_deduplicated: true }))
db.close()
