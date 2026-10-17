import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowDownRight, ArrowUpRight, CheckCircle2, X } from 'lucide-react'
import type { Account, Category, TransactionType } from '../../electron/preload'

export function NewTransactionModal({ categories, accounts, onClose, onCreated }: { categories: Category[]; accounts: Account[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const activeAccounts = useMemo(() => accounts.filter((account) => account.is_archived === 0), [accounts])
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(String(activeAccounts[0]?.id ?? ''))
  const [categoryId, setCategoryId] = useState('')
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filteredCategories = useMemo(() => categories.filter((category) => category.is_archived === 0 && category.type === type), [categories, type])
  useEffect(() => {
    if (!filteredCategories.some((category) => String(category.id) === categoryId)) setCategoryId(String(filteredCategories[0]?.id ?? ''))
    if (!activeAccounts.some((account) => String(account.id) === accountId)) setAccountId(String(activeAccounts[0]?.id ?? ''))
  }, [filteredCategories, categoryId, activeAccounts, accountId])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!Number(amount) || Number(amount) <= 0) {
      setError('请输入大于 0 的金额')
      return
    }
    if (!accountId || !categoryId) {
      setError('请选择账户和分类')
      return
    }
    setSaving(true)
    setError('')
    try {
      await window.easySpends.createTransaction({ type, amount: Number(amount), accountId: Number(accountId), categoryId: Number(categoryId), occurredAt, note })
      await onCreated()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : '保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="modal-card"><div className="modal-header"><div><span className="card-kicker">NEW TRANSACTION</span><h2>记录一笔收支</h2><p>所有数据只保存到你的本地数据库。</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit}><div className="type-toggle"><button type="button" className={type === 'expense' ? 'active expense-tab' : ''} onClick={() => setType('expense')}><ArrowDownRight size={16} />支出</button><button type="button" className={type === 'income' ? 'active income-tab' : ''} onClick={() => setType('income')}><ArrowUpRight size={16} />收入</button></div><label className="amount-field"><span>金额</span><div><b>¥</b><input autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} /></div></label><div className="form-grid"><label><span>分类</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{filteredCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label><span>账户</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{activeAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label></div><div className="form-grid"><label><span>日期</span><input type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label><label><span>备注</span><input placeholder="例如：午餐、房租、工资" value={note} onChange={(event) => setNote(event.target.value)} /></label></div>{error ? <div className="form-error">{error}</div> : null}<div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={saving}>{saving ? '保存中…' : '保存记录'} <CheckCircle2 size={17} /></button></div></form></div></div>
}
