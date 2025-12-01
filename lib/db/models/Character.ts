import mongoose, { Schema, Document } from 'mongoose';
import type { Character as ICharacter, Task, Item, Relationship, Secret } from '@/types';

export interface CharacterDocument extends Omit<ICharacter, '_id'>, Document {}

const RelationshipSchema = new Schema<Relationship>(
  {
    targetName: { type: String, required: true },
    description: { type: String, required: true },
  },
  { _id: false }
);

const SecretSchema = new Schema<Secret>(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    revealedAt: { type: Date },
  },
  { _id: false }
);

const TaskSchema = new Schema<Task>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed'],
      default: 'pending',
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ItemSchema = new Schema<Item>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String },
    acquiredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CharacterSchema = new Schema<CharacterDocument>(
  {
    gameId: {
      type: String,
      ref: 'Game',
      required: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 50,
    },
    avatar: {
      type: String,
    },
    hasPinLock: {
      type: Boolean,
      default: false,
    },
    pinHash: {
      type: String,
    },
    publicInfo: {
      background: { type: String, default: '' },
      personality: { type: String, default: '' },
      relationships: [RelationshipSchema],
    },
    secretInfo: {
      isUnlocked: { type: Boolean, default: false },
      secrets: [SecretSchema],
      hiddenGoals: { type: String, default: '' },
    },
    tasks: [TaskSchema],
    items: [ItemSchema],
    wsChannelId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'characters',
  }
);

// 建立索引
CharacterSchema.index({ gameId: 1 });
CharacterSchema.index({ wsChannelId: 1 });

export default mongoose.models.Character || mongoose.model<CharacterDocument>('Character', CharacterSchema);

