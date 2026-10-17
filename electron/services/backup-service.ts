import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import EncryptedDatabaseConstructor from 'better-sqlite3-multiple-ciphers'
import type BetterSqlite3 from 'better-sqlite3'
import { checkpointDatabase } from '../database/connection'
import type { BackupResult, SecurityStatus } from '../database/types'

type EncryptedDatabase = BetterSqlite3.Database & { key(key: Buffer): void; rekey(key: Buffer): void }
type KeyStorage = SecurityStatus['keyStorage']
const MAGIC = Buffer.from('EASYSPENDS-BACKUP-V1\0', 'utf8')
const NONCE_LENGTH = 12
const TAG_LENGTH = 16

function backupKey(databaseKey: string) {
  return createHash('sha256').update(`EasySpends backup v1\0${databaseKey}`).digest()
}

export class BackupService {
  constructor(
    private readonly userDataPath: string,
    private readonly databasePath: string,
    private readonly databaseKey: string,
    private readonly keyStorage: KeyStorage,
    private readonly database?: EncryptedDatabase
  ) {}

  getSecurityStatus(): SecurityStatus {
    return {
      encrypted: true,
      keyStorage: this.keyStorage,
      databasePath: this.databasePath,
      backupFormat: 'encrypted-aes-256-gcm'
    }
  }

  createBackup(targetPath: string): BackupResult {
    if (!targetPath) throw new Error('备份目标路径不能为空')
    mkdirSync(join(this.userDataPath, 'backups'), { recursive: true })
    if (!this.database || !this.database.open) throw new Error('数据库尚未打开，无法创建备份')
    checkpointDatabase(this.database, 'TRUNCATE')
    const plainDbBytes = readFileSync(this.databasePath)
    const nonce = randomBytes(NONCE_LENGTH)
    const cipher = createCipheriv('aes-256-gcm', backupKey(this.databaseKey), nonce)
    const ciphertext = Buffer.concat([cipher.update(plainDbBytes), cipher.final()])
    const tag = cipher.getAuthTag()
    const payload = Buffer.concat([MAGIC, nonce, tag, ciphertext])
    writeFileSync(targetPath, payload, { mode: 0o600 })
    return { path: targetPath, bytes: payload.byteLength, createdAt: new Date().toISOString(), encrypted: true }
  }

  restoreBackup(backupPath: string): BackupResult {
    if (!backupPath || !existsSync(backupPath)) throw new Error('备份文件不存在')
    const payload = readFileSync(backupPath)
    if (payload.subarray(0, MAGIC.length).compare(MAGIC) !== 0) throw new Error('不是 EasySpends 加密备份文件')
    const nonceStart = MAGIC.length
    const tagStart = nonceStart + NONCE_LENGTH
    const ciphertextStart = tagStart + TAG_LENGTH
    const nonce = payload.subarray(nonceStart, tagStart)
    const tag = payload.subarray(tagStart, ciphertextStart)
    const ciphertext = payload.subarray(ciphertextStart)
    const decipher = createDecipheriv('aes-256-gcm', backupKey(this.databaseKey), nonce)
    decipher.setAuthTag(tag)
    const restoredBytes = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    const tempPath = join(this.userDataPath, `.restore-${Date.now()}.db`)
    const safetyPath = join(this.userDataPath, `easyspends-pre-restore-${Date.now()}.db`)
    try {
      writeFileSync(tempPath, restoredBytes, { mode: 0o600 })
      const validationDb = new EncryptedDatabaseConstructor(tempPath) as unknown as EncryptedDatabase
      validationDb.key(Buffer.from(this.databaseKey, 'base64url'))
      const quickCheck = validationDb.pragma('quick_check') as Array<{ quick_check: string }>
      const schemaCheck = validationDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get()
      validationDb.close()
      if (quickCheck[0]?.quick_check !== 'ok' || !schemaCheck) throw new Error('备份数据库完整性检查失败')
      if (existsSync(this.databasePath)) copyFileSync(this.databasePath, safetyPath)
      for (const sidecar of [`${this.databasePath}-wal`, `${this.databasePath}-shm`]) if (existsSync(sidecar)) rmSync(sidecar, { force: true })
      renameSync(tempPath, this.databasePath)
      return { path: backupPath, bytes: payload.byteLength, createdAt: new Date().toISOString(), encrypted: true }
    } catch (error) {
      if (existsSync(tempPath)) rmSync(tempPath, { force: true })
      throw error
    }
  }
}
