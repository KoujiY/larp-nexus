import mongoose, { Schema, Document } from 'mongoose';

/**
 * Phase 3.5 擴展版 Character Document
 * 包含 publicInfo、tasks、items（Phase 3）
 * 包含 secretInfo（Phase 3.5）
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
  
  // Phase 3: 任務與物品
  tasks?: Array<{
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'in-progress' | 'completed';
    createdAt: Date;
  }>;
  
  items?: Array<{
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    acquiredAt: Date;
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
    // Phase 3: 任務
    tasks: [
      {
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
        status: {
          type: String,
          enum: ['pending', 'in-progress', 'completed'],
          default: 'pending',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // Phase 3: 道具
    items: [
      {
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
        acquiredAt: {
          type: Date,
          default: Date.now,
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

