import type Database from 'better-sqlite3'
import type { NotificationEvent, NotificationEventType, NotificationSettings, UpdateNotificationSettingsInput } from '../types'

export class NotificationsRepository {
  constructor(private readonly database: Database.Database) {}

  getSettings(): NotificationSettings {
    return this.database.prepare(`
      SELECT budget_enabled, anomaly_enabled, recurring_enabled, anomaly_amount_cents
      FROM notification_settings WHERE id = 1
    `).get() as NotificationSettings
  }

  updateSettings(input: UpdateNotificationSettingsInput) {
    const current = this.getSettings()
    const anomalyAmount = input.anomalyAmount === undefined ? current.anomaly_amount_cents : Math.round(input.anomalyAmount * 100)
    this.database.prepare(`
      UPDATE notification_settings
      SET budget_enabled = ?, anomaly_enabled = ?, recurring_enabled = ?, anomaly_amount_cents = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      input.budgetEnabled === undefined ? current.budget_enabled : input.budgetEnabled ? 1 : 0,
      input.anomalyEnabled === undefined ? current.anomaly_enabled : input.anomalyEnabled ? 1 : 0,
      input.recurringEnabled === undefined ? current.recurring_enabled : input.recurringEnabled ? 1 : 0,
      anomalyAmount
    )
    return this.getSettings()
  }

  recordOnce(eventType: NotificationEventType, dedupeKey: string, title: string, body: string): NotificationEvent | null {
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO notification_events (event_type, dedupe_key, title, body)
      VALUES (?, ?, ?, ?)
    `).run(eventType, dedupeKey, title, body)
    if (result.changes === 0) return null
    return this.database.prepare(`
      SELECT id, event_type, dedupe_key, title, body, created_at
      FROM notification_events WHERE id = ?
    `).get(Number(result.lastInsertRowid)) as NotificationEvent
  }

  list(limit = 50): NotificationEvent[] {
    return this.database.prepare(`
      SELECT id, event_type, dedupe_key, title, body, created_at
      FROM notification_events ORDER BY id DESC LIMIT ?
    `).all(limit) as NotificationEvent[]
  }
}
