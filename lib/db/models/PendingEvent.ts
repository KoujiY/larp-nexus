import mongoose, { Schema, Document } from 'mongoose';

/**
 * Phase 9: 離線事件佇列 Mongoose Document
 *
 * 儲存玩家離線時錯過的 WebSocket 事件，
 * 確保玩家重新上線後能接收到所有通知。
 */
export interface PendingEventDocument extends Document {
  /** 唯一識別碼 */
  id: string;

  /** 接收者角色 ID（character-level 事件） */
  targetCharacterId?: string;

  /** 接收劇本 ID（game-level 事件，如 game.broadcast） */
  targetGameId?: string;

  /** WebSocket 事件類型（如 'skill.contest', 'character.affected'） */
  eventType: string;

  /** 原始事件的 payload */
  eventPayload: Record<string, unknown>;

  /** 事件產生時間 */
  createdAt: Date;

  /** 是否已送達 */
  isDelivered: boolean;

  /** 送達時間 */
  deliveredAt?: Date;

  /** 過期時間（createdAt + 24h） */
  expiresAt: Date;
}

const pendingEventSchema = new Schema<PendingEventDocument>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    targetCharacterId: {
      type: String,
      index: true,
      required: false,
    },
    targetGameId: {
      type: String,
      index: true,
      required: false,
    },
    eventType: {
      type: String,
      required: true,
    },
    eventPayload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    isDelivered: {
      type: Boolean,
      default: false,
      index: true,
    },
    deliveredAt: {
      type: Date,
      required: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: false, // 使用自訂的 createdAt 而非 mongoose 自動生成
    collection: 'pending_events',
  }
);

/**
 * 複合索引：用於高效查詢未送達的事件
 *
 * 查詢模式：
 * 1. targetCharacterId + isDelivered + expiresAt（character-level 事件）
 * 2. targetGameId + isDelivered + expiresAt（game-level 事件）
 * 3. isDelivered + expiresAt（清理已送達或過期事件）
 */
pendingEventSchema.index({ targetCharacterId: 1, isDelivered: 1, expiresAt: 1 });
pendingEventSchema.index({ targetGameId: 1, isDelivered: 1, expiresAt: 1 });
pendingEventSchema.index({ isDelivered: 1, expiresAt: 1 });

/**
 * 導出 PendingEvent Model
 */
export const PendingEvent =
  mongoose.models.PendingEvent ||
  mongoose.model<PendingEventDocument>('PendingEvent', pendingEventSchema);

export default PendingEvent;
