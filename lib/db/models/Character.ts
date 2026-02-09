import mongoose, { Schema, Document } from 'mongoose';

/**
 * Phase 5 擴展版 Character Document
 * 包含 publicInfo（Phase 3）
 * 包含 secretInfo（Phase 3.5）
 * 包含 stats（Phase 4）
 * 包含 tasks、items 擴展（Phase 4.5）
 * 包含 skills（Phase 5）
 */
export interface CharacterDocument extends Document {
  gameId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  imageUrl?: string;
  hasPinLock: boolean;
  pin?: string; // PIN 明文儲存（僅 GM 可查看）
  
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
      revealedAt?: Date;
    }>;
  };
  
  // Phase 4.5: 任務系統（擴展版）
  tasks?: Array<{
    id: string;
    title: string;
    description: string;
    // 隱藏目標機制
    isHidden: boolean;
    isRevealed: boolean;
    revealedAt?: Date;
    // 完成狀態
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    completedAt?: Date;
    // GM 專用欄位
    gmNotes?: string;
    revealCondition?: string;
    createdAt: Date;
  }>;
  
  // Phase 4.5: 道具系統（擴展版）
  items?: Array<{
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    // 道具類型與數量
    type: 'consumable' | 'equipment';
    quantity: number;
    // 使用效果（重構：改為陣列，支援多個效果）
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
    // 向後兼容：保留單一 effect 欄位（已棄用）
    /** @deprecated 使用 effects 陣列代替 */
    effect?: {
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
    };
    // Phase 7.6: 標籤系統
    tags?: string[];
    // Phase 8: 檢定系統（Phase 7.6: 擴展為包含 random_contest）
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
    // 使用限制
    usageLimit?: number;
    usageCount?: number;
    cooldown?: number;
    lastUsedAt?: Date;
    // 流通性
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
    // Phase 7.6: 標籤系統
    tags?: string[];
    // 檢定系統（Phase 7.6: 擴展為包含 random_contest）
    checkType: 'none' | 'contest' | 'random' | 'random_contest';
    // 對抗檢定設定
    contestConfig?: {
      relatedStat: string; // 使用的數值名稱
      opponentMaxItems?: number; // 對方最多可使用道具數（預設 0）
      opponentMaxSkills?: number; // 對方最多可使用技能數（預設 0）
      tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail'; // 平手裁決方式
    };
    // 隨機檢定設定
    randomConfig?: {
      maxValue: number; // 隨機數值上限（預設 100）
      threshold: number; // 門檻值（必須 <= maxValue）
    };
    // 使用限制
    usageLimit?: number;
    usageCount?: number;
    cooldown?: number;
    lastUsedAt?: Date;
    // 效果定義（可多個）
    effects?: Array<{
      type: 'stat_change' | 'item_give' | 'item_take' | 'item_steal' | 
            'task_reveal' | 'task_complete' | 'custom';
      targetStat?: string;
      value?: number;
      statChangeTarget?: 'value' | 'maxValue';
      syncValue?: boolean;
      targetItemId?: string;
      targetTaskId?: string;
      targetCharacterId?: string;
      description?: string;
    }>;
  }>;
  
  createdAt: Date;
  updatedAt: Date;
}

const CharacterSchema = new Schema<CharacterDocument>(
  {
    gameId: {
      type: Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
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
          _id: false, // 禁用自動生成 _id
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
            _id: false, // 禁用自動生成 _id，使用自訂 id 欄位
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
              required: true,
            },
            isRevealed: {
              type: Boolean,
              default: false,
            },
            revealCondition: {
              type: String,
              default: '',
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
        // 隱藏目標機制
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
        // 完成狀態
        status: {
          type: String,
          enum: ['pending', 'in-progress', 'completed', 'failed'],
          default: 'pending',
        },
        completedAt: {
          type: Date,
        },
        // GM 專用欄位
        gmNotes: {
          type: String,
          default: '',
        },
        revealCondition: {
          type: String,
          default: '',
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
        // 道具類型與數量
        type: {
          type: String,
          enum: ['consumable', 'equipment'],
          default: 'consumable',
        },
        quantity: {
          type: Number,
          default: 1,
        },
        // 使用效果（重構：支援多個效果）
        effects: [
          {
            _id: false,
            type: {
              type: String,
              enum: ['stat_change', 'custom', 'item_take', 'item_steal'], // Phase 7: 添加 item_take 和 item_steal
              required: true,
            },
            // Phase 6.5 方案 A: 目標設定
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
            targetItemId: String, // Phase 7: 目標道具 ID
            duration: Number,
            description: String,
          },
        ],
        // 向後兼容：保留單一 effect 欄位（已棄用）
        effect: {
          type: {
            type: String,
            enum: ['stat_change', 'custom', 'item_take', 'item_steal'],
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
          targetItemId: String, // Phase 7: 目標道具 ID
          duration: Number,
          description: String,
        },
        // Phase 7.6: 標籤系統
        tags: [String],
        // Phase 8: 檢定系統（Phase 7.6: 擴展為包含 random_contest）
        checkType: {
          type: String,
          enum: ['none', 'contest', 'random', 'random_contest'],
          default: 'none',
        },
        // 對抗檢定設定
        contestConfig: {
          relatedStat: String, // 使用的數值名稱
          opponentMaxItems: Number, // 對方最多可使用道具數（預設 0）
          opponentMaxSkills: Number, // 對方最多可使用技能數（預設 0）
          tieResolution: {
            type: String,
            enum: ['attacker_wins', 'defender_wins', 'both_fail'],
            default: 'attacker_wins',
          },
        },
        // 隨機檢定設定
        randomConfig: {
          maxValue: {
            type: Number,
            default: 100,
          },
          threshold: Number, // 門檻值（必須 <= maxValue）
        },
        // 使用限制
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
        // 流通性
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
        _id: false, // 禁用自動生成 _id，使用自訂 id 欄位
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
        // Phase 7.6: 標籤系統
        tags: {
          type: [String],
          default: [],
        },
        // 檢定系統（Phase 7.6: 擴展為包含 random_contest）
        checkType: {
          type: String,
          enum: ['none', 'contest', 'random', 'random_contest'],
          default: 'none',
        },
        // 對抗檢定設定
        contestConfig: {
          relatedStat: String, // 使用的數值名稱
          opponentMaxItems: Number, // 對方最多可使用道具數（預設 0）
          opponentMaxSkills: Number, // 對方最多可使用技能數（預設 0）
          tieResolution: {
            type: String,
            enum: ['attacker_wins', 'defender_wins', 'both_fail'],
            default: 'attacker_wins',
          },
        },
        // 隨機檢定設定
        randomConfig: {
          maxValue: {
            type: Number,
            default: 100,
          },
          threshold: Number, // 門檻值（必須 <= maxValue）
        },
        // 使用限制
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
        // 效果定義（可多個）
        effects: [
          {
            _id: false,
            type: {
              type: String,
              enum: ['stat_change', 'item_give', 'item_take', 'item_steal', 
                     'task_reveal', 'task_complete', 'custom'],
              required: true,
            },
            // Phase 6.5 方案 A: 目標設定
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
            targetTaskId: String,
            description: String,
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
    collection: 'characters',
    strict: true, // 嚴格模式：只保存 Schema 中定義的欄位
    // 但對於嵌套的子文檔，我們需要確保所有欄位都被正確保存
  }
);

// 建立索引
CharacterSchema.index({ gameId: 1 });

export default mongoose.models.Character || mongoose.model<CharacterDocument>('Character', CharacterSchema);

