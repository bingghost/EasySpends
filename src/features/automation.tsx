import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Bell, CheckCircle2, FileText, Pencil, Play, Plus, Repeat2, ShieldCheck, Upload, Trash2, X } from 'lucide-react'
import type { Account, Category, ImportBatch, ImportPreview, ImportResult, ImportSource, NotificationEvent, NotificationSettings, RecurringRule, TransactionType } from '../../electron/preload'
import { formatMoney } from '../format'

export function AutomationView({ rules, importHistory, notificationEvents, notificationSettings, accounts, categories, onRecurringSaved, onRecurringDelete, onRunRecurring, onImportCompleted, onNotificationSettingsSaved }: { rules: RecurringRule[]; importHistory: ImportBatch[]; notificationEvents: NotificationEvent[]; notificationSettings: NotificationSettings | null; accounts: Account[]; categories: Category[]; onRecurringSaved: () => void; onRecurringDelete: (id: number) => void; onRunRecurring: () => void; onImportCompleted: (result: ImportResult) => void; onNotificationSettingsSaved: (settings: NotificationSettings) => void }) {
  const [tab, setTab] = useState<'recurring' | 'import' | 'notifications'>('recurring')
  const [ruleEditor, setRuleEditor] = useState<RecurringRule | null | undefined>(undefined)
  return <div className="full-panel automation-page"><div className="list-toolbar"><div><span className="card-kicker">AUTOMATION HUB</span><h2>自动化中心</h2><p>让固定账单自动入账，导入第三方账单，并在关键财务事件发生时提醒你。</p></div><div className="local-status"><ShieldCheck size={15} />仅处理本地数据</div></div><div className="automation-tabs"><button className={tab === 'recurring' ? 'active' : ''} onClick={() => setTab('recurring')}><Repeat2 size={15} />定期记账</button><button className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}><Upload size={15} />账单导入</button><button className={tab === 'notifications' ? 'active' : ''} onClick={() => setTab('notifications')}><Bell size={15} />本地通知</button></div>{tab === 'recurring' ? <section className="automation-section"><div className="automation-section-heading"><div><span className="card-kicker">RECURRING ENTRIES</span><h3>定期自动记账</h3><p>应用启动时及后台每分钟检查到期规则，生成收入或支出流水。</p></div><div className="automation-heading-actions"><button className="secondary-button" onClick={onRunRecurring}><Play size={15} />立即执行到期规则</button><button className="primary-button" onClick={() => setRuleEditor(null)}><Plus size={17} />新增规则</button></div></div>{rules.length > 0 ? <div className="automation-rule-list">{rules.map((rule) => <div className={`automation-rule-row ${rule.is_enabled ? '' : 'disabled'}`} key={rule.id}><div className={`automation-rule-icon ${rule.type}`}><Repeat2 size={17} /></div><div className="automation-rule-main"><div className="automation-rule-title"><strong>{rule.name}</strong><span>{rule.is_enabled ? '启用中' : '已暂停'}</span></div><p>{rule.type === 'income' ? '收入' : '支出'} · {rule.category_name} · {rule.account_name} · 每月 {rule.day_of_month} 日</p><small>下次执行：{rule.next_run_on}{rule.last_run_at ? ` · 上次执行 ${rule.last_run_at.slice(0, 10)}` : ''}</small></div><strong className={`automation-rule-amount ${rule.type}`}>{rule.type === 'income' ? '+' : '-'}{formatMoney(rule.amount_cents)}</strong><button className="row-action" title="编辑规则" onClick={() => setRuleEditor(rule)}><Pencil size={15} /></button><button className="row-action delete-action" title="删除规则" onClick={() => onRecurringDelete(rule.id)}><Trash2 size={15} /></button></div>)}</div> : <div className="automation-empty"><Repeat2 size={22} /><strong>还没有定期记账规则</strong><span>适合添加房租、工资、订阅和固定还款。</span><button className="ghost-button" onClick={() => setRuleEditor(null)}>新增第一条规则 <Plus size={15} /></button></div>}</section> : tab === 'import' ? <ImportPanel accounts={accounts} categories={categories} importHistory={importHistory} onCompleted={onImportCompleted} /> : <NotificationPanel settings={notificationSettings} events={notificationEvents} onSaved={onNotificationSettingsSaved} />}{ruleEditor !== undefined ? <RecurringRuleModal rule={ruleEditor ?? undefined} accounts={accounts} categories={categories} onClose={() => setRuleEditor(undefined)} onSaved={() => { setRuleEditor(undefined); onRecurringSaved() }} /> : null}</div>
}

