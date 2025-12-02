import mongoose, { Schema, Document } from 'mongoose';

/**
 * Phase 3 擴展版 Game Document
 * 包含 publicInfo（世界觀、前導故事、章節）
 */
export interface GameDocument extends Document {
  gmUserId: mongoose.Types.ObjectId;
  name: string;
  description: string;
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
    isActive: {
      type: Boolean,
      default: true,
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
  },
  {
    timestamps: true,
    collection: 'games',
  }
);

// 建立索引
GameSchema.index({ gmUserId: 1 });
GameSchema.index({ createdAt: -1 });

export default mongoose.models.Game || mongoose.model<GameDocument>('Game', GameSchema);

