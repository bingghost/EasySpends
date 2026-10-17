import EncryptedDatabaseConstructor from 'better-sqlite3-multiple-ciphers'
import type BetterSqlite3 from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface DatabaseConnection {
  database: EncryptedDatabase
  databasePath: string
  encrypted: boolean
  keyStorage: 'macos-keychain' | 'electron-safe-storage' | 'unavailable'
}

type EncryptedDatabase = BetterSqlite3.Database & { key(key: Buffer): void; rekey(key: Buffer): void }
type KeyStorage = DatabaseConnection['keyStorage']

function isPlainSQLiteFile(databasePath: string) {
  if (!existsSync(databasePath) || statSync(databasePath).size < 16) return false
  return readFileSync(databasePath, { encoding: 'utf8', flag: 'r' }).slice(0, 15) === 'SQLite format 3'
}

function configureDatabase(database: EncryptedDatabase) {
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = NORMAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
}

function verifyDatabase(database: EncryptedDatabase) {
  database.pragma('user_version')
  database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' LIMIT 1").all()
}

export function openDatabase(userDataPath: string, filename = 'easyspends.db', key?: string, keyStorage: KeyStorage = 'unavailable'): DatabaseConnection {
  mkdirSync(userDataPath, { recursive: true })
  const databasePath = join(userDataPath, filename)
  const existed = existsSync(databasePath) && statSync(databasePath).size > 0
  const plain = existed && isPlainSQLiteFile(databasePath)
  const database = new EncryptedDatabaseConstructor(databasePath) as unknown as EncryptedDatabase

  try {
    if (!key) throw new Error('数据库密钥未提供')
    const keyBuffer = Buffer.from(key, 'base64url')
    if (keyBuffer.byteLength !== 32) throw new Error('数据库密钥长度无效')
    if (existed && !plain) {
      database.key(keyBuffer)
    } else if (existed && plain) {
      // 旧版 MVP 数据库是明文 SQLite。先关闭 WAL，再在同一个文件上执行透明加密。
      database.pragma('wal_checkpoint(TRUNCATE)')
      database.pragma('journal_mode = DELETE')
      database.rekey(keyBuffer)
    } else {
      database.rekey(keyBuffer)
    }
    verifyDatabase(database)
    configureDatabase(database)
    return { database, databasePath, encrypted: true, keyStorage }
  } catch (error) {
    if (database.open) database.close()
    const message = error instanceof Error ? error.message : '数据库打开失败'
    throw new Error(`无法打开本地加密数据库：${message}`)
  }
}

export function checkpointDatabase(database: EncryptedDatabase, mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'PASSIVE') {
  return database.pragma(`wal_checkpoint(${mode})`)
}

export function closeDatabase(database?: EncryptedDatabase) {
  if (!database || !database.open) return
  checkpointDatabase(database, 'PASSIVE')
  database.close()
}
