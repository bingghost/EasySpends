import { useEffect, useState } from 'react'
import { BarChart3, CheckCircle2, FolderOpen, LayoutDashboard, Plus, ReceiptText, Repeat2, Settings2, ShieldCheck, Sparkles, Tags, Wallet, WalletCards } from 'lucide-react'
import type { Account, AssetAnalytics, BudgetSummary, Category, CashflowChartData, ChartPeriod, DashboardData, ImportBatch, ImportResult, LedgerEntry, NotificationEvent, NotificationSettings, RecurringRule, BackgroundSettings, SecurityStatus, Transaction, TransactionType, Transfer } from '../electron/preload'

import { Overview } from './features/overview'
import { TransactionsView } from './features/transactions'
import { AccountsView, AccountModal, TransferModal } from './features/accounts'
import type { AccountEditor } from './features/accounts'
import { CategoriesView, CategoryModal } from './features/categories'
import type { CategoryEditor } from './features/categories'
import { InsightsView } from './features/insights'
import { BudgetsView, BudgetModal } from './features/budgets'
import type { BudgetEditor } from './features/budgets'
import { AutomationView } from './features/automation'
import { SettingsView } from './features/settings'
import { NewTransactionModal } from './features/new-transaction'

type ViewKey = 'overview' | 'transactions' | 'accounts' | 'categories' | 'budgets' | 'insights' | 'automation' | 'settings'

