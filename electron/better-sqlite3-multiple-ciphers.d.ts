declare module 'better-sqlite3-multiple-ciphers' {
  import BetterSqlite3 = require('better-sqlite3')

  interface EncryptedDatabase extends Omit<BetterSqlite3.Database, 'key' | 'rekey'> {
    key(key: Buffer): number
    rekey(key: Buffer): number
  }

  interface EncryptedDatabaseConstructor {
    new (path: string, options?: BetterSqlite3.Options): EncryptedDatabase
    (path: string, options?: BetterSqlite3.Options): EncryptedDatabase
  }

  const Database: EncryptedDatabaseConstructor
  export = Database
}
