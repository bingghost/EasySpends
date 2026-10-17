-- EasySpends target schema v2
-- 说明：此文件是目标结构设计与后续迁移的基线，不会自动覆盖当前 MVP 数据库。
-- 约定：金额均以最小货币单位（如分）存储；所有 ID 由应用层生成 UUID/ULID；时间统一存储 UTC ISO-8601 文本。

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ledgers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_currency_code TEXT NOT NULL DEFAULT 'CNY',
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS currencies (
  code TEXT PRIMARY KEY CHECK (length(code) BETWEEN 3 AND 8),
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimal_digits INTEGER NOT NULL DEFAULT 2 CHECK (decimal_digits BETWEEN 0 AND 8),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  base_currency_code TEXT NOT NULL REFERENCES currencies(code),
  quote_currency_code TEXT NOT NULL REFERENCES currencies(code),
  rate_numerator INTEGER NOT NULL CHECK (rate_numerator > 0),
  rate_denominator INTEGER NOT NULL CHECK (rate_denominator > 0),
  effective_date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (ledger_id, base_currency_code, quote_currency_code, effective_date)
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN (
    'cash', 'bank', 'credit_card', 'e_wallet', 'investment', 'loan',
    'receivable', 'payable', 'income', 'expense', 'equity', 'other'
  )),
  currency_code TEXT NOT NULL REFERENCES currencies(code),
  institution_name TEXT,
  account_mask TEXT,
  is_included_in_net_worth INTEGER NOT NULL DEFAULT 1 CHECK (is_included_in_net_worth IN (0, 1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  UNIQUE (ledger_id, name)
);

CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  from_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  to_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL REFERENCES currencies(code),
  occurred_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (from_account_id <> to_account_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type IN ('income', 'expense')),
  color TEXT NOT NULL DEFAULT '#A8AFBB',
  icon TEXT,
  system_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  UNIQUE (ledger_id, parent_id, name)
);

CREATE TABLE IF NOT EXISTS payees (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  default_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (ledger_id, normalized_name)
);

-- 交易是业务事件；所有实际账户和收入/支出分类的变动统一放在 postings。
-- category_id 代表虚拟的收入/支出科目，因此同一交易的 postings 可以表达多分类拆分并保持平衡。
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'income', 'expense', 'transfer', 'refund', 'adjustment', 'opening_balance'
  )),
  occurred_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  payee_id TEXT REFERENCES payees(id) ON DELETE SET NULL,
  title TEXT,
  note TEXT NOT NULL DEFAULT '',
  reference TEXT,
  total_minor INTEGER NOT NULL CHECK (total_minor > 0),
  currency_code TEXT NOT NULL REFERENCES currencies(code),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN (
    'manual', 'import', 'ocr', 'voice', 'recurring', 'sync', 'migration'
  )),
  source_external_id TEXT,
  recurring_rule_id TEXT,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'voided')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);

-- posting.amount_minor 为有符号金额：资产/现金流入为正，流出为负；支出分类为正，收入分类为负。
-- 每一行必须且只能关联实际账户或收入/支出分类；同一交易的 base_amount_minor 之和必须为 0。
CREATE TABLE IF NOT EXISTS postings (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),
  currency_code TEXT NOT NULL REFERENCES currencies(code),
  base_amount_minor INTEGER NOT NULL,
  exchange_rate_numerator INTEGER NOT NULL DEFAULT 1 CHECK (exchange_rate_numerator > 0),
  exchange_rate_denominator INTEGER NOT NULL DEFAULT 1 CHECK (exchange_rate_denominator > 0),
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((account_id IS NOT NULL AND category_id IS NULL) OR (account_id IS NULL AND category_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#A8AFBB',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (ledger_id, name)
);

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE TABLE IF NOT EXISTS recurring_rules (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense', 'transfer')),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
  interval_value INTEGER NOT NULL DEFAULT 1 CHECK (interval_value > 0),
  next_run_date TEXT NOT NULL,
  end_date TEXT,
  template_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS recurring_rule_runs (
  id TEXT PRIMARY KEY,
  recurring_rule_id TEXT NOT NULL REFERENCES recurring_rules(id) ON DELETE CASCADE,
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  scheduled_date TEXT NOT NULL,
  run_status TEXT NOT NULL CHECK (run_status IN ('created', 'skipped', 'failed')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (recurring_rule_id, scheduled_date)
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly', 'custom')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  budgeting_method TEXT NOT NULL DEFAULT 'category_limit' CHECK (budgeting_method IN (
    'category_limit', 'envelope', 'bucket', 'zero_based'
  )),
  rollover_enabled INTEGER NOT NULL DEFAULT 0 CHECK (rollover_enabled IN (0, 1)),
  currency_code TEXT NOT NULL REFERENCES currencies(code),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS budget_allocations (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  planned_minor INTEGER NOT NULL CHECK (planned_minor >= 0),
  rollover_minor INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (budget_id, period_start, category_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  sha256 TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  encryption_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (ledger_id, sha256)
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('csv', 'ofx', 'qif', 'json', 'beancount', 'gnucash', 'other')),
  source_file_name TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'committed', 'failed', 'cancelled')),
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  imported_rows INTEGER NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
  skipped_rows INTEGER NOT NULL DEFAULT 0 CHECK (skipped_rows >= 0),
  error_message TEXT,
  mapping_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  committed_at TEXT
);

CREATE TABLE IF NOT EXISTS import_rows (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  raw_json TEXT NOT NULL,
  normalized_json TEXT,
  row_status TEXT NOT NULL DEFAULT 'pending' CHECK (row_status IN ('pending', 'ready', 'imported', 'skipped', 'error')),
  duplicate_key TEXT,
  error_message TEXT,
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  UNIQUE (import_job_id, row_number)
);

-- 为未来加密同步准备的应用级变更日志；不记录密码和明文 token。
CREATE TABLE IF NOT EXISTS change_log (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  payload_json TEXT NOT NULL,
  device_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL DEFAULT 'local_user' CHECK (actor_type IN ('local_user', 'system', 'importer', 'sync')),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ledgers_default ON ledgers(is_default) WHERE is_default = 1;
CREATE INDEX IF NOT EXISTS idx_accounts_ledger_active ON accounts(ledger_id, is_archived, sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_ledger_type ON categories(ledger_id, category_type, is_archived, sort_order);
CREATE INDEX IF NOT EXISTS idx_transfers_ledger_date ON transfers(ledger_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_from_account ON transfers(from_account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_to_account ON transfers(to_account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_payees_ledger_normalized ON payees(ledger_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_date ON transactions(ledger_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_type ON transactions(ledger_id, transaction_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(ledger_id, source, source_external_id);
CREATE INDEX IF NOT EXISTS idx_postings_transaction ON postings(transaction_id);
CREATE INDEX IF NOT EXISTS idx_postings_account ON postings(account_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_postings_category ON postings(category_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_rules(ledger_id, is_active, next_run_date);
CREATE INDEX IF NOT EXISTS idx_budget_allocations_period ON budget_allocations(budget_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_attachments_transaction ON attachments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_import_rows_job_status ON import_rows(import_job_id, row_status);
CREATE INDEX IF NOT EXISTS idx_change_log_sync ON change_log(synced_at, sequence);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_transactions_updated_at
AFTER UPDATE ON transactions
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE transactions
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         revision = OLD.revision + 1
   WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_accounts_updated_at
AFTER UPDATE ON accounts
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE accounts
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_categories_updated_at
AFTER UPDATE ON categories
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE categories
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_budget_allocations_updated_at
AFTER UPDATE ON budget_allocations
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE budget_allocations
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = OLD.id;
END;
