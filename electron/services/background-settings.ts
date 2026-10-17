import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BackgroundSettings, UpdateBackgroundSettingsInput } from '../database/types'

interface StoredSettings {
  keepInTray?: boolean
}

const SETTINGS_FILE = 'background-settings.json'

function settingsPath(userDataPath: string) {
  return join(userDataPath, SETTINGS_FILE)
}

function readSettings(userDataPath: string): StoredSettings {
  const path = settingsPath(userDataPath)
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as StoredSettings
  } catch {
    return {}
  }
}

export function getKeepInTray(userDataPath: string) {
  return readSettings(userDataPath).keepInTray !== false
}

export function saveBackgroundSettings(userDataPath: string, input: UpdateBackgroundSettingsInput, launchAtLogin: boolean): BackgroundSettings {
  const current = readSettings(userDataPath)
  const keepInTray = input.keepInTray === undefined ? getKeepInTray(userDataPath) : input.keepInTray
  mkdirSync(userDataPath, { recursive: true })
  writeFileSync(settingsPath(userDataPath), JSON.stringify({ ...current, keepInTray }, null, 2), { mode: 0o600 })
  return { launch_at_login: launchAtLogin ? 1 : 0, keep_in_tray: keepInTray ? 1 : 0 }
}
