import mongoose, { Schema, Document } from 'mongoose';

/**
 * Phase 10: Log Document
 * 記錄遊戲中的所有操作
 *
 * 常見 action 類型：
 * - game_start: 遊戲開始
 * - game_end: 遊戲結束
 * - stat_change: 數值變更
 * - item_use: 使用道具
 * - skill_use: 使用技能
 * - contest_result: 對抗檢定結果
 * - secret_reveal: 秘密揭露
 * - task_complete: 任務完成
 * - gm_update: GM 手動修改
 */
export interface LogDocument extends Document {
  _id: mongoose.Types.ObjectId;
  timestamp: Date; // 操作時間
  gameId: mongoose.Types.ObjectId; // 所屬遊戲
  characterId?: mongoose.Types.ObjectId; // 相關角色（可選）

  actorType: 'gm' | 'system' | 'character'; // 操作者類型
  actorId: string; // 操作者 ID（GM User ID / 'system' / Character ID）

  action: string; // 操作類型（如：'game_start', 'stat_change', 'item_use'）

  /**
   * 操作詳細資訊（彈性設計）
   * 不同 action 類型有不同的 details 結構
   *
   * 範例：
   * - game_start: { gameName: string, characterCount: number }
   * - stat_change: { statName: string, oldValue: number, newValue: number, changeValue: number, reason: string }
   * - item_use: { itemId: string, itemName: string, targetCharacterId?: string, effects: unknown[] }
   */
  details: Record<string, unknown>;
}

/**
 * Log Schema
 * 使用彈性的 details 欄位，方便未來擴展
 */
const LogSchema = new Schema<LogDocument>(
  {
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true, // 單一索引：方便按時間查詢
    },
    gameId: {
      type: Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
      index: true, // 單一索引：方便按遊戲查詢
    },
    characterId: {
      type: Schema.Types.ObjectId,
      ref: 'Character',
      index: true, // 單一索引：方便按角色查詢
    },
    actorType: {
      type: String,
      enum: ['gm', 'system', 'character'],
      required: true,
    },
    actorId: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      index: true, // 單一索引：方便按操作類型查詢
    },
    details: {
      type: Schema.Types.Mixed, // 彈性欄位：支援任意結構
      default: {},
    },
  },
  {
    timestamps: false, // 使用自訂 timestamp 欄位，不需要 createdAt/updatedAt
    collection: 'logs',
  }
);

// 建立複合索引
// 1. 按遊戲查詢日誌（按時間降序）
LogSchema.index({ gameId: 1, timestamp: -1 });

// 2. 按角色查詢日誌（按時間降序）
LogSchema.index({ characterId: 1, timestamp: -1 });

// 3. 按操作類型和遊戲查詢（方便統計分析）
LogSchema.index({ gameId: 1, action: 1, timestamp: -1 });

// 防止重複註冊 Model
export default mongoose.models.Log ||
  mongoose.model<LogDocument>('Log', LogSchema);
