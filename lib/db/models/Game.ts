import mongoose, { Schema, Document } from 'mongoose';

/**
 * Phase 3 擴展版 Game Document
 * 包含 publicInfo（世界觀、前導故事、章節）
 * Phase 10: 新增 gameCode（遊戲代碼）
 */
export interface GameDocument extends Document {
  gmUserId: mongoose.Types.ObjectId;
  name: string;
  description: string;

  // Phase 10: Game Code（玩家識別碼）
  gameCode: string; // 6 位英數字，全域唯一，例如：'ABC123'

  isActive: boolean;
  
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
  randomContestMaxValue?: number; // 隨機對抗檢定的上限值（劇本共通，預設 100）
  
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
  },
  {
    timestamps: true,
    collection: 'games',
  }
);

// 建立索引
GameSchema.index({ gmUserId: 1 });
GameSchema.index({ createdAt: -1 });

// Phase 10: Game Code 唯一索引
GameSchema.index({ gameCode: 1 }, { unique: true });

export default mongoose.models.Game || mongoose.model<GameDocument>('Game', GameSchema);

