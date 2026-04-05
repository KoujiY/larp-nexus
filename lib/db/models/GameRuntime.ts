import mongoose, { Schema, Document } from 'mongoose';

/**
 * Phase 10: Game Runtime Document
 * 遊戲進行中的狀態，完全複製 Game Schema + 額外欄位
 *
 * Runtime vs Snapshot:
 * - type: 'runtime' → 遊戲進行中的即時狀態
 * - type: 'snapshot' → 遊戲結束後的歷史快照
 */
export interface GameRuntimeDocument extends Document {
  // Phase 10: Runtime 專屬欄位
  _id: mongoose.Types.ObjectId; // Runtime 專屬 ID
  refId: mongoose.Types.ObjectId; // 指向 Baseline Game._id
  type: 'runtime' | 'snapshot'; // 類型標記

  // 以下欄位與 GameDocument 完全一致
  gmUserId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  gameCode: string; // Phase 10: 繼承自 Baseline
  isActive: boolean; // 通常為 true（Runtime 存在即代表遊戲進行中）

  // 公開資訊：使用 BackgroundBlock[] 統一結構
  publicInfo?: {
    blocks: Array<{
      type: 'title' | 'body';
      content: string;
    }>;
  };

  // Phase 7.6: 隨機對抗檢定設定
  randomContestMaxValue?: number;

  // 預設事件（Runtime，含執行狀態）
  presetEvents?: Array<{
    id: string;
    name: string;
    description?: string;
    showName?: boolean;
    actions: Array<{
      id: string;
      type: 'broadcast' | 'stat_change' | 'reveal_secret' | 'reveal_task';
      broadcastTargets?: 'all' | string[];
      broadcastTitle?: string;
      broadcastMessage?: string;
      statTargets?: 'all' | string[];
      statName?: string;
      statChangeTarget?: 'value' | 'maxValue';
      statChangeValue?: number;
      syncValue?: boolean;
      duration?: number;
      revealCharacterId?: string;
      revealTargetId?: string;
    }>;
    executedAt?: Date;
    executionCount: number;
    runtimeOnly?: boolean;
  }>;

  // Snapshot 專屬欄位（只有 type='snapshot' 時使用）
  snapshotName?: string; // 快照名稱
  snapshotCreatedAt?: Date; // 快照建立時間

  createdAt: Date; // Runtime 建立時間
  updatedAt: Date; // Runtime 最後更新時間
}

/**
 * Game Runtime Schema
 * 與 GameSchema 欄位定義一致，但加入 Runtime 專屬欄位
 */
const GameRuntimeSchema = new Schema<GameRuntimeDocument>(
  {
    // Phase 10: Runtime 專屬欄位
    refId: {
      type: Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
      // 單欄位索引由複合索引 { refId, type } 覆蓋
    },
    type: {
      type: String,
      enum: ['runtime', 'snapshot'],
      default: 'runtime',
      required: true,
      // 單欄位索引由複合索引 { refId, type } 和 { type, snapshotCreatedAt } 覆蓋
    },

    // 以下欄位與 GameSchema 完全一致（複製定義）
    gmUserId: {
      type: Schema.Types.ObjectId,
      ref: 'GMUser',
      required: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 100,
    },
    description: {
      type: String,
      default: '',
      maxlength: 500,
    },
    gameCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true, // Runtime 通常為 true
    },

    // 公開資訊：BackgroundBlock[] 統一結構
    publicInfo: {
      blocks: [
        {
          _id: false,
          type: {
            type: String,
            enum: ['title', 'body'],
            required: true,
          },
          content: {
            type: String,
            default: '',
          },
        },
      ],
    },

    // Phase 7.6: 隨機對抗檢定設定
    randomContestMaxValue: {
      type: Number,
      default: 100,
    },

    // 預設事件（Runtime，含執行狀態）
    presetEvents: [
      {
        _id: false,
        id: { type: String, required: true },
        name: { type: String, required: true, maxlength: 100 },
        description: { type: String, default: '', maxlength: 500 },
        showName: { type: Boolean, default: false },
        actions: [
          {
            _id: false,
            id: { type: String, required: true },
            type: {
              type: String,
              enum: ['broadcast', 'stat_change', 'reveal_secret', 'reveal_task'],
              required: true,
            },
            broadcastTargets: { type: Schema.Types.Mixed },
            broadcastTitle: { type: String },
            broadcastMessage: { type: String },
            statTargets: { type: Schema.Types.Mixed },
            statName: { type: String },
            statChangeTarget: { type: String, enum: ['value', 'maxValue'] },
            statChangeValue: { type: Number },
            syncValue: { type: Boolean },
            duration: { type: Number },
            revealCharacterId: { type: String },
            revealTargetId: { type: String },
          },
        ],
        executedAt: { type: Date },
        executionCount: { type: Number, default: 0 },
        runtimeOnly: { type: Boolean, default: false },
      },
    ],

    // Snapshot 專屬欄位
    snapshotName: {
      type: String,
    },
    snapshotCreatedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'game_runtime',
  }
);

// 建立索引
// 1. 複合索引：根據 refId 和 type 查詢（查詢特定遊戲的 runtime 或 snapshot）
GameRuntimeSchema.index({ refId: 1, type: 1 });

// 2. 單一索引：根據 gameCode 快速查詢（玩家訪問時使用）
GameRuntimeSchema.index({ gameCode: 1 });

// 3. 複合索引：查詢快照列表（按建立時間降序）
GameRuntimeSchema.index({ type: 1, snapshotCreatedAt: -1 });

// 防止重複註冊 Model
export default mongoose.models.GameRuntime ||
  mongoose.model<GameRuntimeDocument>('GameRuntime', GameRuntimeSchema);
