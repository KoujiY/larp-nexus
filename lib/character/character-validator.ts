/**
 * 角色驗證器
 * 驗證角色資料和欄位
 * 
 * 從 character-update.ts 提取
 */

import { z } from 'zod';
import dbConnect from '@/lib/db/mongodb';
import { Character, Game } from '@/lib/db/models';
import type { CharacterDocument } from '@/lib/db/models';

/**
 * Character 驗證 Schema
 */
const characterSchema = z.object({
  name: z
    .string()
    .min(1, '角色名稱不可為空')
    .max(100, '角色名稱不可超過 100 字元'),
  description: z.string().optional(),
  hasPinLock: z.boolean(),
  pin: z.string().optional(),
});

/**
 * 驗證結果
 */
export interface ValidationResult {
  success: boolean;
  error?: string;
  message?: string;
}

/**
 * 驗證角色基本資料
 * 
 * @param data 角色資料
 * @returns 驗證結果
 */
export function validateCharacterData(data: {
  name?: string;
  description?: string;
  hasPinLock?: boolean;
  pin?: string;
}): ValidationResult {
  try {
    if (data.name !== undefined) {
      characterSchema.shape.name.parse(data.name);
    }
    if (data.hasPinLock !== undefined) {
      characterSchema.shape.hasPinLock.parse(data.hasPinLock);
    }
    if (data.pin !== undefined && data.pin !== null && data.pin !== '') {
      if (!/^\d{4}$/.test(data.pin)) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'PIN 碼必須為 4 位數字',
        };
      }
    }
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.issues[0]?.message || '驗證失敗',
      };
    }
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: '驗證失敗',
    };
  }
}

/**
 * 驗證角色存在性和權限
 * 
 * @param characterId 角色 ID
 * @param gmUserId GM 用戶 ID
 * @returns 驗證結果和角色文檔
 */
export async function validateCharacterAccess(
  characterId: string,
  gmUserId: string
): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  character?: CharacterDocument;
}> {
  await dbConnect();

  // 驗證角色存在
  const character = await Character.findById(characterId);
  if (!character) {
    return {
      success: false,
      error: 'NOT_FOUND',
      message: '找不到此角色',
    };
  }

  // 驗證 Game 擁有權
  const game = await Game.findOne({ _id: character.gameId, gmUserId });
  if (!game) {
    return {
      success: false,
      error: 'UNAUTHORIZED',
      message: '無權編輯此角色',
    };
  }

  return {
    success: true,
    character,
  };
}

/**
 * 驗證 Stats 資料
 * 
 * @param stats Stats 陣列
 * @returns 驗證結果
 */
export function validateStats(stats: Array<{
  id: string;
  name: string;
  value: number;
  maxValue?: number;
}>): ValidationResult {
  if (!Array.isArray(stats)) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Stats 必須是陣列',
    };
  }

  for (const stat of stats) {
    if (!stat.id || !stat.name) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Stat 必須包含 id 和 name',
      };
    }
    if (typeof stat.value !== 'number' || stat.value < 0) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Stat value 必須是非負數',
      };
    }
    if (stat.maxValue !== undefined && stat.maxValue !== null) {
      if (typeof stat.maxValue !== 'number' || stat.maxValue < 1) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Stat maxValue 必須是大於 0 的數字',
        };
      }
      if (stat.value > stat.maxValue) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: `Stat ${stat.name} 的 value 不能超過 maxValue`,
        };
      }
    }
  }

  return { success: true };
}

/**
 * 驗證 Skills 資料
 * 
 * @param skills Skills 陣列
 * @returns 驗證結果
 */
export function validateSkills(skills: Array<{
  id: string;
  name: string;
  description: string;
  // Phase 7.6: 擴展為包含 random_contest
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
}>): ValidationResult {
  if (!Array.isArray(skills)) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Skills 必須是陣列',
    };
  }

  for (const skill of skills) {
    if (!skill.id || !skill.name) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Skill 必須包含 id 和 name',
      };
    }
    if (skill.checkType === 'contest' && !skill.contestConfig) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: `技能 ${skill.name} 設定為對抗檢定但沒有 contestConfig`,
      };
    }
    if (skill.checkType === 'random') {
      if (!skill.randomConfig || !skill.randomConfig.maxValue || skill.randomConfig.threshold === undefined) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: `技能 ${skill.name} 設定為隨機檢定但 randomConfig 不完整`,
        };
      }
      if (skill.randomConfig.threshold > skill.randomConfig.maxValue) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: `技能 ${skill.name} 的 threshold 不能超過 maxValue`,
        };
      }
    }
  }

  return { success: true };
}

/**
 * 驗證 Items 資料
 * 
 * @param items Items 陣列
 * @returns 驗證結果
 */
export function validateItems(items: Array<{
  id: string;
  name: string;
  description: string;
  type: 'consumable' | 'equipment';
  quantity: number;
  // Phase 7.6: 擴展為包含 random_contest
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
}>): ValidationResult {
  if (!Array.isArray(items)) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Items 必須是陣列',
    };
  }

  for (const item of items) {
    if (!item.id || !item.name) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Item 必須包含 id 和 name',
      };
    }
    if (item.quantity < 0) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: `道具 ${item.name} 的 quantity 不能為負數`,
      };
    }
    if (item.checkType === 'contest' && !item.contestConfig) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: `道具 ${item.name} 設定為對抗檢定但沒有 contestConfig`,
      };
    }
    if (item.checkType === 'random') {
      if (!item.randomConfig || !item.randomConfig.maxValue || item.randomConfig.threshold === undefined) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: `道具 ${item.name} 設定為隨機檢定但 randomConfig 不完整`,
        };
      }
      if (item.randomConfig.threshold > item.randomConfig.maxValue) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: `道具 ${item.name} 的 threshold 不能超過 maxValue`,
        };
      }
    }
  }

  return { success: true };
}

/**
 * 驗證 Tasks 資料
 * 
 * @param tasks Tasks 陣列
 * @returns 驗證結果
 */
export function validateTasks(tasks: Array<{
  id: string;
  title: string;
  description: string;
  isHidden: boolean;
  isRevealed: boolean;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}>): ValidationResult {
  if (!Array.isArray(tasks)) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Tasks 必須是陣列',
    };
  }

  for (const task of tasks) {
    if (!task.id || !task.title) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Task 必須包含 id 和 title',
      };
    }
  }

  return { success: true };
}

/**
 * 驗證 Secrets 資料
 * 
 * @param secrets Secrets 陣列
 * @returns 驗證結果
 */
export function validateSecrets(secrets: Array<{
  id: string;
  title: string;
  content: string | string[];
  isRevealed: boolean;
}>): ValidationResult {
  if (!Array.isArray(secrets)) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Secrets 必須是陣列',
    };
  }

  for (const secret of secrets) {
    if (!secret.id || !secret.title) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Secret 必須包含 id 和 title',
      };
    }
  }

  return { success: true };
}

