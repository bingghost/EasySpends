import { BudgetsRepository } from '../database/repositories/budgets-repository'
import { NotificationsRepository } from '../database/repositories/notifications-repository'
import type { NotificationEvent, NotificationSettings, UpdateNotificationSettingsInput } from '../database/types'

export interface NotificationPublisher {
  publish(event: NotificationEvent): void
}

export class NotificationService {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly budgets: BudgetsRepository,
    private readonly publisher: NotificationPublisher
  ) {}

  getSettings() {
    return this.notifications.getSettings()
  }

  list(limit?: number) {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
    return this.notifications.list(normalizedLimit)
  }

  updateSettings(input: UpdateNotificationSettingsInput): NotificationSettings {
    if (input.anomalyAmount !== undefined && (!Number.isFinite(Number(input.anomalyAmount)) || Number(input.anomalyAmount) <= 0)) {
      throw new Error('异常金额阈值必须大于 0')
    }
    return this.notifications.updateSettings(input)
  }

  notifyBudget(month: string) {
    const settings = this.notifications.getSettings()
    if (!settings.budget_enabled) return
    const budgets = this.budgets.listByMonth(month)
    const exceeded = budgets.filter((budget) => budget.spent_cents > budget.limit_cents)
    const warning = budgets.filter((budget) => budget.spent_cents <= budget.limit_cents && budget.spent_cents >= budget.limit_cents * budget.alert_percent / 100)
    if (exceeded.length > 0) {
      const event = this.notifications.recordOnce('budget', `${month}:exceeded:${exceeded.map((item) => item.id).join(',')}`, '预算已超支', `${month} 有 ${exceeded.length} 个分类超出预算上限，请及时查看。`)
      if (event) this.publisher.publish(event)
    } else if (warning.length > 0) {
      const event = this.notifications.recordOnce('budget', `${month}:warning:${warning.map((item) => item.id).join(',')}`, '预算接近上限', `${month} 有 ${warning.length} 个分类达到预算提醒线。`)
      if (event) this.publisher.publish(event)
    }
  }

  notifyAnomaly(amountCents: number, type: 'income' | 'expense', occurredAt: string, reference: string, note = '') {
    const settings = this.notifications.getSettings()
    if (!settings.anomaly_enabled || type !== 'expense' || amountCents < settings.anomaly_amount_cents) return
    const event = this.notifications.recordOnce('anomaly', reference, '发现大额支出', `${occurredAt} 记录了一笔 ${amountCents / 100} 元的大额支出${note ? `：${note}` : ''}。`)
    if (event) this.publisher.publish(event)
  }

  notifyRecurring(runDate: string, count: number) {
    const settings = this.notifications.getSettings()
    if (!settings.recurring_enabled || count <= 0) return
    const event = this.notifications.recordOnce('recurring', runDate, '周期记账已执行', `今天自动生成了 ${count} 笔周期记账流水。`)
    if (event) this.publisher.publish(event)
  }
}
