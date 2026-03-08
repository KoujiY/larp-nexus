/**
 * Phase 7.7: 揭露事件發送器
 *
 * 統一管理自動揭露相關的 WebSocket 事件發送。
 * 底層委託給 lib/websocket/events.ts 的通用 trigger 函數。
 */
export {
  emitSecretRevealed,
  emitTaskRevealed,
  emitItemShowcased,
} from '@/lib/websocket/events';
