import { useMemo, useState } from 'react'
import { ArrowLeftRight, CalendarDays, MoreHorizontal, Plus, ReceiptText, Search, Trash2 } from 'lucide-react'
import type { CashflowChartData, ChartPeriod, LedgerEntry, LedgerEntryType, Transaction } from '../../electron/preload'
import { formatMoney, formatDate } from '../format'

export function TransactionsView({ entries, chartData, chartPeriod, onChartPeriodChange, onNewTransaction, onNewTransfer, onDelete }: { entries: LedgerEntry[]; chartData: CashflowChartData | null; chartPeriod: ChartPeriod; onChartPeriodChange: (period: ChartPeriod) => Promise<void>; onNewTransaction: () => void; onNewTransfer: () => void; onDelete: (entry: LedgerEntry) => Promise<void> }) {
  const [filter, setFilter] = useState<LedgerEntryType | 'all'>('all')
  const [search, setSearch] = useState('')
  const visibleEntries = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return entries.filter((entry) => {
      if (filter !== 'all' && entry.entry_type !== filter) return false
      if (!keyword) return true
      return [entry.note, entry.category_name, entry.account_name, entry.from_account_name, entry.to_account_name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(keyword))
    })
  }, [entries, filter, search])
  const incomeCount = entries.filter((entry) => entry.entry_type === 'income').length
  const expenseCount = entries.filter((entry) => entry.entry_type === 'expense').length
  const transferCount = entries.filter((entry) => entry.entry_type === 'transfer').length

  return <div className="full-panel ledger-page"><div className="list-toolbar"><div><span className="card-kicker">LEDGER</span><h2>记账流水</h2><p>收入、支出和账户转账统一展示，数据默认保存在本地 SQLite 数据库中。</p></div><div className="ledger-actions"><button className="secondary-button" onClick={onNewTransfer}><ArrowLeftRight size={15} />转账</button><button className="primary-button" onClick={onNewTransaction}><Plus size={18} />记一笔</button></div></div><div className="ledger-stat-row"><span>共 <strong>{entries.length}</strong> 条流水</span><span className="income-text">收入 {incomeCount}</span><span className="expense-text">支出 {expenseCount}</span><span className="transfer-text">转账 {transferCount}</span></div>{chartData ? <CashflowChart data={chartData} period={chartPeriod} onPeriodChange={onChartPeriodChange} /> : null}<div className="ledger-filters"><label className="ledger-select"><span>类型</span><select value={filter} onChange={(event) => setFilter(event.target.value as LedgerEntryType | 'all')}><option value="all">全部流水</option><option value="income">收入</option><option value="expense">支出</option><option value="transfer">转账</option></select></label><label className="ledger-search"><Search size={16} /><input placeholder="搜索备注、分类或账户" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>{visibleEntries.length > 0 ? <LedgerList entries={visibleEntries} onDelete={onDelete} /> : entries.length > 0 ? <div className="ledger-empty">没有符合当前筛选条件的流水</div> : <EmptyState onNewTransaction={onNewTransaction} />}</div>
}

