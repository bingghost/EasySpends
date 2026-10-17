import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronRight, CircleDollarSign, MoreHorizontal, Wallet, WalletCards } from 'lucide-react'
import type { Account, DashboardData } from '../../electron/preload'
import { formatMoney, monthLabel } from '../format'
import { EmptyState, TransactionList } from './transactions'

export function Overview({ dashboard, onNewTransaction, onViewTransactions }: { dashboard: DashboardData; onNewTransaction: () => void; onViewTransactions: () => void }) {
  const netPositive = dashboard.net_cents >= 0
  const expenseRatio = dashboard.income_cents > 0 ? Math.min((dashboard.expense_cents / dashboard.income_cents) * 100, 100) : 0
  const totalBalance = dashboard.accounts.reduce((sum, account) => sum + account.balance_cents, 0)

  return (
    <div className="content-grid">
      <section className="welcome-card">
        <div>
          <span className="card-kicker">{monthLabel(dashboard.month)} · 经营状态</span>
          <h2>让每一笔支出<br /><em>都服务于你的计划。</em></h2>
          <p>记录当下的选择，掌握长期的现金流。今天也保持清晰。</p>
          <button className="ghost-button" onClick={onNewTransaction}>添加一笔记录 <ChevronRight size={16} /></button>
        </div>
        <div className="welcome-illustration"><CircleDollarSign size={72} strokeWidth={1.3} /><div className="orbit orbit-one" /><div className="orbit orbit-two" /></div>
      </section>

      <section className="summary-row">
        <MetricCard label="本月收入" value={formatMoney(dashboard.income_cents)} note="相较上月 · 待接入趋势" tone="income" icon={<ArrowUpRight size={18} />} />
        <MetricCard label="本月支出" value={formatMoney(dashboard.expense_cents)} note={`${dashboard.transaction_count} 笔已记录`} tone="expense" icon={<ArrowDownRight size={18} />} />
        <MetricCard label="本月结余" value={formatMoney(dashboard.net_cents)} note={netPositive ? '保持正向现金流' : '需要关注现金流'} tone={netPositive ? 'balance' : 'expense'} icon={<Wallet size={18} />} />
      </section>

      <section className="panel cashflow-panel">
        <div className="panel-heading"><div><span className="card-kicker">CASHFLOW</span><h3>现金流概览</h3></div><button className="icon-button"><MoreHorizontal size={18} /></button></div>
        <div className="cashflow-content">
          <div className="cashflow-number"><span>当前总余额</span><strong>{formatMoney(totalBalance, true)}</strong><small><ArrowUpRight size={14} />累计净结余 {formatMoney(dashboard.all_time_net_cents, true)}</small></div>
          <div className="cashflow-bars">
            <div className="bar-group"><div className="bar-value income-text">{formatMoney(dashboard.income_cents, true)}</div><div className="bar-track"><div className="bar-fill income-fill" style={{ height: `${dashboard.income_cents > 0 ? 86 : 10}%` }} /></div><span>收入</span></div>
            <div className="bar-group"><div className="bar-value expense-text">{formatMoney(dashboard.expense_cents, true)}</div><div className="bar-track"><div className="bar-fill expense-fill" style={{ height: `${dashboard.expense_cents > 0 ? Math.max(expenseRatio, 16) : 10}%` }} /></div><span>支出</span></div>
            <div className="bar-group"><div className="bar-value balance-text">{formatMoney(dashboard.net_cents, true)}</div><div className="bar-track"><div className="bar-fill balance-fill" style={{ height: `${netPositive ? 62 : 26}%` }} /></div><span>结余</span></div>
          </div>
        </div>
      </section>

      <section className="panel accounts-panel">
        <div className="panel-heading"><div><span className="card-kicker">ACCOUNTS</span><h3>账户资产</h3></div><button className="text-button">管理账户 <ChevronRight size={15} /></button></div>
        <div className="account-list">
          {dashboard.accounts.map((account) => <AccountRow key={account.id} account={account} />)}
        </div>
      </section>

      <section className="panel transactions-panel">
        <div className="panel-heading"><div><span className="card-kicker">RECENT ACTIVITY</span><h3>最近收支</h3></div><button className="text-button" onClick={onViewTransactions}>查看全部 <ChevronRight size={15} /></button></div>
        {dashboard.recent_transactions.length > 0 ? <TransactionList transactions={dashboard.recent_transactions} compact /> : <EmptyState onNewTransaction={onNewTransaction} />}
      </section>
    </div>
  )
}

function MetricCard({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: string; icon: ReactNode }) {
  return <div className={`metric-card ${tone}`}><div className="metric-top"><span>{label}</span><div className="metric-icon">{icon}</div></div><strong>{value}</strong><small>{note}</small></div>
}

function AccountRow({ account }: { account: Account }) {
  const icon = account.type === 'bank' ? <WalletCards size={17} /> : <Wallet size={17} />
  return <div className="account-row"><div className="account-icon">{icon}</div><div className="account-info"><strong>{account.name}</strong><span>{account.currency} · 本地账户</span></div><strong className="account-balance">{formatMoney(account.balance_cents)}</strong></div>
}
