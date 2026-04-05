import mongoose, { Schema, Document } from 'mongoose';

/**
 * Phase 3 擴展版 Game Document
 * publicInfo 使用 BackgroundBlock[] 結構（與角色背景一致）
 * Phase 10: 新增 gameCode（遊戲代碼）
 */
export interface GameDocument extends Document {
  gmUserId: mongoose.Types.ObjectId;
  name: string;
  description: string;

  // Phase 10: Game Code（玩家識別碼）
  gameCode: string; // 6 位英數字，全域唯一，例如：'ABC123'

  isActive: boolean;

  coverUrl?: string;

  // 公開資訊：使用 BackgroundBlock[] 統一結構
  publicInfo?: {
    blocks: Array<{
      type: 'title' | 'body';
      content: string;
    }>;
  };

  // Phase 7.6: 隨機對抗檢定設定
  randomContestMaxValue?: number; // 隨機對抗檢定的上限值（劇本共通，預設 100）

  // 預設事件（Baseline 定義，無執行狀態）
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
  }>;

  createdAt: Date;
  updatedAt: Date;
}

const GameSchema = new Schema<GameDocument>(
  {
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
    // Phase 10: Game Code
    gameCode: {
      type: String,
      required: true,
      unique: true, // 全域唯一
      uppercase: true, // 自動轉大寫
      trim: true, // 去除空白
      match: /^[A-Z0-9]{6}$/, // 6 位英數字
    },
    isActive: {
      type: Boolean,
      default: false, // Phase 10: 預設為待機狀態（false）
    },
    coverUrl: {
      type: String,
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
    // 預設事件（Baseline 定義）
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
            // broadcast
            broadcastTargets: { type: Schema.Types.Mixed }, // 'all' | string[]
            broadcastTitle: { type: String },
            broadcastMessage: { type: String },
            // stat_change
            statTargets: { type: Schema.Types.Mixed }, // 'all' | string[]
            statName: { type: String },
            statChangeTarget: { type: String, enum: ['value', 'maxValue'] },
            statChangeValue: { type: Number },
            syncValue: { type: Boolean },
            duration: { type: Number },
            // reveal_secret / reveal_task
            revealCharacterId: { type: String },
            revealTargetId: { type: String },
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
    collection: 'games',
  }
);

// 建立索引
GameSchema.index({ gmUserId: 1 });
GameSchema.index({ createdAt: -1 });

// Phase 10: gameCode 唯一索引已由 field-level `unique: true` 自動建立，無需重複宣告

export default mongoose.models.Game || mongoose.model<GameDocument>('Game', GameSchema);
