import mongoose, { Schema, Document } from 'mongoose';
import type { CharacterDocumentBase } from '@/lib/db/types/character-document-base';
import { createBaseCharacterSchemaFields, autoRevealConditionSchema } from '@/lib/db/schemas/shared-schemas';

/**
 * Phase 5 擴展版 Character Document
 * 包含 publicInfo（Phase 3）
 * 包含 secretInfo（Phase 3.5）
 * 包含 stats（Phase 4）
 * 包含 tasks、items 擴展（Phase 4.5）
 * 包含 skills（Phase 5）
 *
 * 共用欄位定義請參閱 CharacterDocumentBase。
 */
export interface CharacterDocument extends Document, CharacterDocumentBase {}

// autoRevealConditionSchema 已從 shared-schemas 匯出。
// 若其他檔案需要參照，請直接從 shared-schemas 匯入。
export { autoRevealConditionSchema };

const CharacterSchema = new Schema<CharacterDocument>(
  {
    ...createBaseCharacterSchemaFields(),
  },
  {
    timestamps: true,
    collection: 'characters',
    strict: true, // 嚴格模式：只保存 Schema 中定義的欄位
  }
);

// 建立索引
CharacterSchema.index({ gameId: 1 });

// Phase 10: 複合索引 - 同一 Game 內 PIN 唯一
CharacterSchema.index(
  { gameId: 1, pin: 1 },
  {
    unique: true,
    sparse: true, // 允許 pin 為 null（無 PIN 鎖的角色）
    partialFilterExpression: {
      // 只對有 PIN 的角色建立唯一性約束（排除 null 和空字串）
      $and: [
        { pin: { $exists: true } },
        { pin: { $ne: null } },
        { pin: { $ne: '' } },
      ],
    },
  }
);

export default mongoose.models.Character || mongoose.model<CharacterDocument>('Character', CharacterSchema);
