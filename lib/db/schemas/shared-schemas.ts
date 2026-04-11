/**
 * 多個 Mongoose 模型共用的子 Schema 正規定義
 *
 * autoRevealConditionSchema 在 Character 與 CharacterRuntime 兩個模型中
 * 有完全相同的定義，現統一集中於此。
 *
 * 注意：Mongoose 的 Sub-Schema（new Schema()）實例可安全地在多個
 * 父 Schema 中共用（官方文件確認）。
 */

import { Schema } from 'mongoose';

/**
 * Phase 7.7: 自動揭露條件子文檔 Schema
 *
 * 使用顯式 new Schema() 定義，避免 Mongoose 將 inline object 中的
 * `type` 關鍵字誤判為 SchemaType 定義，導致 itemIds、secretIds、matchLogic
 * 等欄位被當作 schema options 而非子文檔欄位。
 */
export const autoRevealConditionSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['none', 'items_viewed', 'items_acquired', 'secrets_revealed'],
      default: 'none',
    },
    itemIds: [{ type: String }],
    secretIds: [{ type: String }],
    matchLogic: {
      type: String,
      enum: ['and', 'or'],
      default: 'and',
    },
  },
  { _id: false }
);

// ─── 子欄位工廠函式（模組私有）────────────────────────────────────────────────

/** Phase 3.5: 隱藏資訊欄位定義 */
function createSecretInfoSchemaField() {
  return {
    type: {
      secrets: [
        {
          _id: false,
          id: { type: String, required: true },
          title: { type: String, required: true },
          content: { type: Schema.Types.Mixed, default: [''] },
          isRevealed: { type: Boolean, default: false },
          revealCondition: { type: String, default: '' },
          autoRevealCondition: { type: autoRevealConditionSchema, default: undefined },
          revealedAt: { type: Date },
        },
      ],
    },
    default: { secrets: [] },
  };
}

/** Phase 4.5: 任務欄位定義 */
function createTasksSchemaField() {
  return [
    {
      _id: false,
      id: { type: String, required: true },
      title: { type: String, required: true },
      description: { type: String, default: '' },
      isHidden: { type: Boolean, default: false },
      isRevealed: { type: Boolean, default: false },
      revealedAt: { type: Date },
      status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed', 'failed'],
        default: 'pending',
      },
      completedAt: { type: Date },
      revealCondition: { type: String, default: '' },
      autoRevealCondition: { type: autoRevealConditionSchema, default: undefined },
      createdAt: { type: Date, default: Date.now },
    },
  ];
}

/** Phase 4.5: 道具欄位定義 */
function createItemsSchemaField() {
  return [
    {
      _id: false,
      id: { type: String, required: true },
      name: { type: String, required: true },
      description: { type: String, default: '' },
      imageUrl: { type: String },
      type: {
        type: String,
        enum: ['consumable', 'tool', 'equipment'],
        default: 'consumable',
      },
      quantity: { type: Number, default: 1 },
      effects: [
        {
          _id: false,
          type: {
            type: String,
            enum: ['stat_change', 'custom', 'item_take', 'item_steal'],
            required: true,
          },
          targetType: { type: String, enum: ['self', 'other', 'any'] },
          requiresTarget: Boolean,
          targetStat: String,
          value: Number,
          statChangeTarget: { type: String, enum: ['value', 'maxValue'] },
          syncValue: Boolean,
          targetItemId: String,
          duration: Number,
          description: String,
        },
      ],
      tags: [String],
      checkType: {
        type: String,
        enum: ['none', 'contest', 'random', 'random_contest'],
        default: 'none',
      },
      contestConfig: {
        relatedStat: String,
        opponentMaxItems: Number,
        opponentMaxSkills: Number,
        tieResolution: {
          type: String,
          enum: ['attacker_wins', 'defender_wins', 'both_fail'],
          default: 'attacker_wins',
        },
      },
      randomConfig: {
        maxValue: { type: Number, default: 100 },
        threshold: Number,
      },
      usageLimit: { type: Number },
      usageCount: { type: Number, default: 0 },
      cooldown: { type: Number },
      lastUsedAt: { type: Date },
      isTransferable: { type: Boolean, default: true },
      acquiredAt: { type: Date, default: Date.now },
      // 裝備系統（僅 type === 'equipment'）
      equipped: { type: Boolean, default: false },
      statBoosts: [
        {
          _id: false,
          statName: { type: String, required: true },
          value: { type: Number, required: true },
          target: { type: String, enum: ['value', 'maxValue', 'both'], default: 'value' },
        },
      ],
    },
  ];
}