function RecurringRuleModal({ rule, accounts, categories, onClose, onSaved }: { rule?: RecurringRule; accounts: Account[]; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const activeAccounts = accounts.filter((account) => account.is_archived === 0)
  const activeCategories = categories.filter((category) => category.is_archived === 0)
  const today = new Date().toISOString().slice(0, 10)
  const [name, setName] = useState(rule?.name ?? '')
  const [type, setType] = useState<TransactionType>(rule?.type ?? 'expense')
  const [amount, setAmount] = useState(rule ? String(rule.amount_cents / 100) : '')
  const [accountId, setAccountId] = useState(String(rule?.account_id ?? activeAccounts[0]?.id ?? ''))
  const [categoryId, setCategoryId] = useState(String(rule?.category_id ?? activeCategories.find((category) => category.type === 'expense')?.id ?? ''))
  const [dayOfMonth, setDayOfMonth] = useState(String(rule?.day_of_month ?? 1))
  const [nextRunOn, setNextRunOn] = useState(rule?.next_run_on ?? today)
  const [note, setNote] = useState(rule?.note ?? '')
  const [enabled, setEnabled] = useState(rule?.is_enabled !== 0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const matchingCategories = activeCategories.filter((category) => category.type === type)
  useEffect(() => { if (!matchingCategories.some((category) => String(category.id) === categoryId)) setCategoryId(String(matchingCategories[0]?.id ?? '')) }, [type])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      await window.easySpends.saveRecurringRule({ id: rule?.id, name, type, amount: Number(amount), accountId: Number(accountId), categoryId: Number(categoryId), dayOfMonth: Number(dayOfMonth), nextRunOn, note, isEnabled: enabled })
      onSaved()
    } catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : '保存周期规则失败') } finally { setSaving(false) }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="modal-card automation-modal"><div className="modal-header"><div><span className="card-kicker">RECURRING ENTRY</span><h2>{rule ? '编辑周期记账' : '新增周期记账'}</h2><p>到期后自动生成一笔普通收入或支出流水。</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit}><div className="form-grid"><label><span>规则名称</span><input autoFocus placeholder="例如：每月房租" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>类型</span><select value={type} onChange={(event) => setType(event.target.value as TransactionType)}><option value="expense">支出</option><option value="income">收入</option></select></label></div><div className="form-grid"><label className="amount-field"><span>金额</span><div><b>¥</b><input inputMode="decimal" placeholder="例如 2500" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} /></div></label><label><span>账户</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{activeAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label></div><div className="form-grid"><label><span>{type === 'expense' ? '支出分类' : '收入分类'}</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{matchingCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label><span>每月执行日</span><input type="number" min="1" max="31" value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value)} /></label></div><div className="form-grid"><label><span>下次执行日期</span><input type="date" value={nextRunOn} onChange={(event) => setNextRunOn(event.target.value)} /></label><label><span>状态</span><select value={enabled ? 'enabled' : 'disabled'} onChange={(event) => setEnabled(event.target.value === 'enabled')}><option value="enabled">启用</option><option value="disabled">暂停</option></select></label></div><label><span>备注</span><input maxLength={500} placeholder="例如：房东/订阅服务名称" value={note} onChange={(event) => setNote(event.target.value)} /></label>{error ? <div className="form-error">{error}</div> : null}<div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={saving}>{saving ? '保存中…' : '保存规则'} <CheckCircle2 size={17} /></button></div></form></div></div>
}

