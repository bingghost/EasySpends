import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Archive, ArrowLeftRight, CheckCircle2, ChevronRight, CreditCard, Pencil, Plus, RotateCcw, Smartphone, Trash2, Wallet, X } from 'lucide-react'
import type { Account, AccountType, Transfer } from '../../electron/preload'
import { formatMoney, formatDate } from '../format'

export type AccountEditor = { account?: Account }

const accountTypeOptions: Array<{ value: AccountType; label: string }> = [
  { value: 'cash', label: '现金' },
  { value: 'bank', label: '银行卡' },
  { value: 'alipay', label: '支付宝' },
  { value: 'wechat', label: '微信' },
  { value: 'credit_card', label: '信用卡' },
  { value: 'investment', label: '投资账户' },
  { value: 'loan', label: '贷款账户' },
  { value: 'other', label: '其他账户' }
]

const accountTypeLabel = (type: AccountType) => accountTypeOptions.find((option) => option.value === type)?.label ?? '其他账户'

export function AccountsView({
  accounts,
  transfers,
  showArchived,
  onToggleArchived,
  onCreate,
  onTransfer,
  onEdit,
  onArchive,
  onRestore,
  onDelete
}: {
  accounts: Account[]
  transfers: Transfer[]
  showArchived: boolean
  onToggleArchived: () => void
  onCreate: () => void
  onTransfer: () => void
  onEdit: (account: Account) => void
  onArchive: (id: number) => void
  onRestore: (id: number) => void
  onDelete: (id: number) => void
}) {
  const visibleAccounts = showArchived ? accounts : accounts.filter((account) => account.is_archived === 0)
  const activeAccounts = accounts.filter((account) => account.is_archived === 0)
  const archivedCount = accounts.filter((account) => account.is_archived === 1).length
  const totalBalance = activeAccounts.reduce((sum, account) => sum + account.balance_cents, 0)

  return (
    <div className="full-panel accounts-page">
      <div className="list-toolbar account-toolbar">
        <div>
          <span className="card-kicker">ACCOUNTS</span>
          <h2>账户管理</h2>
          <p>集中管理现金、银行卡、支付宝、微信和其他资金账户。</p>
        </div>
        <div className="account-toolbar-actions">
          <button className="secondary-button" onClick={onToggleArchived}><Archive size={15} />{showArchived ? '隐藏已归档' : `已归档 ${archivedCount}`}</button>
          <button className="secondary-button" onClick={onTransfer} disabled={activeAccounts.length < 2}><ArrowLeftRight size={15} />账户转账</button>
          <button className="primary-button" onClick={onCreate}><Plus size={18} />新建账户</button>
        </div>
      </div>

      <div className="account-summary-grid">
        <div className="account-summary-card"><span>当前总余额</span><strong>{formatMoney(totalBalance, true)}</strong><small>{activeAccounts.length} 个启用账户</small></div>
        <div className="account-summary-card"><span>账户类型</span><strong>{new Set(activeAccounts.map((account) => account.type)).size}</strong><small>现金、银行卡及数字钱包</small></div>
        <div className="account-summary-card"><span>转账记录</span><strong>{transfers.length}</strong><small>最近 100 条本地记录</small></div>
      </div>

      <div className="account-section-heading"><div><span className="card-kicker">ACCOUNT LIST</span><h3>我的账户</h3></div><span>{visibleAccounts.length} 个账户</span></div>
      <div className="account-management-list">{visibleAccounts.length > 0 ? visibleAccounts.map((account) => <AccountManagementRow key={account.id} account={account} onEdit={onEdit} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} />) : <div className="category-empty">还没有账户，请先创建一个账户</div>}</div>

      <div className="account-section-heading transfer-section-heading"><div><span className="card-kicker">TRANSFER HISTORY</span><h3>最近转账</h3></div><button className="text-button" onClick={onTransfer} disabled={activeAccounts.length < 2}><Plus size={14} />发起转账</button></div>
      <div className="transfer-list">{transfers.length > 0 ? transfers.slice(0, 8).map((transfer) => <TransferRow key={transfer.id} transfer={transfer} />) : <div className="category-empty">还没有账户之间的转账记录</div>}</div>
    </div>
  )
}

function AccountIcon({ type }: { type: AccountType }) {
  if (type === 'bank' || type === 'credit_card') return <CreditCard size={18} />
  if (type === 'alipay' || type === 'wechat') return <Smartphone size={18} />
  return <Wallet size={18} />
}

function AccountManagementRow({ account, onEdit, onArchive, onRestore, onDelete }: { account: Account; onEdit: (account: Account) => void; onArchive: (id: number) => void; onRestore: (id: number) => void; onDelete: (id: number) => void }) {
  const archived = account.is_archived === 1
  return <div className={`account-management-row ${archived ? 'archived' : ''}`}><div className={`account-management-icon ${account.type}`}><AccountIcon type={account.type} /></div><div className="account-management-main"><strong>{account.name}</strong><span>{accountTypeLabel(account.type)} · {account.currency} · {archived ? '已归档' : '启用中'}</span></div><strong className="account-management-balance">{formatMoney(account.balance_cents)}</strong><div className="category-row-actions"><button className="row-action" title="编辑账户" onClick={() => onEdit(account)}><Pencil size={15} /></button>{archived ? <button className="row-action restore-action" title="恢复账户" onClick={() => onRestore(account.id)}><RotateCcw size={15} /></button> : <button className="row-action" title="归档账户" onClick={() => onArchive(account.id)}><Archive size={15} /></button>}<button className="row-action delete-action" title="删除账户" onClick={() => onDelete(account.id)}><Trash2 size={15} /></button></div></div>
}

