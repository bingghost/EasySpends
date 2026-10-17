import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'

const KEY_FILE_NAME = '.database-key'

export interface DatabaseKeyResult {
  key: string
  storage: 'macos-keychain' | 'electron-safe-storage' | 'unavailable'
}

export function getDatabaseKey(userDataPath: string): DatabaseKeyResult {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('macOS Keychain 尚未可用，无法安全初始化数据库密钥')
  }
  mkdirSync(userDataPath, { recursive: true })
  const keyPath = join(userDataPath, KEY_FILE_NAME)
  if (existsSync(keyPath)) {
    const encrypted = readFileSync(keyPath)
    const key = safeStorage.decryptString(encrypted)
    if (!key || key.length < 32) throw new Error('数据库密钥文件损坏，请从备份恢复或联系开发者')
    return { key, storage: process.platform === 'darwin' ? 'macos-keychain' : 'electron-safe-storage' }
  }

  const key = randomBytes(32).toString('base64url')
  const encrypted = safeStorage.encryptString(key)
  writeFileSync(keyPath, encrypted, { mode: 0o600, flag: 'wx' })
  return { key, storage: process.platform === 'darwin' ? 'macos-keychain' : 'electron-safe-storage' }
}

export function getDatabaseKeyPath(userDataPath: string) {
  return join(userDataPath, KEY_FILE_NAME)
}
