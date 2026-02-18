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

  // Phase 3: 公開資訊（所有玩家可見）
  publicInfo?: {
    intro: string; // 前導故事
    worldSetting: string; // 世界觀
    chapters: Array<{
      title: string;
      content: string;
      order: number;
    }>;
  };

  // Phase 7.6: 隨機對抗檢定設定
  randomContestMaxValue?: number;

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
      index: true,
    },
    type: {
      type: String,
      enum: ['runtime', 'snapshot'],
      default: 'runtime',
      required: true,
      index: true,
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

    // Phase 3: 公開資訊
    publicInfo: {
      intro: {
        type: String,
        default: '',
      },
      worldSetting: {
        type: String,
        default: '',
      },
      chapters: [
        {
          _id: false, // 不為子文檔生成 _id
          title: {
            type: String,
            required: true,
          },
          content: {
            type: String,
            default: '',
          },
          order: {
            type: Number,
            required: true,
          },
        },
      ],
    },

    // Phase 7.6: 隨機對抗檢定設定
    randomContestMaxValue: {
      type: Number,
      default: 100,
    },

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