function TransferRow({ transfer }: { transfer: Transfer }) {
  return <div className="transfer-row"><div className="transfer-icon"><ArrowLeftRight size={16} /></div><div className="transfer-main"><strong>{transfer.from_account_name} <ChevronRight size={13} /> {transfer.to_account_name}</strong><span>{transfer.note || '账户之间转账'} · {formatDate(transfer.occurred_at)}</span></div><strong className="transfer-amount">{formatMoney(transfer.amount_cents)}</strong></div>
}

export function AccountModal({ editor, onClose, onSaved }: { editor: AccountEditor; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(editor.account?.name ?? '')
  const [type, setType] = useState<AccountType>(editor.account?.type ?? 'cash')
  const [currency, setCurrency] = useState(editor.account?.currency ?? 'CNY')
  const [openingBalance, setOpeningBalance] = useState(editor.account ? '' : '0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEditing = Boolean(editor.account)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('请输入账户名称')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (editor.account) {
        await window.easySpends.updateAccount({ id: editor.account.id, name, type, currency })
      } else {
        await window.easySpends.createAccount({ name, type, currency, openingBalance: Number(openingBalance) || 0 })
      }
      await onSaved()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : '保存账户失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="modal-card account-modal"><div className="modal-header"><div><span className="card-kicker">ACCOUNT MANAGEMENT</span><h2>{isEditing ? '编辑账户' : '新建账户'}</h2><p>{isEditing ? '已有资金记录的账户不能修改类型和币种。' : '设置期初余额后即可开始记账。'}</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit}><div className="form-grid account-form-grid"><label><span>账户名称</span><input autoFocus maxLength={50} placeholder="例如：招商银行卡" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>账户类型</span><select value={type} onChange={(event) => setType(event.target.value as AccountType)}>{accountTypeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label></div><div className="form-grid account-form-grid"><label><span>币种</span><input maxLength={3} disabled={isEditing} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></label>{!isEditing ? <label><span>期初余额</span><input inputMode="decimal" placeholder="0.00" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value.replace(/[^0-9.]/g, ''))} /></label> : <div className="account-edit-hint"><Wallet size={16} />账户余额由期初余额、收支和转账记录自动计算</div>}</div>{error ? <div className="form-error">{error}</div> : null}<div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={saving}>{saving ? '保存中…' : isEditing ? '保存修改' : '创建账户'} <CheckCircle2 size={17} /></button></div></form></div></div>
}

export function TransferModal({ accounts, onClose, onCreated }: { accounts: Account[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const activeAccounts = useMemo(() => accounts.filter((account) => account.is_archived === 0), [accounts])
  const [fromAccountId, setFromAccountId] = useState(String(activeAccounts[0]?.id ?? ''))
  const [toAccountId, setToAccountId] = useState(String(activeAccounts[1]?.id ?? activeAccounts[0]?.id ?? ''))
  const [amount, setAmount] = useState('')
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activeAccounts.some((account) => String(account.id) === fromAccountId)) setFromAccountId(String(activeAccounts[0]?.id ?? ''))
    if (!activeAccounts.some((account) => String(account.id) === toAccountId) || toAccountId === fromAccountId) {
      setToAccountId(String(activeAccounts.find((account) => String(account.id) !== fromAccountId)?.id ?? ''))
    }
  }, [activeAccounts, fromAccountId, toAccountId])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (activeAccounts.length < 2) {
      setError('至少需要两个启用中的账户才能转账')
      return
    }
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      setError('请选择不同的转出账户和转入账户')
      return
    }
    if (!Number(amount) || Number(amount) <= 0) {
      setError('请输入大于 0 的转账金额')
      return
    }
    setSaving(true)
    setError('')
    try {
      await window.easySpends.createTransfer({ fromAccountId: Number(fromAccountId), toAccountId: Number(toAccountId), amount: Number(amount), occurredAt, note })
      await onCreated()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : '转账失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="modal-card transfer-modal"><div className="modal-header"><div><span className="card-kicker">ACCOUNT TRANSFER</span><h2>账户之间转账</h2><p>转账只改变账户余额，不会计入收入或支出。</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit}><div className="transfer-route"><label><span>转出账户</span><select value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)}>{activeAccounts.map((account) => <option value={account.id} key={account.id}>{account.name} · {formatMoney(account.balance_cents)}</option>)}</select></label><div className="transfer-route-icon"><ArrowLeftRight size={18} /></div><label><span>转入账户</span><select value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}>{activeAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label></div><label className="amount-field"><span>转账金额</span><div><b>¥</b><input autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} /></div></label><div className="form-grid"><label><span>日期</span><input type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label><label><span>备注</span><input maxLength={500} placeholder="例如：本月生活费" value={note} onChange={(event) => setNote(event.target.value)} /></label></div>{error ? <div className="form-error">{error}</div> : null}<div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={saving || activeAccounts.length < 2}>{saving ? '转账中…' : '确认转账'} <ArrowLeftRight size={17} /></button></div></form></div></div>
}
