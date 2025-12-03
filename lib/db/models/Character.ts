import mongoose, { Schema, Document } from 'mongoose';

/**
 * Phase 4.5 擴展版 Character Document
 * 包含 publicInfo（Phase 3）
 * 包含 secretInfo（Phase 3.5）
 * 包含 stats（Phase 4）
 * 包含 tasks、items 擴展（Phase 4.5）
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
    // 使用效果
    effect?: {
      type: 'stat_change' | 'buff' | 'custom';
      targetStat?: string;
      value?: number;
      duration?: number;
      description?: string;
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
        // 使用效果
        effect: {
          type: {
            type: String,
            enum: ['stat_change', 'buff', 'custom'],
          },
          targetStat: String,
          value: Number,
          duration: Number,
          description: String,
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
  },
  {
    timestamps: true,
    collection: 'characters',
  }
);

// 建立索引
CharacterSchema.index({ gameId: 1 });

export default mongoose.models.Character || mongoose.model<CharacterDocument>('Character', CharacterSchema);

