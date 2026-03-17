import mongoose, { Schema, Document } from 'mongoose';

/**
 * Phase 10: Character Runtime Document
 * 角色遊戲中的狀態，完全複製 Character Schema + 額外欄位
 *
 * Runtime vs Snapshot:
 * - type: 'runtime' → 遊戲進行中的即時狀態
 * - type: 'snapshot' → 遊戲結束後的歷史快照
 */
export interface CharacterRuntimeDocument extends Document {
  // Phase 10: Runtime 專屬欄位
  _id: mongoose.Types.ObjectId; // Runtime 專屬 ID
  refId: mongoose.Types.ObjectId; // 指向 Baseline Character._id
  type: 'runtime' | 'snapshot'; // 類型標記

  // 以下欄位與 CharacterDocument 完全一致
  gameId: mongoose.Types.ObjectId; // 繼承自 Baseline（用於查詢）
  name: string;
  description: string;
  imageUrl?: string;
  hasPinLock: boolean;
  pin?: string;

  // Phase 3: 公開資訊（PIN 解鎖後可見）
  publicInfo?: {
    background: string;
    personality: string;
    relationships: Array<{
      targetName: string;
      description: string;
    }>;
  };

  // Phase 3.5: 隱藏資訊（GM 控制揭露）
  secretInfo?: {
    secrets: Array<{
      id: string;
      title: string;
      content: string;
      isRevealed: boolean;
      revealCondition?: string;
      autoRevealCondition?: {
        type: 'none' | 'items_viewed' | 'items_acquired' | 'secrets_revealed';
        itemIds?: string[];
        secretIds?: string[];
        matchLogic?: 'and' | 'or';
      };
      revealedAt?: Date;
    }>;
  };

  // Phase 4.5: 任務系統（擴展版）
  tasks?: Array<{
    id: string;
    title: string;
    description: string;
    isHidden: boolean;
    isRevealed: boolean;
    revealedAt?: Date;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    completedAt?: Date;
    gmNotes?: string;
    revealCondition?: string;
    autoRevealCondition?: {
      type: 'none' | 'items_viewed' | 'items_acquired' | 'secrets_revealed';
      itemIds?: string[];
      secretIds?: string[];
      matchLogic?: 'and' | 'or';
    };
    createdAt: Date;
  }>;

  // Phase 4.5: 道具系統（擴展版）
  items?: Array<{
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    type: 'consumable' | 'equipment';
    quantity: number;
    effects?: Array<{
      type: 'stat_change' | 'custom' | 'item_take' | 'item_steal';
      targetType?: 'self' | 'other' | 'any';
      requiresTarget?: boolean;
      targetStat?: string;
      value?: number;
      statChangeTarget?: 'value' | 'maxValue';
      syncValue?: boolean;
      targetItemId?: string;
      duration?: number;
      description?: string;
    }>;
    tags?: string[];
    checkType?: 'none' | 'contest' | 'random' | 'random_contest';
    contestConfig?: {
      relatedStat: string;
      opponentMaxItems?: number;
      opponentMaxSkills?: number;
      tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
    };
    randomConfig?: {
      maxValue: number;
      threshold: number;
    };
    usageLimit?: number;
    usageCount?: number;
    cooldown?: number;
    lastUsedAt?: Date;
    isTransferable: boolean;
    acquiredAt: Date;
  }>;

  // Phase 4: 數值系統
  stats?: Array<{
    id: string;
    name: string;
    value: number;
    maxValue?: number;
  }>;

