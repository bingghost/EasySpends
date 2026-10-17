import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, Pencil, Plus, Trash2, WalletCards, X } from 'lucide-react'
import type { Budget, BudgetSummary, Category } from '../../electron/preload'
import { formatMoney } from '../format'

export type BudgetEditor = { budget?: Budget }

export function BudgetsView({ summary, categories, onMonthChange, onCreate, onEdit, onDelete }: { summary: BudgetSummary | null; categories: Category[]; onMonthChange: (month: string) => Promise<void>; onCreate: () => void; onEdit: (budget: Budget) => void; onDelete: (id: number) => void }) {
  if (!summary) return <div className="placeholder-panel"><div className="placeholder-icon"><WalletCards size={28} /></div><h2>正在加载预算</h2></div>
  const expenseCategories = categories.filter((category) => category.type === 'expense' && category.is_archived === 0)
  const usageTone = summary.exceeded_count > 0 ? 'exceeded' : summary.warning_count > 0 ? 'warning' : 'normal'
  return <div className="full-panel budgets-page"><div className="list-toolbar"><div><span className="card-kicker">MONTHLY BUDGETS</span><h2>预算规划</h2><p>为每个支出分类设定月度预算上限，及时发现超支。</p></div><div className="budget-toolbar-actions"><label className="month-picker"><span>预算月份</span><input type="month" value={summary.month} onChange={(event) => void onMonthChange(event.target.value)} /></label><button className="primary-button" onClick={onCreate}><Plus size={18} />设置预算</button></div></div>{summary.reminder_message ? <div className={`budget-alert ${usageTone}`}><AlertTriangle size={18} /><div><strong>{summary.reminder_message}</strong><span>请检查相关分类的支出记录，必要时调整预算或延后非必要消费。</span></div></div> : null}<div className="budget-summary-grid"><div className="budget-summary-card"><span>本月预算</span><strong>{formatMoney(summary.total_limit_cents, true)}</strong><small>{summary.budget_count} 个分类已设置</small></div><div className="budget-summary-card"><span>已使用</span><strong className={usageTone}>{formatMoney(summary.total_spent_cents, true)}</strong><small>整体使用率 {summary.usage_percent}%</small></div><div className="budget-summary-card"><span>剩余可用</span><strong className={summary.total_remaining_cents < 0 ? 'exceeded' : ''}>{formatMoney(summary.total_remaining_cents, true)}</strong><small>{summary.exceeded_count} 个已超支 · {summary.warning_count} 个接近上限</small></div></div><div className="budget-list-heading"><div><span className="card-kicker">CATEGORY LIMITS</span><h3>分类预算</h3></div><span>{expenseCategories.length} 个可预算支出分类</span></div>{summary.items.length > 0 ? <div className="budget-list">{summary.items.map((budget) => <BudgetRow key={budget.id} budget={budget} onEdit={onEdit} onDelete={onDelete} />)}</div> : <div className="budget-empty"><div className="empty-icon"><WalletCards size={22} /></div><strong>还没有设置本月预算</strong><span>从餐饮、交通、购物等高频分类开始规划。</span><button className="ghost-button" onClick={onCreate}>设置第一条预算 <Plus size={15} /></button></div>}</div>
}

function BudgetRow({ budget, onEdit, onDelete }: { budget: Budget; onEdit: (budget: Budget) => void; onDelete: (id: number) => void }) {
  const width = Math.min(budget.usage_percent, 100)
  return <div className={`budget-row ${budget.status}`}><div className="budget-category-color" style={{ backgroundColor: budget.category_color }} /><div className="budget-row-main"><div className="budget-row-title"><strong>{budget.category_name}</strong><span>{budget.status === 'exceeded' ? '已超支' : budget.status === 'warning' ? `已达到 ${budget.alert_percent}% 提醒线` : '控制良好'}</span></div><div className="budget-progress"><div className={`budget-progress-fill ${budget.status}`} style={{ width: `${width}%` }} /></div><div className="budget-row-meta"><span>已用 {formatMoney(budget.spent_cents)} / {formatMoney(budget.limit_cents)}</span><strong>{budget.usage_percent}%</strong></div></div><div className="budget-remaining"><span>{budget.remaining_cents >= 0 ? '剩余' : '超出'}</span><strong>{formatMoney(Math.abs(budget.remaining_cents))}</strong></div><div className="category-row-actions"><button className="row-action" title="编辑预算" onClick={() => onEdit(budget)}><Pencil size={15} /></button><button className="row-action delete-action" title="删除预算" onClick={() => onDelete(budget.id)}><Trash2 size={15} /></button></div></div>
}

export function BudgetModal({ editor, month, categories, onClose, onSaved }: { editor: BudgetEditor; month: string; categories: Category[]; onClose: () => void; onSaved: (summary: BudgetSummary) => Promise<void> }) {
  const expenseCategories = categories.filter((category) => category.type === 'expense' && (category.is_archived === 0 || category.id === editor.budget?.category_id))
  const [categoryId, setCategoryId] = useState(String(editor.budget?.category_id ?? expenseCategories[0]?.id ?? ''))
  const [targetMonth, setTargetMonth] = useState(editor.budget?.month ?? month)
  const [limit, setLimit] = useState(editor.budget ? String(editor.budget.limit_cents / 100) : '')
  const [alertPercent, setAlertPercent] = useState(String(editor.budget?.alert_percent ?? 80))
  const [note, setNote] = useState(editor.budget?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEditing = Boolean(editor.budget)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!categoryId || !targetMonth || !Number(limit) || Number(limit) <= 0) { setError('请选择分类、月份并输入大于 0 的预算上限'); return }
    setSaving(true)
    setError('')
    try {
      const summary = await window.easySpends.saveBudget({ id: editor.budget?.id, categoryId: Number(categoryId), month: targetMonth, limit: Number(limit), alertPercent: Number(alertPercent), note })
      await onSaved(summary)
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : '保存预算失败，请稍后重试')
    } finally { setSaving(false) }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="modal-card budget-modal"><div className="modal-header"><div><span className="card-kicker">BUDGET PLANNING</span><h2>{isEditing ? '编辑分类预算' : '设置分类预算'}</h2><p>预算只统计对应月份、对应支出分类的消费。</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit}><div className="form-grid"><label><span>支出分类</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{expenseCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label><span>预算月份</span><input type="month" value={targetMonth} onChange={(event) => setTargetMonth(event.target.value)} /></label></div><label className="amount-field"><span>每月预算上限</span><div><b>¥</b><input autoFocus inputMode="decimal" placeholder="例如 3000" value={limit} onChange={(event) => setLimit(event.target.value.replace(/[^0-9.]/g, ''))} /></div></label><div className="form-grid"><label><span>提醒阈值</span><select value={alertPercent} onChange={(event) => setAlertPercent(event.target.value)}><option value="50">50% 使用时提醒</option><option value="70">70% 使用时提醒</option><option value="80">80% 使用时提醒</option><option value="90">90% 使用时提醒</option><option value="100">达到上限时提醒</option></select></label><label><span>备注</span><input maxLength={500} placeholder="例如：控制外卖频率" value={note} onChange={(event) => setNote(event.target.value)} /></label></div>{error ? <div className="form-error">{error}</div> : null}<div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={saving}>{saving ? '保存中…' : isEditing ? '保存修改' : '保存预算'} <CheckCircle2 size={17} /></button></div></form></div></div>
}
