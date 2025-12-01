import mongoose, { Schema, Document } from 'mongoose';

/**
 * Phase 2 簡化版 Game Document
 * Phase 3/4 將擴展為完整版本（含 publicInfo, chapters 等）
 */
export interface GameDocument extends Document {
  gmUserId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  isActive: boolean;
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

