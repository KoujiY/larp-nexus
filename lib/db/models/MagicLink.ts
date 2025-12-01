import mongoose, { Schema, Document } from 'mongoose';
import type { MagicLink as IMagicLink } from '@/types';

export interface MagicLinkDocument extends Omit<IMagicLink, '_id'>, Document {}

const MagicLinkSchema = new Schema<MagicLinkDocument>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    used: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'magic_links',
  }
);

// 建立索引
MagicLinkSchema.index({ token: 1 }, { unique: true });
MagicLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL Index

export default mongoose.models.MagicLink || mongoose.model<MagicLinkDocument>('MagicLink', MagicLinkSchema);