function CashflowChart({ data, period, onPeriodChange }: { data: CashflowChartData; period: ChartPeriod; onPeriodChange: (period: ChartPeriod) => Promise<void> }) {
  const maxValue = Math.max(1, ...data.points.flatMap((point) => [point.income_cents, point.expense_cents]))
  return <section className="cashflow-chart"><div className="cashflow-chart-heading"><div><span className="card-kicker">CASHFLOW TREND</span><h3>收支趋势</h3><p>{data.start_date} 至 {data.end_date} · 转账不计入收入/支出统计</p></div><div className="period-toggle"><button className={period === 'month' ? 'active' : ''} onClick={() => void onPeriodChange('month')}>按月</button><button className={period === 'week' ? 'active' : ''} onClick={() => void onPeriodChange('week')}>按周</button></div></div><div className="chart-legend"><span><i className="legend-dot income-fill" />收入</span><span><i className="legend-dot expense-fill" />支出</span></div><div className="chart-bars">{data.points.map((point) => <div className="chart-point" key={point.key} title={`${point.label}：收入 ${formatMoney(point.income_cents)}，支出 ${formatMoney(point.expense_cents)}`}><div className="chart-point-bars"><div className="chart-column income-fill" style={{ height: `${Math.max(point.income_cents > 0 ? 5 : 2, (point.income_cents / maxValue) * 100)}%` }} /><div className="chart-column expense-fill" style={{ height: `${Math.max(point.expense_cents > 0 ? 5 : 2, (point.expense_cents / maxValue) * 100)}%` }} /></div><span>{point.label}</span></div>)}</div><div className="chart-total-row"><span>统计收入 <strong className="income-text">{formatMoney(data.points.reduce((sum, point) => sum + point.income_cents, 0))}</strong></span><span>统计支出 <strong className="expense-text">{formatMoney(data.points.reduce((sum, point) => sum + point.expense_cents, 0))}</strong></span><span>统计结余 <strong className="balance-text">{formatMoney(data.points.reduce((sum, point) => sum + point.net_cents, 0))}</strong></span></div></section>
}

function LedgerList({ entries, onDelete }: { entries: LedgerEntry[]; onDelete: (entry: LedgerEntry) => Promise<void> }) {
  return <div className="ledger-list">{entries.map((entry) => { const isTransfer = entry.entry_type === 'transfer'; const title = isTransfer ? `${entry.from_account_name} → ${entry.to_account_name}` : entry.note || entry.category_name || '未命名流水'; const subtitle = isTransfer ? `${entry.note || '账户之间转账'} · 账户转账` : `${entry.category_name} · ${entry.account_name}`; const amountLabel = isTransfer ? formatMoney(entry.amount_cents) : `${entry.entry_type === 'income' ? '+' : '-'}${formatMoney(entry.amount_cents)}`; return <div className="ledger-row" key={`${entry.source}-${entry.id}`}><div className={`ledger-entry-icon ${entry.entry_type}`}>{isTransfer ? <ArrowLeftRight size={16} /> : <span>{entry.category_name?.slice(0, 1) || (entry.entry_type === 'income' ? '收' : '支')}</span>}</div><div className="ledger-entry-main"><strong>{title}</strong><span>{subtitle}</span></div><div className="ledger-entry-date"><CalendarDays size={13} />{formatDate(entry.occurred_at)}</div><strong className={`ledger-entry-amount ${entry.entry_type}`}>{amountLabel}</strong><button className="row-action" title={isTransfer ? '删除转账' : '删除流水'} onClick={() => void onDelete(entry)}><Trash2 size={15} /></button></div> })}</div>
}

export function TransactionList({ transactions, compact = false, onDelete }: { transactions: Transaction[]; compact?: boolean; onDelete?: (id: number) => Promise<void> }) {
  return <div className={`transaction-list ${compact ? 'compact' : ''}`}>{transactions.map((transaction) => <div className="transaction-row" key={transaction.id}><div className="transaction-category" style={{ backgroundColor: `${transaction.category_color}25`, color: transaction.category_color }}>{transaction.category_name.slice(0, 1)}</div><div className="transaction-main"><strong>{transaction.note || transaction.category_name}</strong><span>{transaction.category_name} · {transaction.account_name}</span></div><div className="transaction-date"><CalendarDays size={13} />{formatDate(transaction.occurred_at)}</div><strong className={`transaction-amount ${transaction.type}`}>{transaction.type === 'income' ? '+' : '-'}{formatMoney(transaction.amount_cents)}</strong>{onDelete ? <button className="row-action" title="删除记录" onClick={() => void onDelete(transaction.id)}><Trash2 size={15} /></button> : <button className="row-action"><MoreHorizontal size={16} /></button>}</div>)}</div>
}

export function EmptyState({ onNewTransaction }: { onNewTransaction: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><ReceiptText size={22} /></div><strong>还没有收支记录</strong><span>从第一笔记录开始，建立你的财务地图。</span><button className="ghost-button" onClick={onNewTransaction}>添加第一笔 <Plus size={15} /></button></div>
}
