import type Database from 'better-sqlite3'

interface Migration {
  version: number
  name: string
  checksum: string
  up: (database: Database.Database) => void
}

const defaultExpenseCategories = [
  ['餐饮', '#E89B72'],
  ['交通', '#8BA8E8'],
  ['购物', '#C59BE8'],
  ['居住', '#74C7A1'],
  ['娱乐', '#E8C66E'],
  ['医疗', '#E9829D'],
  ['教育', '#6DB9C8'],
  ['其他支出', '#A8AFBB']
] as const

const defaultIncomeCategories = [
  ['工资', '#4DAA7C'],
  ['奖金', '#63B5D8'],
  ['投资收益', '#C99A4A'],
  ['其他收入', '#8B7BC6']
] as const

const migrations: Migration[] = [
  {
    version: 1,
    name: 'create-mvp-finance-tables',
    checksum: 'mvp-accounts-categories-transactions-v1',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'cash',
          currency TEXT NOT NULL DEFAULT 'CNY',
          opening_balance_cents INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          color TEXT NOT NULL DEFAULT '#A8AFBB',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          account_id INTEGER NOT NULL REFERENCES accounts(id),
          category_id INTEGER NOT NULL REFERENCES categories(id),
          note TEXT NOT NULL DEFAULT '',
          occurred_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_occurred_at ON transactions(occurred_at);
        CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      `)
    }
  },
  {
    version: 2,
    name: 'add-category-archive-state',
    checksum: 'categories-is-archived-v2',
    up: (database) => {
      const column = database.prepare(`
        SELECT 1
        FROM pragma_table_info('categories')
        WHERE name = 'is_archived'
        LIMIT 1
      `).get()
      if (!column) {
        database.exec(`
          ALTER TABLE categories
          ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1))
        `)
      }
      database.exec('CREATE INDEX IF NOT EXISTS idx_categories_type_archived ON categories(type, is_archived, id)')
    }
  },
  {
    version: 3,
    name: 'add-account-archive-and-transfers',
    checksum: 'accounts-archive-transfers-v3',
    up: (database) => {
      const accountArchiveColumn = database.prepare(`
        SELECT 1
        FROM pragma_table_info('accounts')
        WHERE name = 'is_archived'
        LIMIT 1
      `).get()
      if (!accountArchiveColumn) {
        database.exec(`
          ALTER TABLE accounts
          ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1))
        `)
      }

      database.exec(`
        CREATE TABLE IF NOT EXISTS transfers (
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
        CREATE INDEX IF NOT EXISTS idx_transfers_occurred_at ON transfers(occurred_at);
        CREATE INDEX IF NOT EXISTS idx_transfers_from_account ON transfers(from_account_id, occurred_at);
        CREATE INDEX IF NOT EXISTS idx_transfers_to_account ON transfers(to_account_id, occurred_at);
        CREATE INDEX IF NOT EXISTS idx_accounts_archived ON accounts(is_archived, id);
      `)
    }
  },
  {
    version: 4,
    name: 'add-monthly-category-budgets',
    checksum: 'monthly-category-budgets-v4',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS budgets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
          month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
          limit_cents INTEGER NOT NULL CHECK (limit_cents > 0),
          alert_percent INTEGER NOT NULL DEFAULT 80 CHECK (alert_percent BETWEEN 1 AND 100),
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (category_id, month)
        );
        CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month, category_id);
      `)
    }
  },
  {
    version: 5,
    name: 'add-automation-import-notification-data',
    checksum: 'automation-import-notifications-v5',
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS recurring_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
          category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
          day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
          next_run_on TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
          last_run_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_recurring_rules_due ON recurring_rules(is_enabled, next_run_on);

        CREATE TABLE IF NOT EXISTS import_batches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source TEXT NOT NULL CHECK (source IN ('csv', 'wechat', 'alipay', 'other')),
          file_name TEXT NOT NULL,
          row_count INTEGER NOT NULL DEFAULT 0,
          imported_count INTEGER NOT NULL DEFAULT 0,
          skipped_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
          error_message TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS imported_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
          source TEXT NOT NULL,
          external_key TEXT NOT NULL,
          transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
          raw_data TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (source, external_key)
        );
        CREATE INDEX IF NOT EXISTS idx_imported_records_transaction ON imported_records(transaction_id);

        CREATE TABLE IF NOT EXISTS notification_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          budget_enabled INTEGER NOT NULL DEFAULT 1 CHECK (budget_enabled IN (0, 1)),
          anomaly_enabled INTEGER NOT NULL DEFAULT 1 CHECK (anomaly_enabled IN (0, 1)),
          recurring_enabled INTEGER NOT NULL DEFAULT 1 CHECK (recurring_enabled IN (0, 1)),
          anomaly_amount_cents INTEGER NOT NULL DEFAULT 500000 CHECK (anomaly_amount_cents > 0),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO notification_settings (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS notification_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          dedupe_key TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (event_type, dedupe_key)
        );
        CREATE INDEX IF NOT EXISTS idx_notification_events_created ON notification_events(created_at);
      `)
    }
  }
]

function ensureMigrationTable(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

function hasTable(database: Database.Database, name: string) {
  return Boolean(database.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1
  `).get(name))
}

function seedDefaultData(database: Database.Database) {
  const accountCount = database.prepare('SELECT COUNT(*) AS count FROM accounts').get() as { count: number }
  if (accountCount.count === 0) {
    const insertAccount = database.prepare(
      'INSERT INTO accounts (name, type, currency, opening_balance_cents) VALUES (?, ?, ?, ?)'
    )
    const seedAccounts = database.transaction(() => {
      insertAccount.run('现金账户', 'cash', 'CNY', 0)
      insertAccount.run('银行卡', 'bank', 'CNY', 0)
    })
    seedAccounts()
  }

  const categoryCount = database.prepare('SELECT COUNT(*) AS count FROM categories').get() as { count: number }
  if (categoryCount.count === 0) {
    const insertCategory = database.prepare('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)')
    const seedCategories = database.transaction(() => {
      for (const [name, color] of defaultExpenseCategories) insertCategory.run(name, 'expense', color)
      for (const [name, color] of defaultIncomeCategories) insertCategory.run(name, 'income', color)
    })
    seedCategories()
  }
}

export function runMigrations(database: Database.Database) {
  ensureMigrationTable(database)

  // 当前版本发布前已经存在的 MVP 数据库没有 schema_migrations，
  // 将其视为 v1 已完成，避免重新执行建表迁移。
  const migrationCount = database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number }
  if (migrationCount.count === 0 && hasTable(database, 'accounts') && hasTable(database, 'categories') && hasTable(database, 'transactions')) {
    database.prepare(`
      INSERT INTO schema_migrations (version, name, checksum)
      VALUES (?, ?, ?)
    `).run(1, 'create-mvp-finance-tables', 'legacy-mvp-database-v1')
  }

  for (const migration of migrations) {
    const applied = database.prepare('SELECT checksum FROM schema_migrations WHERE version = ?').get(migration.version) as { checksum?: string } | undefined
    if (applied) {
      if (applied.checksum !== migration.checksum && applied.checksum !== 'legacy-mvp-database-v1') {
        throw new Error(`数据库迁移校验失败：v${migration.version} ${migration.name}`)
      }
      continue
    }

    const applyMigration = database.transaction(() => {
      migration.up(database)
      database.prepare(`
        INSERT INTO schema_migrations (version, name, checksum)
        VALUES (?, ?, ?)
      `).run(migration.version, migration.name, migration.checksum)
    })
    applyMigration()
  }

  seedDefaultData(database)
}