function ImportPanel({ accounts, categories, importHistory, onCompleted }: { accounts: Account[]; categories: Category[]; importHistory: ImportBatch[]; onCompleted: (result: ImportResult) => void }) {
  const activeAccounts = accounts.filter((account) => account.is_archived === 0)
  const activeExpenseCategories = categories.filter((category) => category.type === 'expense' && category.is_archived === 0)
  const activeIncomeCategories = categories.filter((category) => category.type === 'income' && category.is_archived === 0)
  const [source, setSource] = useState<ImportSource>('csv')
  const [accountId, setAccountId] = useState(String(activeAccounts[0]?.id ?? ''))
  const [incomeCategoryId, setIncomeCategoryId] = useState(String(activeIncomeCategories[0]?.id ?? ''))
  const [expenseCategoryId, setExpenseCategoryId] = useState(String(activeExpenseCategories[0]?.id ?? ''))
  const [fileName, setFileName] = useState('')
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true); setError('')
    try {
      const text = await file.text()
      const nextPreview = await window.easySpends.previewImport({ source, fileName: file.name, content: text, accountId: Number(accountId), defaultIncomeCategoryId: Number(incomeCategoryId), defaultExpenseCategoryId: Number(expenseCategoryId) })
      setFileName(file.name); setContent(text); setPreview(nextPreview)
    } catch (previewError) { setError(previewError instanceof Error ? previewError.message : '无法解析账单文件') } finally { setBusy(false) }
  }
  const runImport = async () => {
    if (!content || !fileName) return
    setBusy(true); setError('')
    try {
      const result = await window.easySpends.importTransactions({ source, fileName, content, accountId: Number(accountId), defaultIncomeCategoryId: Number(incomeCategoryId), defaultExpenseCategoryId: Number(expenseCategoryId) })
      setPreview(result.preview); onCompleted(result)
    } catch (importError) { setError(importError instanceof Error ? importError.message : '导入账单失败') } finally { setBusy(false) }
  }
  return <section className="automation-section"><div className="automation-section-heading"><div><span className="card-kicker">STATEMENT IMPORT</span><h3>账单导入</h3><p>支持通用 CSV，以及微信支付/支付宝导出的 CSV 文本；无需登录第三方账户。</p></div></div><div className="import-controls"><label><span>账单来源</span><select value={source} onChange={(event) => { setSource(event.target.value as ImportSource); setPreview(null) }}><option value="csv">通用 CSV</option><option value="wechat">微信账单</option><option value="alipay">支付宝账单</option></select></label><label><span>导入到账户</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{activeAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label><label><span>默认支出分类</span><select value={expenseCategoryId} onChange={(event) => setExpenseCategoryId(event.target.value)}>{activeExpenseCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label><span>默认收入分类</span><select value={incomeCategoryId} onChange={(event) => setIncomeCategoryId(event.target.value)}>{activeIncomeCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div><label className="file-drop"><Upload size={21} /><strong>{fileName || '选择账单 CSV 文件'}</strong><span>{busy ? '正在解析…' : '支持日期、金额、收支类型、备注等常见表头'}</span><input type="file" accept=".csv,.txt" onChange={(event) => void chooseFile(event)} /></label>{error ? <div className="form-error">{error}</div> : null}{preview ? <><div className="import-summary"><span>可导入 <strong>{preview.valid_count}</strong></span><span>重复跳过 <strong>{preview.duplicate_count}</strong></span><span>格式错误 <strong>{preview.invalid_count}</strong></span><button className="primary-button" disabled={busy || preview.valid_count === 0} onClick={() => void runImport()}><Upload size={15} />确认导入</button></div><div className="import-preview-table"><div className="import-preview-head"><span>日期</span><span>类型</span><span>金额</span><span>备注</span><span>状态</span></div>{preview.rows.slice(0, 12).map((row) => <div className="import-preview-row" key={`${row.row_number}-${row.external_key}`}><span>{row.occurred_at || '—'}</span><span>{row.type === 'income' ? '收入' : '支出'}</span><span>{formatMoney(row.amount_cents)}</span><span>{row.note || row.category_name}</span><span className={`import-status ${row.status}`}>{row.status === 'ready' ? '待导入' : row.status === 'duplicate' ? '重复' : row.error_message || '格式错误'}</span></div>)}</div></> : null}<div className="import-history"><div className="automation-subheading"><h4>最近导入</h4><span>自动去重，原始批次保存在本地</span></div>{importHistory.length > 0 ? importHistory.slice(0, 5).map((batch) => <div className="import-history-row" key={batch.id}><FileText size={15} /><span>{batch.file_name}</span><small>{batch.source} · {batch.created_at.slice(0, 16)}</small><strong>{batch.imported_count}/{batch.row_count} 条</strong></div>) : <div className="category-empty">暂无导入记录</div>}</div></section>
}

function NotificationPanel({ settings, events, onSaved }: { settings: NotificationSettings | null; events: NotificationEvent[]; onSaved: (settings: NotificationSettings) => void }) {
  const [budgetEnabled, setBudgetEnabled] = useState(settings?.budget_enabled === 1)
  const [anomalyEnabled, setAnomalyEnabled] = useState(settings?.anomaly_enabled === 1)
  const [recurringEnabled, setRecurringEnabled] = useState(settings?.recurring_enabled === 1)
  const [amount, setAmount] = useState(settings ? String(settings.anomaly_amount_cents / 100) : '5000')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (settings) { setBudgetEnabled(settings.budget_enabled === 1); setAnomalyEnabled(settings.anomaly_enabled === 1); setRecurringEnabled(settings.recurring_enabled === 1); setAmount(String(settings.anomaly_amount_cents / 100)) } }, [settings])
  const save = async () => { setSaving(true); setError(''); try { const next = await window.easySpends.updateNotificationSettings({ budgetEnabled, anomalyEnabled, recurringEnabled, anomalyAmount: Number(amount) }); onSaved(next) } catch (saveError) { setError(saveError instanceof Error ? saveError.message : '保存通知设置失败') } finally { setSaving(false) } }
  return <section className="automation-section"><div className="automation-section-heading"><div><span className="card-kicker">MACOS NOTIFICATIONS</span><h3>本地桌面通知</h3><p>通知在本机生成，不上传财务数据；首次显示时由 macOS 管理通知权限。</p></div><Bell size={20} className="panel-muted-icon" /></div><div className="notification-settings"><label className="setting-toggle"><span><strong>预算超支提醒</strong><small>达到预算提醒线或超过上限时通知</small></span><input type="checkbox" checked={budgetEnabled} onChange={(event) => setBudgetEnabled(event.target.checked)} /></label><label className="setting-toggle"><span><strong>大额支出异常</strong><small>单笔支出达到阈值时通知</small></span><input type="checkbox" checked={anomalyEnabled} onChange={(event) => setAnomalyEnabled(event.target.checked)} /></label><label className="setting-toggle"><span><strong>周期记账完成</strong><small>自动生成周期流水后通知</small></span><input type="checkbox" checked={recurringEnabled} onChange={(event) => setRecurringEnabled(event.target.checked)} /></label><label className="notification-threshold"><span>大额支出阈值</span><div><b>¥</b><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} /></div></label><button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存通知设置'} <CheckCircle2 size={16} /></button>{error ? <div className="form-error">{error}</div> : null}</div><div className="notification-history"><div className="automation-subheading"><h4>最近通知</h4><span>相同事件会自动去重</span></div>{events.length > 0 ? events.slice(0, 8).map((event) => <div className="notification-history-row" key={event.id}><div className={`notification-event-icon ${event.event_type}`}><Bell size={14} /></div><div><strong>{event.title}</strong><span>{event.body}</span></div><small>{event.created_at.slice(0, 16)}</small></div>) : <div className="category-empty">暂无通知事件</div>}</div></section>
}
