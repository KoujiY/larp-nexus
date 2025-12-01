import mongoose, { Schema, Document } from 'mongoose';
import type { Game as IGame, Chapter } from '@/types';

export interface GameDocument extends Omit<IGame, '_id'>, Document {}

const ChapterSchema = new Schema<Chapter>(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const GameSchema = new Schema<GameDocument>(
  {
    gmId: {
      type: String,
      ref: 'GMUser',
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    coverImage: {
      type: String,
    },
    publicInfo: {
      intro: { type: String, default: '' },
      worldSetting: { type: String, default: '' },
      chapters: [ChapterSchema],
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'completed'],
      default: 'draft',
    },
  },
  {
    timestamps: true,
    collection: 'games',
  }
);

// 建立索引
GameSchema.index({ gmId: 1 });
GameSchema.index({ status: 1 });
GameSchema.index({ createdAt: -1 });

export default mongoose.models.Game || mongoose.model<GameDocument>('Game', GameSchema);

