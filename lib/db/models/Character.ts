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
// 批 3 修復（PERF_INCIDENT_2026-06 5.2.2）：原宣告有兩個錯誤導致 createIndex
// 從未成功（且被 Mongoose 靜默吞掉）：
// 1. sparse 與 partialFilterExpression 互斥（MongoDB 拒絕並用）
// 2. partialFilterExpression 不支援 $ne 運算子
// 改以 { $type: 'string', $gt: '' } 表達「pin 為非空字串」——
// 同時排除 null（型別不符）與空字串（$gt: ''），語意與原意圖一致
CharacterSchema.index(
  { gameId: 1, pin: 1 },
  {
    unique: true,
    partialFilterExpression: {
      pin: { $type: 'string', $gt: '' },
    },
  }
);

export default mongoose.models.Character || mongoose.model<CharacterDocument>('Character', CharacterSchema);
