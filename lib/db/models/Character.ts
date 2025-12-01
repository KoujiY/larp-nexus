import mongoose, { Schema, Document } from 'mongoose';

/**
 * Phase 2 簡化版 Character Document
 * Phase 3/4 將擴展為完整版本（含 publicInfo, secretInfo, tasks, items 等）
 */
export interface CharacterDocument extends Document {
  gameId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  imageUrl?: string;
  hasPinLock: boolean;
  pinHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CharacterSchema = new Schema<CharacterDocument>(
  {
    gameId: {
      type: Schema.Types.ObjectId,
      ref: 'Game',
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
    },
    imageUrl: {
      type: String,
    },
    hasPinLock: {
      type: Boolean,
      default: false,
    },
    pinHash: {
      type: String,
    },
  },
  {
    timestamps: true,
    collection: 'characters',
  }
);

// 建立索引
CharacterSchema.index({ gameId: 1 });

export default mongoose.models.Character || mongoose.model<CharacterDocument>('Character', CharacterSchema);

