/**
 * CharacterDocument 與 CharacterRuntimeDocument 共用介面
 *
 * 兩個模型共用的欄位在此定義，各 Document 介面透過 extends 引入。
 * 消除重複定義（約 170 行）。
 *
 * 使用方式：
 *   export interface CharacterDocument extends Document, CharacterDocumentBase { }
 *   export interface CharacterRuntimeDocument extends Document, CharacterDocumentBase {
 *     refId: ...; type: ...; // Runtime 專屬欄位
 *   }
 */

import mongoose from 'mongoose';
import type { AutoRevealCondition, BackgroundBlock } from '@/types/character';
import type { MongoItemEffect, MongoSkillEffect } from '@/lib/db/types/mongo-helpers';

export interface CharacterDocumentBase {
  gameId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  slogan?: string;
  imageUrl?: string;
  hasPinLock: boolean;
  pin?: string;

  // Phase 3: 公開資訊（PIN 解鎖後可見）
  publicInfo?: {
    background: BackgroundBlock[];
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
      content: string | string[];
      isRevealed: boolean;
      revealCondition?: string;
      autoRevealCondition?: AutoRevealCondition;
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
    revealCondition?: string;
    autoRevealCondition?: AutoRevealCondition;
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
    effects?: MongoItemEffect[];
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
    effects?: MongoSkillEffect[];
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

  createdAt: Date;
  updatedAt: Date;
}
