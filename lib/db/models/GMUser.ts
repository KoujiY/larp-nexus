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
  },
  {
    timestamps: true,
    collection: 'gm_users',
  }
);

// 建立索引
GMUserSchema.index({ email: 1 });

export default mongoose.models.GMUser || mongoose.model<GMUserDocument>('GMUser', GMUserSchema);

