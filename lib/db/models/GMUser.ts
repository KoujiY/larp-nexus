import mongoose, { Schema, Document } from 'mongoose';
import type { GMUser as IGMUser } from '@/types';

export interface GMUserDocument extends Omit<IGMUser, '_id'>, Document {}

const GMUserSchema = new Schema<GMUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      maxlength: 50,
    },
    avatarUrl: {
      type: String,
    },
  },
  {
    timestamps: true,
    collection: 'gm_users',
  }
);

// 索引已在 schema 定義中設定（email: unique: true 會自動建立索引）

export default mongoose.models.GMUser || mongoose.model<GMUserDocument>('GMUser', GMUserSchema);