  // Phase 5: 技能系統
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    iconUrl?: string;
    tags?: string[];
    checkType: 'none' | 'contest' | 'random' | 'random_contest';
    contestConfig?: {
      relatedStat: string;
      opponentMaxItems?: number;
      opponentMaxSkills?: number;
      tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
    };
    randomConfig?: {
      maxValue: number;
      threshold: number;
    };
    usageLimit?: number;
    usageCount?: number;
    cooldown?: number;
    lastUsedAt?: Date;
    effects?: Array<{
      type: 'stat_change' | 'item_give' | 'item_take' | 'item_steal' |
            'task_reveal' | 'task_complete' | 'custom';
      targetStat?: string;
      value?: number;
      statChangeTarget?: 'value' | 'maxValue';
      syncValue?: boolean;
      duration?: number;
      targetItemId?: string;
      targetTaskId?: string;
      targetCharacterId?: string;
      description?: string;
    }>;
  }>;

  // Phase 7.7: 角色已檢視的道具記錄
  viewedItems?: Array<{
    itemId: string;
    sourceCharacterId: string;
    viewedAt: Date;
  }>;

  // Phase 8: 時效性效果記錄
  temporaryEffects?: Array<{
    id: string;
    sourceType: 'skill' | 'item';
    sourceId: string;
    sourceCharacterId: string;
    sourceCharacterName: string;
    sourceName: string;
    effectType: 'stat_change';
    targetStat: string;
    deltaValue?: number;
    deltaMax?: number;
    statChangeTarget: 'value' | 'maxValue';
    syncValue?: boolean;
    duration: number;
    appliedAt: Date;
    expiresAt: Date;
    isExpired: boolean;
  }>;

  // Snapshot 專屬欄位（只有 type='snapshot' 時使用）
  snapshotGameRuntimeId?: mongoose.Types.ObjectId; // 屬於哪個 Snapshot

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Character Runtime Schema
 * 與 CharacterSchema 欄位定義一致，但加入 Runtime 專屬欄位
 */
/**
 * Phase 7.7: 自動揭露條件子文檔 Schema
 *
 * 使用顯式 new Schema() 定義，避免 Mongoose 將 inline object 中的
 * `type` 關鍵字誤判為 SchemaType 定義，導致 itemIds、secretIds、matchLogic
 * 等欄位被當作 schema options 而非子文檔欄位。
 */
