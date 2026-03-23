import mongoose, { Schema, Document } from 'mongoose';
import type { CharacterDocumentBase } from '@/lib/db/types/character-document-base';
import { createBaseCharacterSchemaFields } from '@/lib/db/schemas/shared-schemas';

/**
 * Phase 10: Character Runtime Document
 * 角色遊戲中的狀態，完全複製 Character Schema + 額外欄位
 *
 * Runtime vs Snapshot:
 * - type: 'runtime' → 遊戲進行中的即時狀態
 * - type: 'snapshot' → 遊戲結束後的歷史快照
 *
 * 共用欄位定義請參閱 CharacterDocumentBase。
 */
export interface CharacterRuntimeDocument extends Document, CharacterDocumentBase {
  // Phase 10: Runtime 專屬欄位
  _id: mongoose.Types.ObjectId;
  refId: mongoose.Types.ObjectId; // 指向 Baseline Character._id
  type: 'runtime' | 'snapshot';

  // Snapshot 專屬欄位（只有 type='snapshot' 時使用）
  snapshotGameRuntimeId?: mongoose.Types.ObjectId;
}

const CharacterRuntimeSchema = new Schema<CharacterRuntimeDocument>(
  {
    // Phase 10: Runtime 專屬欄位
    refId: {
      type: Schema.Types.ObjectId,
      ref: 'Character',
      required: true,
      // 單欄位索引由複合索引 { refId, type } 覆蓋
    },
    type: {
      type: String,
      enum: ['runtime', 'snapshot'],
      default: 'runtime',
      required: true,
      // 單欄位索引由複合索引 { refId, type } 和 { gameId, type } 覆蓋
    },

    // 以下欄位與 CharacterSchema 完全一致（透過 createBaseCharacterSchemaFields 組合）
    ...createBaseCharacterSchemaFields(),

    // Snapshot 專屬欄位
    snapshotGameRuntimeId: {
      type: Schema.Types.ObjectId,
      ref: 'GameRuntime',
    },
  },
  {
    timestamps: true,
    collection: 'character_runtime',
    strict: true, // 嚴格模式：只保存 Schema 中定義的欄位
  }
);

// 建立索引
// 1. 複合索引：根據 refId 和 type 查詢（查詢特定角色的 runtime 或 snapshot）
CharacterRuntimeSchema.index({ refId: 1, type: 1 });

// 2. 複合索引：根據 gameId 和 type 查詢（查詢特定遊戲的所有 runtime/snapshot 角色）
CharacterRuntimeSchema.index({ gameId: 1, type: 1 });

// 3. 複合索引：Game Code + PIN 查詢（玩家訪問時使用）
CharacterRuntimeSchema.index({ gameId: 1, pin: 1 });

// Next.js Hot Reload / 多次 import 防護：若模型已存在則重用，避免 OverwriteModelError
export default mongoose.models.CharacterRuntime ||
  mongoose.model<CharacterRuntimeDocument>('CharacterRuntime', CharacterRuntimeSchema);