const navItems: Array<{ key: ViewKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'overview', label: '总览', icon: LayoutDashboard },
  { key: 'transactions', label: '收支明细', icon: ReceiptText },
  { key: 'accounts', label: '账户管理', icon: Wallet },
  { key: 'categories', label: '收支分类', icon: Tags },
  { key: 'budgets', label: '预算规划', icon: WalletCards },
  { key: 'insights', label: '财务分析', icon: BarChart3 },
  { key: 'automation', label: '自动化中心', icon: Repeat2 }
]

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('overview')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('month')
  const [chartData, setChartData] = useState<CashflowChartData | null>(null)
  const [assetAnalytics, setAssetAnalytics] = useState<AssetAnalytics | null>(null)
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null)
  const [budgetMonth, setBudgetMonth] = useState('')
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([])
  const [importHistory, setImportHistory] = useState<ImportBatch[]>([])
  const [notificationEvents, setNotificationEvents] = useState<NotificationEvent[]>([])
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null)
  const [backgroundSettings, setBackgroundSettings] = useState<BackgroundSettings | null>(null)
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isTransactionModalOpen, setTransactionModalOpen] = useState(false)
  const [isTransferModalOpen, setTransferModalOpen] = useState(false)
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditor | null>(null)
  const [accountEditor, setAccountEditor] = useState<AccountEditor | null>(null)
  const [budgetEditor, setBudgetEditor] = useState<BudgetEditor | null>(null)
  const [showArchivedCategories, setShowArchivedCategories] = useState(false)
  const [showArchivedAccounts, setShowArchivedAccounts] = useState(false)
  const [isLoading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const refresh = async (includeArchived = showArchivedCategories) => {
    try {
      setLoadError('')
      const [nextDashboard, nextTransactions, nextLedgerEntries, nextTransfers, nextCategories, nextAccounts, nextChartData, nextAssetAnalytics, nextBudgetSummary, nextRecurringRules, nextImportHistory, nextNotificationSettings, nextNotificationEvents, nextBackgroundSettings, nextSecurityStatus] = await Promise.all([
        window.easySpends.getDashboard(),
        window.easySpends.getTransactions(100),
        window.easySpends.getLedgerEntries({ limit: 500 }),
        window.easySpends.getTransfers(100),
        window.easySpends.getCategories(undefined, true),
        window.easySpends.getAccounts(true),
        window.easySpends.getCashflowChart(chartPeriod),
        window.easySpends.getAssetAnalytics(),
        window.easySpends.getBudgets(budgetMonth || undefined),
        window.easySpends.getRecurringRules(true),
        window.easySpends.getImportHistory(20),
        window.easySpends.getNotificationSettings(),
        window.easySpends.getNotificationHistory(20),
        window.easySpends.getBackgroundSettings(),
        window.easySpends.getSecurityStatus()
      ])
      setDashboard(nextDashboard)
      setTransactions(nextTransactions)
      setLedgerEntries(nextLedgerEntries)
      setTransfers(nextTransfers)
      setChartData(nextChartData)
      setAssetAnalytics(nextAssetAnalytics)
      setBudgetSummary(nextBudgetSummary)
      setRecurringRules(nextRecurringRules)
      setImportHistory(nextImportHistory)
      setNotificationSettings(nextNotificationSettings)
      setNotificationEvents(nextNotificationEvents)
      setBackgroundSettings(nextBackgroundSettings)
      setSecurityStatus(nextSecurityStatus)
      if (!budgetMonth) setBudgetMonth(nextBudgetSummary.month)
      setCategories(nextCategories)
      setAccounts(nextAccounts)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '无法连接到本地数据层')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh(false)
  }, [])

  const openNewTransaction = () => setTransactionModalOpen(true)

  const handleCreated = async () => {
    setTransactionModalOpen(false)
    await refresh()
  }

  const handleDeleteLedgerEntry = async (entry: LedgerEntry) => {
    if (!window.confirm(entry.source === 'transfer' ? '确认删除这笔转账吗？两个账户的余额会同步恢复。' : '确认删除这笔记录吗？删除后无法自动恢复。')) return
    try {
      setLoadError('')
      if (entry.source === 'transfer') await window.easySpends.deleteTransfer(entry.id)
      else await window.easySpends.deleteTransaction(entry.id)
      await refresh()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '删除流水失败')
    }
  }

  const handleChartPeriodChange = async (period: ChartPeriod) => {
    setChartPeriod(period)
    try {
      setLoadError('')
      setChartData(await window.easySpends.getCashflowChart(period))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '加载图表失败')
    }
  }

  const handleBudgetMonthChange = async (month: string) => {
    setBudgetMonth(month)
    try {
      setLoadError('')
      setBudgetSummary(await window.easySpends.getBudgets(month))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '加载预算失败')
    }
  }

  const handleBudgetSaved = async (summary: BudgetSummary) => {
    setBudgetMonth(summary.month)
    setBudgetSummary(summary)
    setBudgetEditor(null)
  }

  const handleBudgetDelete = async (id: number) => {
    if (!window.confirm('确认删除这条预算吗？历史交易不会受到影响。')) return
    try {
      setLoadError('')
      const summary = await window.easySpends.deleteBudget(id)
      setBudgetMonth(summary.month)
      setBudgetSummary(summary)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '删除预算失败')
    }
  }

  const openCategoryEditor = (category?: Category, defaultType: TransactionType = 'expense') => {
    setCategoryEditor({ category, defaultType: category?.type ?? defaultType })
  }

  const refreshAfterCategoryChange = async () => {
    setCategoryEditor(null)
    await refresh(showArchivedCategories)
  }

  const toggleArchivedCategories = async () => {
    const nextValue = !showArchivedCategories
    setShowArchivedCategories(nextValue)
    await refresh(nextValue)
  }

  const handleArchiveCategory = async (id: number) => {
    if (!window.confirm('归档后该分类不会出现在新的记账表单中，但历史记录仍会保留。确认归档吗？')) return
    try {
      setLoadError('')
      await window.easySpends.archiveCategory(id)
      await refresh(showArchivedCategories)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '归档分类失败')
    }
  }

  const handleRestoreCategory = async (id: number) => {
    try {
      setLoadError('')
      await window.easySpends.restoreCategory(id)
      await refresh(true)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '恢复分类失败')
    }
  }

  const handleDeleteCategory = async (id: number) => {
    if (!window.confirm('删除分类后无法恢复。只有从未被交易使用的分类可以删除，已使用的分类应选择归档。确认删除吗？')) return
    try {
      setLoadError('')
      await window.easySpends.deleteCategory(id)
      await refresh(showArchivedCategories)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '删除分类失败')
    }
  }

  const openAccountEditor = (account?: Account) => setAccountEditor({ account })

  const refreshAfterAccountChange = async () => {
    setAccountEditor(null)
    await refresh(showArchivedCategories)
  }

  const toggleArchivedAccounts = async () => {
    const nextValue = !showArchivedAccounts
    setShowArchivedAccounts(nextValue)
    await refresh(nextValue)
  }

  const handleArchiveAccount = async (id: number) => {
    if (!window.confirm('归档后该账户不会出现在新的记账和转账表单中，但历史余额与记录仍会保留。确认归档吗？')) return
    try {
      setLoadError('')
      await window.easySpends.archiveAccount(id)
      await refresh(showArchivedAccounts)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '归档账户失败')
    }
  }

  const handleRestoreAccount = async (id: number) => {
    try {
      setLoadError('')
      await window.easySpends.restoreAccount(id)
      await refresh(true)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '恢复账户失败')
    }
  }

  const handleDeleteAccount = async (id: number) => {
    if (!window.confirm('只有没有任何收支、转账和期初余额的账户可以删除。已使用账户建议归档。确认删除吗？')) return
    try {
      setLoadError('')
      await window.easySpends.deleteAccount(id)
      await refresh(showArchivedAccounts)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '删除账户失败')
    }
  }

  const handleTransferCreated = async () => {
    setTransferModalOpen(false)
    await refresh(showArchivedAccounts)
  }

  const handleRecurringSaved = async () => {
    await refresh()
  }

  const handleRecurringDelete = async (id: number) => {
    if (!window.confirm('确认删除这条周期记账规则吗？已经生成的历史流水不会被删除。')) return
    try { await window.easySpends.deleteRecurringRule(id); await refresh() } catch (error) { setLoadError(error instanceof Error ? error.message : '删除周期规则失败') }
  }

  const handleRunRecurring = async () => {
    try { const results = await window.easySpends.runRecurringDue(); if (results.length === 0) setLoadError('当前没有到期的周期记账规则'); await refresh() } catch (error) { setLoadError(error instanceof Error ? error.message : '执行周期记账失败') }
  }

  const handleImportCompleted = async (_result: ImportResult) => {
    await refresh()
  }

  const handleNotificationSettingsSaved = (settings: NotificationSettings) => {
    setNotificationSettings(settings)
  }

  const handleBackgroundSettingsSaved = (settings: BackgroundSettings) => {
    setBackgroundSettings(settings)
  }

  const handleBackupRestored = async () => {
    await refresh()
  }

  if (isLoading) {
    return <div className="loading-screen"><div className="loading-mark">E</div><p>正在加载你的本地财务空间…</p></div>
  }

  const activeCategoryCount = categories.filter((category) => !category.is_archived).length
  const activeAccountCount = accounts.filter((account) => account.is_archived === 0).length

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">E</div>
          <div>
            <div className="brand-name">EasySpends</div>
            <div className="brand-caption">Personal Finance</div>
          </div>
        </div>

        <div className="workspace-pill">
          <div className="workspace-icon"><ShieldCheck size={16} /></div>
          <div>
            <span className="workspace-label">本地安全空间</span>
            <span className="workspace-subtitle">数据保存在这台 Mac 上</span>
          </div>
          <CheckCircle2 size={15} className="workspace-check" />
        </div>

        <div className="nav-section">
          <span className="section-label">工作台</span>
          <nav>
            {navItems.map(({ key, label, icon: Icon }) => (
              <button key={key} className={`nav-item ${activeView === key ? 'active' : ''}`} onClick={() => setActiveView(key)}>
                <Icon size={18} strokeWidth={activeView === key ? 2.2 : 1.8} />
                <span>{label}</span>
                {key === 'transactions' && transactions.length > 0 ? <span className="nav-count">{transactions.length}</span> : null}
                {key === 'accounts' && activeAccountCount > 0 ? <span className="nav-count">{activeAccountCount}</span> : null}
                {key === 'categories' && activeCategoryCount > 0 ? <span className="nav-count">{activeCategoryCount}</span> : null}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <div className="tip-icon"><Sparkles size={15} /></div>
            <div><strong>让每一笔钱更清晰</strong><span>先记录，再规划未来。</span></div>
          </div>
          <button className="nav-item secondary" onClick={() => void window.easySpends.openDataFolder()}>
            <FolderOpen size={18} />
            <span>打开数据目录</span>
          </button>
          <button className="nav-item secondary" onClick={() => setActiveView('settings')}>
            <Settings2 size={18} />
            <span>设置</span>
          </button>
          <div className="version-label">EasySpends 0.1.0 · macOS 优先</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">{activeView === 'overview' ? 'FINANCIAL OVERVIEW' : 'EASYSPENDS WORKSPACE'}</div>
            <h1>{activeView === 'overview' ? '你的财务总览' : activeView === 'settings' ? '应用设置' : navItems.find((item) => item.key === activeView)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <div className="local-status"><span className="status-dot" />本地模式</div>
            <button className="primary-button" onClick={openNewTransaction}><Plus size={18} />记一笔</button>
          </div>
        </header>

        {loadError ? <div className="error-banner">{loadError}</div> : null}

        {activeView === 'overview' && dashboard ? (
          <Overview dashboard={dashboard} onNewTransaction={openNewTransaction} onViewTransactions={() => setActiveView('transactions')} />
        ) : activeView === 'transactions' ? (
          <TransactionsView entries={ledgerEntries} chartData={chartData} chartPeriod={chartPeriod} onChartPeriodChange={handleChartPeriodChange} onNewTransaction={openNewTransaction} onNewTransfer={() => setTransferModalOpen(true)} onDelete={handleDeleteLedgerEntry} />
        ) : activeView === 'budgets' ? (
          <BudgetsView
            summary={budgetSummary}
            categories={categories}
            onMonthChange={handleBudgetMonthChange}
            onCreate={() => setBudgetEditor({})}
            onEdit={(budget) => setBudgetEditor({ budget })}
            onDelete={(id) => void handleBudgetDelete(id)}
          />
        ) : activeView === 'insights' ? (
          <InsightsView analytics={assetAnalytics} />
        ) : activeView === 'automation' ? (
          <AutomationView rules={recurringRules} importHistory={importHistory} notificationEvents={notificationEvents} notificationSettings={notificationSettings} accounts={accounts} categories={categories} onRecurringSaved={() => void handleRecurringSaved()} onRecurringDelete={(id) => void handleRecurringDelete(id)} onRunRecurring={() => void handleRunRecurring()} onImportCompleted={(result) => void handleImportCompleted(result)} onNotificationSettingsSaved={handleNotificationSettingsSaved} />
        ) : activeView === 'settings' ? (
          <SettingsView backgroundSettings={backgroundSettings} securityStatus={securityStatus} onBackgroundSaved={handleBackgroundSettingsSaved} onRestored={() => void handleBackupRestored()} />
        ) : activeView === 'accounts' ? (
          <AccountsView
            accounts={accounts}
            transfers={transfers}
            showArchived={showArchivedAccounts}
            onToggleArchived={() => void toggleArchivedAccounts()}
            onCreate={() => openAccountEditor()}
            onTransfer={() => setTransferModalOpen(true)}
            onEdit={(account) => openAccountEditor(account)}
            onArchive={(id) => void handleArchiveAccount(id)}
            onRestore={(id) => void handleRestoreAccount(id)}
            onDelete={(id) => void handleDeleteAccount(id)}
          />
        ) : activeView === 'categories' ? (
          <CategoriesView
            categories={categories}
            showArchived={showArchivedCategories}
            onToggleArchived={() => void toggleArchivedCategories()}
            onCreate={(type) => openCategoryEditor(undefined, type)}
            onEdit={(category) => openCategoryEditor(category)}
            onArchive={(id) => void handleArchiveCategory(id)}
            onRestore={(id) => void handleRestoreCategory(id)}
            onDelete={(id) => void handleDeleteCategory(id)}
          />
        ) : (
          <Overview dashboard={dashboard!} onNewTransaction={openNewTransaction} onViewTransactions={() => setActiveView('transactions')} />
        )}
      </main>

      {isTransactionModalOpen ? (
        <NewTransactionModal categories={categories} accounts={accounts} onClose={() => setTransactionModalOpen(false)} onCreated={handleCreated} />
      ) : null}
      {categoryEditor ? (
        <CategoryModal editor={categoryEditor} onClose={() => setCategoryEditor(null)} onSaved={refreshAfterCategoryChange} />
      ) : null}
      {accountEditor ? (
        <AccountModal editor={accountEditor} onClose={() => setAccountEditor(null)} onSaved={refreshAfterAccountChange} />
      ) : null}
      {isTransferModalOpen ? (
        <TransferModal accounts={accounts} onClose={() => setTransferModalOpen(false)} onCreated={handleTransferCreated} />
      ) : null}
      {budgetEditor ? (
        <BudgetModal editor={budgetEditor} month={budgetMonth || dashboard?.month || ''} categories={categories} onClose={() => setBudgetEditor(null)} onSaved={handleBudgetSaved} />
      ) : null}
    </div>
  )
}

export default App