const autoRevealConditionSchema = new Schema(
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

    // 以下欄位與 CharacterSchema 完全一致（複製定義）
    gameId: {
      type: Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
      // 單欄位索引由複合索引 { gameId, type } 和 { gameId, pin } 覆蓋
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
    pin: {
      type: String,
    },

    // Phase 3: 公開資訊
    publicInfo: {
      background: {
        type: String,
        default: '',
      },
      personality: {
        type: String,
        default: '',
      },
      relationships: [
        {
          _id: false,
          targetName: String,
          description: String,
        },
      ],
    },

    // Phase 3.5: 隱藏資訊
    secretInfo: {
      type: {
        secrets: [
          {
            _id: false,
            id: {
              type: String,
              required: true,
            },
            title: {
              type: String,
              required: true,
            },
            content: {
              type: String,
              default: '',
            },
            isRevealed: {
              type: Boolean,
              default: false,
            },
            revealCondition: {
              type: String,
              default: '',
            },
            // Phase 7.7: 自動揭露條件（使用顯式 Schema 避免 type 關鍵字歧義）
            autoRevealCondition: {
              type: autoRevealConditionSchema,
              default: undefined,
            },
            revealedAt: {
              type: Date,
            },
          },
        ],
      },
      default: { secrets: [] },
    },

    // Phase 4.5: 任務系統（擴展版）
    tasks: [
      {
        _id: false,
        id: {
          type: String,
          required: true,
        },
        title: {
          type: String,
          required: true,
        },
        description: {
          type: String,
          default: '',
        },
        isHidden: {
          type: Boolean,
          default: false,
        },
        isRevealed: {
          type: Boolean,
          default: false,
        },
        revealedAt: {
          type: Date,
        },
        status: {
          type: String,
          enum: ['pending', 'in-progress', 'completed', 'failed'],
          default: 'pending',
        },
        completedAt: {
          type: Date,
        },
        gmNotes: {
          type: String,
          default: '',
        },
        revealCondition: {
          type: String,
          default: '',
        },
        // Phase 7.7: 自動揭露條件（使用顯式 Schema 避免 type 關鍵字歧義）
        autoRevealCondition: {
          type: autoRevealConditionSchema,
          default: undefined,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Phase 4.5: 道具系統（擴展版）
    items: [
      {
        _id: false,
        id: {
          type: String,
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        description: {
          type: String,
          default: '',
        },
        imageUrl: {
          type: String,
        },
        type: {
          type: String,
          enum: ['consumable', 'equipment'],
          default: 'consumable',
        },
        quantity: {
          type: Number,
          default: 1,
        },
        effects: [
          {
            _id: false,
            type: {
              type: String,
              enum: ['stat_change', 'custom', 'item_take', 'item_steal'],
              required: true,
            },
            targetType: {
              type: String,
              enum: ['self', 'other', 'any'],
            },
            requiresTarget: Boolean,
            targetStat: String,
            value: Number,
            statChangeTarget: {
              type: String,
              enum: ['value', 'maxValue'],
            },
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
          maxValue: {
            type: Number,
            default: 100,
          },
          threshold: Number,
        },
        usageLimit: {
          type: Number,
        },
        usageCount: {
          type: Number,
          default: 0,
        },
        cooldown: {
          type: Number,
        },
        lastUsedAt: {
          type: Date,
        },
        isTransferable: {
          type: Boolean,
          default: true,
        },
        acquiredAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Phase 4: 數值系統
    stats: [
      {
        _id: false,
        id: {
          type: String,
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        value: {
          type: Number,
          required: true,
          default: 0,
        },
        maxValue: {
          type: Number,
        },
      },
    ],

    // Phase 5: 技能系統
    skills: [
      {
        _id: false,
        id: {
          type: String,
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        description: {
          type: String,
          default: '',
        },
        iconUrl: {
          type: String,
        },
        tags: {
          type: [String],
          default: [],
        },
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
          maxValue: {
            type: Number,
            default: 100,
          },
          threshold: Number,
        },
        usageLimit: {
          type: Number,
        },
        usageCount: {
          type: Number,
          default: 0,
        },
        cooldown: {
          type: Number,
        },
        lastUsedAt: {
          type: Date,
        },
        effects: [
          {
            _id: false,
            type: {
              type: String,
              enum: ['stat_change', 'item_give', 'item_take', 'item_steal',
                     'task_reveal', 'task_complete', 'custom'],
              required: true,
            },
            targetType: {
              type: String,
              enum: ['self', 'other', 'any'],
            },
            requiresTarget: Boolean,
            targetStat: String,
            value: Number,
            statChangeTarget: {
              type: String,
              enum: ['value', 'maxValue'],
            },
            syncValue: Boolean,
            duration: Number,
            targetItemId: String,
            targetTaskId: String,
            description: String,
          },
        ],
      },
    ],

    // Phase 7.7: 角色已檢視的道具記錄
    viewedItems: [
      {
        _id: false,
        itemId: {
          type: String,
          required: true,
        },
        sourceCharacterId: {
          type: String,
          required: true,
        },
        viewedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Phase 8: 時效性效果記錄
    temporaryEffects: [
      {
        _id: false,
        id: {
          type: String,
          required: true,
        },
        sourceType: {
          type: String,
          enum: ['skill', 'item'],
          required: true,
        },
        sourceId: {
          type: String,
          required: true,
        },
        sourceCharacterId: {
          type: String,
          required: true,
        },
        sourceCharacterName: {
          type: String,
          required: true,
        },
        sourceName: {
          type: String,
          required: true,
        },
        effectType: {
          type: String,
          enum: ['stat_change'],
          default: 'stat_change',
        },
        targetStat: {
          type: String,
          required: true,
        },
        deltaValue: {
          type: Number,
        },
        deltaMax: {
          type: Number,
        },
        statChangeTarget: {
          type: String,
          enum: ['value', 'maxValue'],
          default: 'value',
        },
        syncValue: {
          type: Boolean,
        },
        duration: {
          type: Number,
          required: true,
        },
        appliedAt: {
          type: Date,
          required: true,
        },
        expiresAt: {
          type: Date,
          required: true,
        },
        isExpired: {
          type: Boolean,
          default: false,
        },
      },
    ],

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

// 防止重複註冊 Model
export default mongoose.models.CharacterRuntime ||
  mongoose.model<CharacterRuntimeDocument>('CharacterRuntime', CharacterRuntimeSchema);