/** Phase 4: 數值欄位定義 */
function createStatsSchemaField() {
  return [
    {
      _id: false,
      id: { type: String, required: true },
      name: { type: String, required: true },
      value: { type: Number, required: true, default: 0 },
      maxValue: { type: Number },
    },
  ];
}

/** Phase 5: 技能欄位定義 */
function createSkillsSchemaField() {
  return [
    {
      _id: false,
      id: { type: String, required: true },
      name: { type: String, required: true },
      description: { type: String, default: '' },
      imageUrl: { type: String },
      tags: { type: [String], default: [] },
      checkType: {
        type: String,
        enum: ['none', 'contest', 'random', 'random_contest'],
        default: 'none',
      },
      contestConfig: {
        relatedStat: String,
        opponentMaxItems: Number,
        opponentMaxSkills: Number,
        tieResolution: {
          type: String,
          enum: ['attacker_wins', 'defender_wins', 'both_fail'],
          default: 'attacker_wins',
        },
      },
      randomConfig: {
        maxValue: { type: Number, default: 100 },
        threshold: Number,
      },
      usageLimit: { type: Number },
      usageCount: { type: Number, default: 0 },
      cooldown: { type: Number },
      lastUsedAt: { type: Date },
      effects: [
        {
          _id: false,
          type: {
            type: String,
            enum: [
              'stat_change', 'item_take', 'item_steal',
              'task_reveal', 'task_complete', 'custom',
            ],
            required: true,
          },
          targetType: { type: String, enum: ['self', 'other', 'any'] },
          requiresTarget: Boolean,
          targetStat: String,
          value: Number,
          statChangeTarget: { type: String, enum: ['value', 'maxValue'] },
          syncValue: Boolean,
          duration: Number,
          targetItemId: String,
          targetTaskId: String,
          description: String,
        },
      ],
    },
  ];
}

/** Phase 8: 時效性效果欄位定義 */
function createTemporaryEffectsSchemaField() {
  return [
    {
      _id: false,
      id: { type: String, required: true },
      sourceType: { type: String, enum: ['skill', 'item', 'preset_event'], required: true },
      sourceId: { type: String, required: true },
      sourceCharacterId: { type: String, required: true },
      sourceCharacterName: { type: String, required: true },
      sourceName: { type: String, required: true },
      effectType: { type: String, enum: ['stat_change'], default: 'stat_change' },
      targetStat: { type: String, required: true },
      deltaValue: { type: Number },
      deltaMax: { type: Number },
      statChangeTarget: { type: String, enum: ['value', 'maxValue'], default: 'value' },
      syncValue: { type: Boolean },
      duration: { type: Number, required: true },
      appliedAt: { type: Date, required: true },
      expiresAt: { type: Date, required: true },
      isExpired: { type: Boolean, default: false },
    },
  ];
}

// ─── 主要匯出函式 ─────────────────────────────────────────────────────────────

/**
 * Character / CharacterRuntime 兩個模型共用的 Mongoose Schema 欄位定義
 *
 * **重要**：以函式形式定義的原因 —
 * Mongoose 在 new Schema() 時會對傳入的物件進行 mutate。
 * 若將同一個常數物件傳給兩個模型，第二個模型可能出現非預期行為。
 * 以函式形式確保每次呼叫都取得獨立的物件。
 *
 * 複雜子文檔欄位已拆分至模組私有的 createXxxSchemaField() 子函式。
 *
 * 使用方式：
 *   const CharacterSchema = new Schema({ ...createBaseCharacterSchemaFields() }, options);
 */
export function createBaseCharacterSchemaFields() {
  return {
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
    name: { type: String, required: true, maxlength: 100 },
    description: { type: String, default: '' },
    slogan: { type: String, default: '' },
    imageUrl: { type: String },
    hasPinLock: { type: Boolean, default: false },
    pin: { type: String },
    // Phase 3: 公開資訊
    publicInfo: {
      background: { type: Schema.Types.Mixed, default: [] },
      personality: { type: String, default: '' },
      relationships: [{ _id: false, targetName: String, description: String }],
    },
    secretInfo: createSecretInfoSchemaField(),   // Phase 3.5: 隱藏資訊
    tasks: createTasksSchemaField(),              // Phase 4.5: 任務系統
    items: createItemsSchemaField(),              // Phase 4.5: 道具系統
    stats: createStatsSchemaField(),              // Phase 4: 數值系統
    skills: createSkillsSchemaField(),            // Phase 5: 技能系統
    // Phase 7.7: 角色已檢視的道具記錄
    viewedItems: [
      {
        _id: false,
        itemId: { type: String, required: true },
        sourceCharacterId: { type: String, required: true },
        viewedAt: { type: Date, default: Date.now },
      },
    ],
    temporaryEffects: createTemporaryEffectsSchemaField(), // Phase 8: 時效性效果
  };
}
