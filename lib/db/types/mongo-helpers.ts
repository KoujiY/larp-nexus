/**
 * MongoDB lean() 返回的子文檔類型的正規定義
 *
 * lean() 返回純 JS 物件，不需要 Mongoose Document 方法。
 * _id?: unknown 用於接受 Mongoose 自動附加的欄位。
 *
 * 此為唯一定義來源。請勿在 character-cleanup.ts / field-updaters.ts 等
 * 其他檔案中重複定義同名介面。
 */

import type { AutoRevealCondition } from '@/types/character';

export interface MongoSecret {
  id: string;
  title: string;
  content: string | string[];
  isRevealed: boolean;
  revealCondition?: string;
  autoRevealCondition?: AutoRevealCondition;
  revealedAt?: Date;
  _id?: unknown;
}

export interface MongoTask {
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
  _id?: unknown;
}

/** 道具效果的單一項目（MongoItem.effects / MongoItem.effect 共用） */
export interface MongoItemEffect {
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
}

export interface MongoItem {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  type: 'consumable' | 'tool' | 'equipment';
  quantity: number;
  effects?: MongoItemEffect[];
  /** @deprecated 請改用 effects 陣列 */
  effect?: MongoItemEffect;
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
  equipped?: boolean;
  statBoosts?: Array<{ statName: string; value: number; target?: 'value' | 'maxValue' | 'both' }>;
  _id?: unknown;
}

export interface MongoStat {
  id: string;
  name: string;
  value: number;
  maxValue?: number;
  _id?: unknown;
}

/** 技能效果的單一項目（MongoSkill.effects 使用） */
export interface MongoSkillEffect {
  type: 'stat_change' | 'item_give' | 'item_take' | 'item_steal' |
        'task_reveal' | 'task_complete' | 'custom';
  targetType?: 'self' | 'other' | 'any';
  requiresTarget?: boolean;
  targetStat?: string;
  value?: number;
  statChangeTarget?: 'value' | 'maxValue';
  syncValue?: boolean;
  duration?: number;
  targetItemId?: string;
  targetTaskId?: string;
  description?: string;
}

export interface MongoSkill {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
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
  _id?: unknown;
}
