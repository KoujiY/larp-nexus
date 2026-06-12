/**
 * Phase 11: 統一事件 ID 生成（跨通道去重）
 *
 * 同一個邏輯事件會同時透過 WebSocket 即時推送和寫入 Pending Events DB，
 * 客戶端透過 _eventId 識別重複事件並跳過。
 * 由 events.ts 與 contest-event-emitter.ts 共用。
 */

/**
 * 生成統一的事件 ID
 *
 * @returns 格式: `evt-{timestamp}-{random}`
 */
export function generateEventId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `evt-${timestamp}-${random}`;
}
