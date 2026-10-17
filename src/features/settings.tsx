import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, Repeat2, RotateCcw, ShieldCheck } from 'lucide-react'
import type { BackgroundSettings, SecurityStatus } from '../../electron/preload'

export function SettingsView({ backgroundSettings, securityStatus, onBackgroundSaved, onRestored }: { backgroundSettings: BackgroundSettings | null; securityStatus: SecurityStatus | null; onBackgroundSaved: (settings: BackgroundSettings) => void; onRestored: () => void }) {
  const [launchAtLogin, setLaunchAtLogin] = useState(backgroundSettings?.launch_at_login === 1)
  const [keepInTray, setKeepInTray] = useState(backgroundSettings?.keep_in_tray !== 0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (backgroundSettings) { setLaunchAtLogin(backgroundSettings.launch_at_login === 1); setKeepInTray(backgroundSettings.keep_in_tray !== 0) } }, [backgroundSettings])

  const saveBackground = async () => {
    setBusy(true); setError(''); setMessage('')
    try { const settings = await window.easySpends.updateBackgroundSettings({ launchAtLogin, keepInTray }); onBackgroundSaved(settings); setMessage('后台运行设置已保存') } catch (saveError) { setError(saveError instanceof Error ? saveError.message : '保存后台设置失败') } finally { setBusy(false) }
  }
  const createBackup = async () => {
    setBusy(true); setError(''); setMessage('')
    try { const path = await window.easySpends.chooseBackupPath(); if (path) { const result = await window.easySpends.createBackup(path); setMessage(`加密备份已保存：${result.path}`) } } catch (backupError) { setError(backupError instanceof Error ? backupError.message : '创建备份失败') } finally { setBusy(false) }
  }
  const restoreBackup = async () => {
    setBusy(true); setError(''); setMessage('')
    try { const path = await window.easySpends.chooseRestorePath(); if (path) { await window.easySpends.restoreBackup(path); setMessage('备份恢复成功，数据层已重新加载'); onRestored() } } catch (restoreError) { setError(restoreError instanceof Error ? restoreError.message : '恢复备份失败') } finally { setBusy(false) }
  }
  const keyStorageLabel = securityStatus?.keyStorage === 'macos-keychain' ? 'macOS Keychain' : securityStatus?.keyStorage === 'electron-safe-storage' ? 'Electron safeStorage' : '不可用'
  return <div className="full-panel settings-page"><div className="list-toolbar"><div><span className="card-kicker">LOCAL SETTINGS</span><h2>应用设置</h2><p>管理后台运行、数据保护和本地备份。所有操作都在这台 Mac 上完成。</p></div><div className="local-status"><ShieldCheck size={15} />本地安全空间</div></div><div className="settings-grid"><section className="settings-card"><div className="settings-card-heading"><div><span className="card-kicker">BACKGROUND</span><h3>后台运行</h3></div><Repeat2 size={20} className="panel-muted-icon" /></div><label className="setting-toggle"><span><strong>最小化或关闭后保留托盘</strong><small>最小化或关闭窗口时隐藏到菜单栏，不退出后台任务和本地通知。</small></span><input type="checkbox" checked={keepInTray} onChange={(event) => setKeepInTray(event.target.checked)} /></label><label className="setting-toggle"><span><strong>登录时自动启动</strong><small>登录 macOS 后自动启动 EasySpends，并在后台检查周期记账。</small></span><input type="checkbox" checked={launchAtLogin} onChange={(event) => setLaunchAtLogin(event.target.checked)} /></label><button className="primary-button settings-save-button" disabled={busy} onClick={() => void saveBackground()}>{busy ? '处理中…' : '保存后台设置'} <CheckCircle2 size={16} /></button></section><section className="settings-card"><div className="settings-card-heading"><div><span className="card-kicker">DATA SECURITY</span><h3>数据安全与备份</h3></div><ShieldCheck size={20} className="panel-muted-icon" /></div><div className="security-status"><div className="security-status-icon"><ShieldCheck size={18} /></div><div><strong>{securityStatus?.encrypted ? '数据库已启用透明加密' : '数据库加密状态未知'}</strong><span>密钥存储：{keyStorageLabel}</span></div></div><div className="security-detail"><span>数据库路径</span><code>{securityStatus?.databasePath ?? '加载中…'}</code></div><div className="security-detail"><span>备份格式</span><code>AES-256-GCM 加密容器（.esb）</code></div><p className="settings-note">数据库密钥由系统密钥链保护，不在应用设置中保存明文密码。备份文件在 SQLite 加密基础上再次使用 AES-256-GCM 加密。</p><div className="settings-actions"><button className="secondary-button" disabled={busy} onClick={() => void createBackup()}><FileText size={15} />一键备份</button><button className="secondary-button" disabled={busy} onClick={() => void restoreBackup()}><RotateCcw size={15} />恢复备份</button></div></section></div>{message ? <div className="settings-message success"><CheckCircle2 size={15} />{message}</div> : null}{error ? <div className="settings-message error"><AlertTriangle size={15} />{error}</div> : null}<div className="settings-warning"><AlertTriangle size={16} /><span>请妥善保管 `.esb` 备份文件。当前备份密钥绑定本机应用的系统密钥链，跨 Mac 迁移需要后续增加用户口令导出功能。</span></div></div>
}
