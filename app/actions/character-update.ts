"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db/mongodb";
import { Character, Game } from "@/lib/db/models";
import { getCurrentGMUserId } from "@/lib/auth/session";
import type { ApiResponse } from "@/types/api";
import type { CharacterData } from "@/types/character";
import { emitRoleUpdated, emitInventoryUpdated } from "@/lib/websocket/events";
import {
  cleanSkillData,
  cleanItemData,
  cleanStatData,
  cleanTaskData,
  cleanSecretData,
} from "@/lib/character-cleanup";

// MongoDB lean() 返回的類型（可能包含 _id）
interface MongoSecret {
  id: string;
  title: string;
  content: string;
  isRevealed: boolean;
  revealCondition?: string;
  revealedAt?: Date;
  _id?: unknown;
}

interface MongoItem {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  type: "consumable" | "equipment";
  quantity: number;
  // 使用效果（重構：改為陣列，支援多個效果）
  effects?: Array<{
    type: "stat_change" | "custom" | "item_take" | "item_steal";
    targetType?: "self" | "other" | "any";
    requiresTarget?: boolean;
    targetStat?: string;
    value?: number;
    statChangeTarget?: "value" | "maxValue";
    syncValue?: boolean;
    targetItemId?: string;
    duration?: number;
    description?: string;
  }>;
  // 向後兼容：保留 effect 欄位（單一效果），但優先使用 effects
  /** @deprecated 使用 effects 陣列代替 */
  effect?: {
    type: "stat_change" | "custom" | "item_take" | "item_steal"; // Phase 7: 添加 item_take 和 item_steal
    targetType?: "self" | "other" | "any"; // Phase 6.5: 目標設定
    requiresTarget?: boolean; // Phase 6.5: 是否需要選擇目標
    targetStat?: string;
    value?: number;
    statChangeTarget?: "value" | "maxValue";
    syncValue?: boolean;
    targetItemId?: string; // Phase 7: 目標道具 ID
    duration?: number;
    description?: string;
  };
  // Phase 8: 檢定系統
  checkType?: "none" | "contest" | "random";
  contestConfig?: {
    relatedStat: string;
    opponentMaxItems?: number;
    opponentMaxSkills?: number;
    tieResolution?: "attacker_wins" | "defender_wins" | "both_fail";
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
  _id?: unknown;
}

interface MongoStat {
  id: string;
  name: string;
  value: number;
  maxValue?: number;
  _id?: unknown;
}

/**
 * Character 驗證 Schema
 */
const characterSchema = z.object({
  name: z
    .string()
    .min(1, "角色名稱不可為空")
    .max(100, "角色名稱不可超過 100 字元"),
  description: z.string().optional(),
  hasPinLock: z.boolean(),
  pin: z.string().optional(),
});

/**
 * 更新角色
 * Phase 4: 支援更新 publicInfo、secretInfo 和 stats
 */
export async function updateCharacter(
  characterId: string,
  data: {
    name?: string;
    description?: string;
    hasPinLock?: boolean;
    pin?: string;
    publicInfo?: {
      background?: string;
      personality?: string;
      relationships?: Array<{
        targetName: string;
        description: string;
      }>;
    };
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
    stats?: Array<{
      id: string;
      name: string;
      value: number;
      maxValue?: number;
    }>;
    // Phase 4.5: 任務系統
    tasks?: Array<{
      id: string;
      title: string;
      description: string;
      isHidden: boolean;
      isRevealed: boolean;
      revealedAt?: Date;
      status: "pending" | "in-progress" | "completed" | "failed";
      completedAt?: Date;
      gmNotes?: string;
      revealCondition?: string;
      createdAt: Date;
    }>;
    // Phase 4.5: 道具系統
    items?: Array<{
      id: string;
      name: string;
      description: string;
      imageUrl?: string;
      type: "consumable" | "equipment";
      quantity: number;
      // 使用效果（重構：改為陣列，支援多個效果）
      effects?: Array<{
        type: "stat_change" | "custom" | "item_take" | "item_steal"; // Phase 7: 添加 item_take 和 item_steal
        targetType?: "self" | "other" | "any"; // Phase 6.5: 目標設定
        requiresTarget?: boolean; // Phase 6.5: 是否需要選擇目標
        targetStat?: string;
        value?: number;
        statChangeTarget?: "value" | "maxValue"; // Phase 6.5: 數值變化目標
        syncValue?: boolean; // Phase 6.5: 同步目前值
        targetItemId?: string; // Phase 7: 目標道具 ID
        duration?: number;
        description?: string;
      }>;
      // 向後兼容：保留 effect 欄位（單一效果），但優先使用 effects
      /** @deprecated 使用 effects 陣列代替 */
      effect?: {
        type: "stat_change" | "custom" | "item_take" | "item_steal";
        targetType?: "self" | "other" | "any";
        requiresTarget?: boolean;
        targetStat?: string;
        value?: number;
        statChangeTarget?: "value" | "maxValue";
        syncValue?: boolean;
        targetItemId?: string;
        duration?: number;
        description?: string;
      };
      // Phase 8: 檢定系統
      checkType?: "none" | "contest" | "random";
      contestConfig?: {
        relatedStat: string;
        opponentMaxItems?: number;
        opponentMaxSkills?: number;
        tieResolution?: "attacker_wins" | "defender_wins" | "both_fail";
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
    // Phase 5: 技能系統
    skills?: Array<{
      id: string;
      name: string;
      description: string;
      iconUrl?: string;
      checkType: "none" | "contest" | "random";
      contestConfig?: {
        relatedStat: string;
        opponentMaxItems?: number;
        opponentMaxSkills?: number;
        tieResolution?: "attacker_wins" | "defender_wins" | "both_fail";
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
        type:
          | "stat_change"
          | "item_give"
          | "item_take"
          | "item_steal"
          | "task_reveal"
          | "task_complete"
          | "custom";
        targetType?: "self" | "other" | "any";
        requiresTarget?: boolean;
        targetStat?: string;
        value?: number;
        statChangeTarget?: "value" | "maxValue";
        syncValue?: boolean;
        targetItemId?: string;
        targetTaskId?: string;
        targetCharacterId?: string;
        description?: string;
      }>;
    }>;
  }
): Promise<ApiResponse<CharacterData>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return {
        success: false,
        error: "UNAUTHORIZED",
        message: "請先登入",
      };
    }

    await dbConnect();

    // 驗證角色存在
    const character = await Character.findById(characterId);
    if (!character) {
      return {
        success: false,
        error: "NOT_FOUND",
        message: "找不到此角色",
      };
    }

    // 驗證 Game 擁有權
    const game = await Game.findOne({ _id: character.gameId, gmUserId });
    if (!game) {
      return {
        success: false,
        error: "UNAUTHORIZED",
        message: "無權編輯此角色",
      };
    }

    // 更新資料
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
      characterSchema.shape.name.parse(data.name);
      updateData.name = data.name;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.hasPinLock !== undefined) {
      updateData.hasPinLock = data.hasPinLock;
    }

    // 處理 PIN 更新
    if (data.pin) {
      if (!/^\d{4,6}$/.test(data.pin)) {
        return {
          success: false,
          error: "VALIDATION_ERROR",
          message: "PIN 碼必須為 4-6 位數字",
        };
      }
      updateData.pin = data.pin;
    }

    // Phase 3: 處理 publicInfo 更新
    if (data.publicInfo !== undefined) {
      const currentPublicInfo = character.publicInfo || {};
      updateData.publicInfo = {
        background:
          data.publicInfo.background ?? currentPublicInfo.background ?? "",
        personality:
          data.publicInfo.personality ?? currentPublicInfo.personality ?? "",
        relationships:
          data.publicInfo.relationships ??
          currentPublicInfo.relationships ??
          [],
      };
    }

    // Phase 3.5: 處理 secretInfo 更新
    if (data.secretInfo !== undefined) {
      const currentSecrets: MongoSecret[] = character.secretInfo?.secrets || [];

      // 處理每個 secret 的更新
      const updatedSecrets = data.secretInfo.secrets.map((newSecret) => {
        const oldSecret = currentSecrets.find(
          (s: MongoSecret) => s.id === newSecret.id
        );

        // 建立乾淨的 secret 物件（不包含任何額外欄位如 _id）
        const cleanSecret = {
          id: newSecret.id,
          title: newSecret.title,
          content: newSecret.content,
          isRevealed: newSecret.isRevealed,
          revealCondition: newSecret.revealCondition || "",
          revealedAt: undefined as Date | undefined,
        };

        // 如果從未揭露變為已揭露，設定揭露時間
        if (newSecret.isRevealed && (!oldSecret || !oldSecret.isRevealed)) {
          cleanSecret.revealedAt = new Date();
        } else if (oldSecret?.revealedAt) {
          // 保留原有的揭露時間
          cleanSecret.revealedAt = oldSecret.revealedAt;
        }

        return cleanSecret;
      });

      updateData.secretInfo = { secrets: updatedSecrets };
    }

    // Phase 4: 處理 stats 更新
    if (data.stats !== undefined) {
      updateData.stats = data.stats.map((stat) => ({
        id: stat.id,
        name: stat.name,
        value: stat.value,
        maxValue: stat.maxValue,
      }));
    }

    // Phase 4.5: 處理 tasks 更新
    if (data.tasks !== undefined) {
      const currentTasks = character.tasks || [];

      updateData.tasks = data.tasks.map((newTask) => {
        const oldTask = currentTasks.find(
          (t: { id: string }) => t.id === newTask.id
        );

        const cleanTask = {
          id: newTask.id,
          title: newTask.title,
          description: newTask.description,
          isHidden: newTask.isHidden,
          isRevealed: newTask.isRevealed,
          revealedAt: newTask.revealedAt,
          status: newTask.status,
          completedAt: newTask.completedAt,
          gmNotes: newTask.gmNotes || "",
          revealCondition: newTask.revealCondition || "",
          createdAt: newTask.createdAt || new Date(),
        };

        // 如果隱藏目標從未揭露變為已揭露，設定揭露時間
        if (
          newTask.isHidden &&
          newTask.isRevealed &&
          (!oldTask || !oldTask.isRevealed)
        ) {
          cleanTask.revealedAt = new Date();
        } else if (oldTask?.revealedAt) {
          cleanTask.revealedAt = oldTask.revealedAt;
        }

        // 如果狀態變為已完成/失敗，設定完成時間
        if (
          (newTask.status === "completed" || newTask.status === "failed") &&
          (!oldTask ||
            (oldTask.status !== "completed" && oldTask.status !== "failed"))
        ) {
          cleanTask.completedAt = new Date();
        } else if (oldTask?.completedAt) {
          cleanTask.completedAt = oldTask.completedAt;
        }

        return cleanTask;
      });
    }

    // Phase 4.5: 處理 items 更新
    const inventoryDiffs: Array<{
      action: "added" | "updated" | "deleted";
      item: {
        id: string;
        name: string;
        description: string;
        imageUrl?: string;
        acquiredAt?: string;
      };
    }> = [];
    if (data.items !== undefined) {
      const currentItems: MongoItem[] = character.items || [];
      updateData.items = data.items.map((item) => {
        const itemData: Record<string, unknown> = {
          id: item.id,
          name: item.name,
          description: item.description,
          type: item.type,
          quantity: item.quantity,
          usageCount: item.usageCount || 0,
          isTransferable: item.isTransferable,
          acquiredAt: item.acquiredAt || new Date(),
        };

        if (item.imageUrl !== undefined) itemData.imageUrl = item.imageUrl;
        
        // Phase 6.5 / Phase 7: 處理道具效果（優先處理 effects 陣列，向後兼容 effect）
        // 使用與技能相同的處理邏輯，確保一致性
        // 關鍵修復：必須明確處理所有情況
        // 注意：前端傳來的 item.effects 可能是陣列（有值或空陣列）或 undefined
        if (item.effects !== undefined && item.effects !== null) {
          // 明確設置了 effects（可能是陣列或空陣列）
          if (Array.isArray(item.effects)) {
            if (item.effects.length > 0) {
              // 有效果，處理並保存
              const processedEffects = item.effects
                .filter((effect) => effect && effect.type)
                .map((effect) => {
                  // 建立完整的 effectData，明確包含所有欄位
                  const effectData: Record<string, unknown> = {
                    type: effect.type,
                  };

                  // Phase 6.5 / Phase 7: 目標設定
                  const effectAny = effect as Record<string, unknown>;
                  // Phase 7: item_take 和 item_steal 效果預設為 "other"，其他效果預設為 "self"
                  const defaultTargetType = 
                    (effect.type === 'item_take' || effect.type === 'item_steal') 
                      ? "other" 
                      : "self";
                  const normalizedTargetType =
                    (effectAny.targetType as "self" | "other" | "any" | undefined) ??
                    defaultTargetType;
                  effectData.targetType = normalizedTargetType;
                  const normalizedRequiresTarget =
                    effectAny.requiresTarget !== undefined &&
                    effectAny.requiresTarget !== null
                      ? Boolean(effectAny.requiresTarget)
                      : normalizedTargetType !== "self";
                  effectData.requiresTarget = normalizedRequiresTarget;

                  // 明確設定所有可能的欄位，確保它們被正確儲存
                  if (effect.targetStat !== undefined && effect.targetStat !== null) {
                    effectData.targetStat = String(effect.targetStat);
                  }
                  if (effect.value !== undefined && effect.value !== null) {
                    effectData.value = Number(effect.value);
                  }
                  if (effect.statChangeTarget !== undefined && effect.statChangeTarget !== null) {
                    effectData.statChangeTarget = String(effect.statChangeTarget);
                  }
                  if (effect.syncValue !== undefined && effect.syncValue !== null) {
                    effectData.syncValue = Boolean(effect.syncValue);
                  }
                  if (effect.targetItemId !== undefined && effect.targetItemId !== null) {
                    effectData.targetItemId = String(effect.targetItemId);
                  }
                  if (effect.duration !== undefined && effect.duration !== null) {
                    effectData.duration = Number(effect.duration);
                  }
                  if (effect.description !== undefined && effect.description !== null) {
                    effectData.description = String(effect.description);
                  }

                  return effectData;
                });
              
              // 只有在處理後仍有有效效果時才設置 effects
              if (processedEffects.length > 0) {
                itemData.effects = processedEffects;
              } else {
                // 所有效果都被過濾掉，設置為空陣列（明確清空效果）
                itemData.effects = [];
              }
            } else {
              // 空陣列：明確清空效果
              itemData.effects = [];
            }
          }
          // 如果 item.effects 不是陣列，忽略它（可能是舊資料格式）
        } else {
          // item.effects 是 undefined 或 null，從資料庫中讀取原始值並保留
          const originalItem = currentItems.find((i) => i.id === item.id);
          if (originalItem && originalItem.effects !== undefined) {
            // 保留資料庫中的原始 effects（可能是陣列或空陣列）
            itemData.effects = originalItem.effects;
          }
          // 如果原始資料中也沒有 effects，不設置 itemData.effects（保持 undefined）
        }
        
        // 向後兼容：如果沒有 effects 但有 effect，轉換為 effects
        if ((!item.effects || item.effects.length === 0) && item.effect !== undefined) {
          const effectAny = item.effect as Record<string, unknown>;
          const defaultTargetType = 
            (item.effect.type === 'item_take' || item.effect.type === 'item_steal') 
              ? "other" 
              : "self";
          const normalizedTargetType =
            (effectAny.targetType as "self" | "other" | "any" | undefined) ??
            defaultTargetType;
          const normalizedRequiresTarget =
            effectAny.requiresTarget !== undefined &&
            effectAny.requiresTarget !== null
              ? Boolean(effectAny.requiresTarget)
              : normalizedTargetType !== "self";
          
          const effectData: Record<string, unknown> = {
            type: item.effect.type,
            targetType: normalizedTargetType,
            requiresTarget: normalizedRequiresTarget,
          };
          
          if (item.effect.targetStat !== undefined && item.effect.targetStat !== null) {
            effectData.targetStat = String(item.effect.targetStat);
          }
          if (item.effect.value !== undefined && item.effect.value !== null) {
            effectData.value = Number(item.effect.value);
          }
          if (item.effect.statChangeTarget !== undefined && item.effect.statChangeTarget !== null) {
            effectData.statChangeTarget = String(item.effect.statChangeTarget);
          }
          if (item.effect.syncValue !== undefined && item.effect.syncValue !== null) {
            effectData.syncValue = Boolean(item.effect.syncValue);
          }
          if (item.effect.targetItemId !== undefined && item.effect.targetItemId !== null) {
            effectData.targetItemId = String(item.effect.targetItemId);
          }
          if (item.effect.duration !== undefined && item.effect.duration !== null) {
            effectData.duration = Number(item.effect.duration);
          }
          if (item.effect.description !== undefined && item.effect.description !== null) {
            effectData.description = String(item.effect.description);
          }
          
          itemData.effects = [effectData];
        }
        
        // 清除舊的 effect 欄位
        delete itemData.effect;
        
        if (item.usageLimit !== undefined) itemData.usageLimit = item.usageLimit;
        if (item.cooldown !== undefined) itemData.cooldown = item.cooldown;
        if (item.lastUsedAt !== undefined) itemData.lastUsedAt = item.lastUsedAt;

        // Phase 8: 處理檢定設定
        if (item.checkType !== undefined) {
          itemData.checkType = item.checkType;
        }

        // 根據檢定類型設定對應的配置
        if (item.checkType === 'contest') {
          if (item.contestConfig) {
            itemData.contestConfig = item.contestConfig;
          }
          // 清除 randomConfig
          delete itemData.randomConfig;
        } else if (item.checkType === 'random') {
          // 確保 randomConfig 存在且有完整的值
          const maxValue = item.randomConfig?.maxValue;
          const threshold = item.randomConfig?.threshold;

          if (!maxValue || threshold === undefined || threshold === null) {
            console.warn(
              `道具 ${item.name} 設定為隨機檢定但 randomConfig 不完整，使用預設值`
            );
            itemData.randomConfig = {
              maxValue: maxValue && maxValue > 0 ? maxValue : 100,
              threshold:
                threshold !== undefined && threshold !== null && threshold > 0
                  ? threshold
                  : 50,
            };
          } else {
            // 確保 threshold 不超過 maxValue
            itemData.randomConfig = {
              maxValue,
              threshold: Math.min(threshold, maxValue),
            };
          }
          // 清除 contestConfig
          delete itemData.contestConfig;
        } else {
          // checkType === 'none' 或 undefined，清除所有配置
          delete itemData.randomConfig;
          delete itemData.contestConfig;
        }

        return itemData;
      });

      const newItems = updateData.items as Array<{
        id: string;
        name: string;
        description: string;
        imageUrl?: string;
        type: string;
        quantity: number;
        acquiredAt?: string | Date;
      }>;

      // 比對新增/更新
      newItems.forEach((newItem) => {
        const oldItem = currentItems.find((i) => i.id === newItem.id);
        if (!oldItem) {
          inventoryDiffs.push({
            action: "added",
            item: {
              id: newItem.id,
              name: newItem.name,
              description: newItem.description || "",
              imageUrl: newItem.imageUrl,
              acquiredAt: newItem.acquiredAt
                ? new Date(newItem.acquiredAt).toISOString()
                : undefined,
            },
          });
        } else if (
          oldItem.name !== newItem.name ||
          oldItem.description !== newItem.description ||
          oldItem.imageUrl !== newItem.imageUrl ||
          oldItem.quantity !== newItem.quantity
        ) {
          inventoryDiffs.push({
            action: "updated",
            item: {
              id: newItem.id,
              name: newItem.name,
              description: newItem.description || "",
              imageUrl: newItem.imageUrl,
              acquiredAt: newItem.acquiredAt
                ? new Date(newItem.acquiredAt).toISOString()
                : undefined,
            },
          });
        }
      });

      // 刪除
      currentItems.forEach((oldItem) => {
        const exist = data.items!.some((i) => i.id === oldItem.id);
        if (!exist) {
          inventoryDiffs.push({
            action: "deleted",
            item: {
              id: oldItem.id,
              name: oldItem.name,
              description: oldItem.description || "",
              imageUrl: oldItem.imageUrl,
              acquiredAt: oldItem.acquiredAt
                ? new Date(oldItem.acquiredAt).toISOString()
                : undefined,
            },
          });
        }
      });
    }

    // Phase 5: 處理 skills 更新
    if (data.skills !== undefined) {
      const normalizedSkills = (data.skills || []).filter((s) => s && s.id);
      updateData.skills = normalizedSkills.map((skill) => {
        const skillData: Record<string, unknown> = {
          id: skill.id,
          name: skill.name,
          description: skill.description || "",
          checkType: skill.checkType,
          usageCount: skill.usageCount || 0,
        };

        if (skill.iconUrl !== undefined) skillData.iconUrl = skill.iconUrl;
        if (skill.usageLimit !== undefined)
          skillData.usageLimit = skill.usageLimit;
        if (skill.cooldown !== undefined) skillData.cooldown = skill.cooldown;
        if (skill.lastUsedAt !== undefined)
          skillData.lastUsedAt = skill.lastUsedAt;

        skillData.effects = (skill.effects || [])
          .filter((effect) => effect && effect.type)
          .map((effect) => {
            // 建立完整的 effectData，明確包含所有欄位（即使是 undefined）
            // 但要注意：MongoDB 會忽略 undefined，所以我們只包含有值的欄位
            const effectData: Record<string, unknown> = {
              type: effect.type,
            };

            // Phase 6.5 / Phase 7: 目標設定
            const effectAny = effect as Record<string, unknown>;
            // Phase 7: item_take 和 item_steal 效果預設為 "other"，其他效果預設為 "self"
            const defaultTargetType = 
              (effect.type === 'item_take' || effect.type === 'item_steal') 
                ? "other" 
                : "self";
            const normalizedTargetType =
              (effectAny.targetType as "self" | "other" | "any" | undefined) ??
              defaultTargetType;
            effectData.targetType = normalizedTargetType;
            const normalizedRequiresTarget =
              effectAny.requiresTarget !== undefined &&
              effectAny.requiresTarget !== null
                ? Boolean(effectAny.requiresTarget)
                : normalizedTargetType !== "self";
            effectData.requiresTarget = normalizedRequiresTarget;

            // 明確設定所有可能的欄位，確保它們被正確儲存
            if (effect.targetStat !== undefined && effect.targetStat !== null) {
              effectData.targetStat = String(effect.targetStat);
            }
            if (effect.value !== undefined && effect.value !== null) {
              effectData.value = Number(effect.value);
            }

            // 關鍵：statChangeTarget 和 syncValue 必須明確設定，即使值可能是 undefined
            // 但我們只在有值時才設定，因為 MongoDB 會忽略 undefined
            if (
              effect.statChangeTarget !== undefined &&
              effect.statChangeTarget !== null
            ) {
              effectData.statChangeTarget = String(effect.statChangeTarget);
            }
            if (effect.syncValue !== undefined && effect.syncValue !== null) {
              effectData.syncValue = Boolean(effect.syncValue);
            }

            if (
              effect.targetItemId !== undefined &&
              effect.targetItemId !== null
            ) {
              effectData.targetItemId = String(effect.targetItemId);
            }
            if (
              effect.targetTaskId !== undefined &&
              effect.targetTaskId !== null
            ) {
              effectData.targetTaskId = String(effect.targetTaskId);
            }
            if (
              effect.targetCharacterId !== undefined &&
              effect.targetCharacterId !== null
            ) {
              effectData.targetCharacterId = String(effect.targetCharacterId);
            }
            if (
              effect.description !== undefined &&
              effect.description !== null
            ) {
              effectData.description = String(effect.description);
            }

            return effectData;
          });

        // 根據檢定類型設定對應的配置
        if (skill.checkType === "contest") {
          if (skill.contestConfig) {
            skillData.contestConfig = skill.contestConfig;
          } else {
            console.warn(
              `技能 ${skill.name} 設定為對抗檢定但沒有 contestConfig`
            );
          }
          // 清除 randomConfig（使用 $unset 或直接不設定）
          // 注意：不要設定為 undefined，而是直接不包含在 skillData 中
          delete skillData.randomConfig;
        } else if (skill.checkType === "random") {
          // 確保 randomConfig 存在且有完整的值
          const maxValue = skill.randomConfig?.maxValue;
          const threshold = skill.randomConfig?.threshold;

          if (!maxValue || threshold === undefined || threshold === null) {
            console.warn(
              `技能 ${skill.name} 設定為隨機檢定但 randomConfig 不完整，使用預設值`
            );
            skillData.randomConfig = {
              maxValue: maxValue && maxValue > 0 ? maxValue : 100,
              threshold:
                threshold !== undefined && threshold !== null && threshold > 0
                  ? threshold
                  : 50,
            };
          } else {
            // 確保 threshold 不超過 maxValue
            skillData.randomConfig = {
              maxValue,
              threshold: Math.min(threshold, maxValue),
            };
          }
          // 清除 contestConfig（使用 $unset 或直接不設定）
          // 注意：不要設定為 undefined，而是直接不包含在 skillData 中
          delete skillData.contestConfig;
        } else {
          // checkType === 'none'，清除所有配置
          // 注意：不要設定為 undefined，而是直接不包含在 skillData 中
          delete skillData.randomConfig;
          delete skillData.contestConfig;
        }

        return skillData;
      });
    }

    // 使用 findById 取得文件，手動更新後再 save，確保所有欄位都被正確保存
    const characterDoc = await Character.findById(characterId);

    if (!characterDoc) {
      return {
        success: false,
        error: "NOT_FOUND",
        message: "找不到此角色",
      };
    }

    // 手動更新所有欄位
    Object.keys(updateData).forEach((key) => {
      if (key === "skills" && updateData.skills) {
        // 對於 skills 陣列，需要逐個建立 Mongoose 子文檔
        // 這樣 Mongoose 才能正確處理嵌套欄位
        const skillsArray = (
          updateData.skills as Array<Record<string, unknown>>
        )
          .filter((skillData) => skillData && skillData.id)
          .map((skillData) => {
            // 建立新的技能物件，確保所有欄位都被包含
            const skillObj: Record<string, unknown> = {
              id: skillData.id,
              name: skillData.name,
              description: skillData.description || "",
              checkType: skillData.checkType,
            };

            if (skillData.iconUrl !== undefined)
              skillObj.iconUrl = skillData.iconUrl;
            if (skillData.usageLimit !== undefined)
              skillObj.usageLimit = skillData.usageLimit;
            if (skillData.usageCount !== undefined)
              skillObj.usageCount = skillData.usageCount;
            if (skillData.cooldown !== undefined)
              skillObj.cooldown = skillData.cooldown;
            if (skillData.lastUsedAt !== undefined)
              skillObj.lastUsedAt = skillData.lastUsedAt;

            // 處理 effects，確保所有欄位都被包含
            if (skillData.effects && Array.isArray(skillData.effects)) {
              skillObj.effects = skillData.effects
                .filter(
                  (effect: Record<string, unknown>) => effect && effect.type
                )
                .map((effect: Record<string, unknown>) => {
                  const effectObj: Record<string, unknown> = {
                    type: effect.type,
                  };

                  // Phase 6.5: 目標設定
                  if (
                    effect.targetType !== undefined &&
                    effect.targetType !== null
                  ) {
                    effectObj.targetType = String(effect.targetType);
                  }
                  if (
                    effect.requiresTarget !== undefined &&
                    effect.requiresTarget !== null
                  ) {
                    effectObj.requiresTarget = Boolean(effect.requiresTarget);
                  }

                  // 明確設定所有欄位，包括 statChangeTarget 和 syncValue
                  if (
                    effect.targetStat !== undefined &&
                    effect.targetStat !== null
                  ) {
                    effectObj.targetStat = String(effect.targetStat);
                  }
                  if (effect.value !== undefined && effect.value !== null) {
                    effectObj.value = Number(effect.value);
                  }
                  // 關鍵：確保 statChangeTarget 和 syncValue 被正確設定
                  if (
                    effect.statChangeTarget !== undefined &&
                    effect.statChangeTarget !== null
                  ) {
                    effectObj.statChangeTarget = String(
                      effect.statChangeTarget
                    );
                  }
                  if (
                    effect.syncValue !== undefined &&
                    effect.syncValue !== null
                  ) {
                    effectObj.syncValue = Boolean(effect.syncValue);
                  }
                  if (
                    effect.targetItemId !== undefined &&
                    effect.targetItemId !== null
                  ) {
                    effectObj.targetItemId = String(effect.targetItemId);
                  }
                  if (
                    effect.targetTaskId !== undefined &&
                    effect.targetTaskId !== null
                  ) {
                    effectObj.targetTaskId = String(effect.targetTaskId);
                  }
                  if (
                    effect.targetCharacterId !== undefined &&
                    effect.targetCharacterId !== null
                  ) {
                    effectObj.targetCharacterId = String(
                      effect.targetCharacterId
                    );
                  }
                  if (
                    effect.description !== undefined &&
                    effect.description !== null
                  ) {
                    effectObj.description = String(effect.description);
                  }

                  return effectObj;
                });
            }

            // 處理檢定配置
            if (skillData.checkType === "contest" && skillData.contestConfig) {
              skillObj.contestConfig = skillData.contestConfig;
            } else if (
              skillData.checkType === "random" &&
              skillData.randomConfig
            ) {
              skillObj.randomConfig = skillData.randomConfig;
            }

            return skillObj;
          });

        // 先清空現有的 skills 陣列，然後完全替換
        // 這樣可以避免 Mongoose 根據 id 匹配並合併舊資料的問題
        characterDoc.skills = [];
        characterDoc.markModified("skills");

        // 然後設定新的 skills 陣列
        characterDoc.set("skills", skillsArray);
        characterDoc.markModified("skills");
      } else if (key === "items" && updateData.items) {
        // 對於 items 陣列，需要逐個建立 Mongoose 子文檔
        // 這樣 Mongoose 才能正確處理嵌套的 effects 欄位
        // 獲取當前資料庫中的 items（用於判斷是否為新道具）
        const currentItemsRef: MongoItem[] = character.items || [];
        const itemsArray = (
          updateData.items as Array<Record<string, unknown>>
        )
          .filter((itemData) => itemData && itemData.id)
          .map((itemData) => {
            // 建立新的道具物件，確保所有欄位都被包含
            const itemObj: Record<string, unknown> = {
              id: itemData.id,
              name: itemData.name,
              description: itemData.description || "",
              type: itemData.type,
              quantity: itemData.quantity || 1,
              usageCount: itemData.usageCount || 0,
              isTransferable: itemData.isTransferable !== undefined ? itemData.isTransferable : true,
              acquiredAt: itemData.acquiredAt || new Date(),
            };

            if (itemData.imageUrl !== undefined)
              itemObj.imageUrl = itemData.imageUrl;
            if (itemData.usageLimit !== undefined)
              itemObj.usageLimit = itemData.usageLimit;
            if (itemData.cooldown !== undefined)
              itemObj.cooldown = itemData.cooldown;
            if (itemData.lastUsedAt !== undefined)
              itemObj.lastUsedAt = itemData.lastUsedAt;

            // 處理 effects，確保所有欄位都被包含
            // 關鍵修復：必須明確處理所有情況，包括空陣列
            if (itemData.effects !== undefined && itemData.effects !== null) {
              if (Array.isArray(itemData.effects)) {
                if (itemData.effects.length > 0) {
                  // 有效果，處理並保存
                  itemObj.effects = itemData.effects
                    .filter(
                      (effect: Record<string, unknown>) => effect && effect.type
                    )
                    .map((effect: Record<string, unknown>) => {
                      const effectObj: Record<string, unknown> = {
                        type: effect.type,
                      };

                      // Phase 6.5 / Phase 7: 目標設定
                      if (
                        effect.targetType !== undefined &&
                        effect.targetType !== null
                      ) {
                        effectObj.targetType = String(effect.targetType);
                      }
                      if (
                        effect.requiresTarget !== undefined &&
                        effect.requiresTarget !== null
                      ) {
                        effectObj.requiresTarget = Boolean(effect.requiresTarget);
                      }

                      // 明確設定所有欄位
                      if (
                        effect.targetStat !== undefined &&
                        effect.targetStat !== null
                      ) {
                        effectObj.targetStat = String(effect.targetStat);
                      }
                      if (effect.value !== undefined && effect.value !== null) {
                        effectObj.value = Number(effect.value);
                      }
                      if (
                        effect.statChangeTarget !== undefined &&
                        effect.statChangeTarget !== null
                      ) {
                        effectObj.statChangeTarget = String(
                          effect.statChangeTarget
                        );
                      }
                      if (
                        effect.syncValue !== undefined &&
                        effect.syncValue !== null
                      ) {
                        effectObj.syncValue = Boolean(effect.syncValue);
                      }
                      if (
                        effect.targetItemId !== undefined &&
                        effect.targetItemId !== null
                      ) {
                        effectObj.targetItemId = String(effect.targetItemId);
                      }
                      if (
                        effect.duration !== undefined &&
                        effect.duration !== null
                      ) {
                        effectObj.duration = Number(effect.duration);
                      }
                      if (
                        effect.description !== undefined &&
                        effect.description !== null
                      ) {
                        effectObj.description = String(effect.description);
                      }

                      return effectObj;
                    });
                  // 如果過濾後沒有有效效果，設置為空陣列
                  if (!itemObj.effects || (Array.isArray(itemObj.effects) && itemObj.effects.length === 0)) {
                    itemObj.effects = [];
                  }
                } else {
                  // 空陣列：明確清空效果
                  itemObj.effects = [];
                }
              } else {
                // 如果不是陣列，設置為空陣列（明確清空效果）
                itemObj.effects = [];
              }
            } else {
              // 如果 itemData.effects 是 undefined，不設置 itemObj.effects（保留資料庫原值）
              // 但對於新道具，這會導致 effects 不被保存，所以我們需要檢查是否是新道具
              // 如果是新道具（資料庫中沒有），且前端沒有傳 effects，設置為空陣列
              const isNewItem = !currentItemsRef.some((i: MongoItem) => i.id === itemData.id);
              if (isNewItem) {
                // 新道具，設置為空陣列（確保 effects 欄位存在）
                itemObj.effects = [];
              }
              // 如果是舊道具且 itemData.effects 是 undefined，不設置 itemObj.effects（保留資料庫原值）
            }

            // 處理檢定配置
            if (itemData.checkType !== undefined) {
              itemObj.checkType = itemData.checkType;
            }
            if (itemData.checkType === "contest" && itemData.contestConfig) {
              itemObj.contestConfig = itemData.contestConfig;
            } else if (
              itemData.checkType === "random" &&
              itemData.randomConfig
            ) {
              itemObj.randomConfig = itemData.randomConfig;
            }

            // 清除舊的 effect 欄位（向後兼容）
            delete itemObj.effect;

            return itemObj;
          });

        // 先清空現有的 items 陣列，然後完全替換
        // 這樣可以避免 Mongoose 根據 id 匹配並合併舊資料的問題
        characterDoc.items = [];
        characterDoc.markModified("items");

        // 然後設定新的 items 陣列
        characterDoc.set("items", itemsArray);
        characterDoc.markModified("items");
      } else {
        characterDoc.set(key, updateData[key]);
      }
    });

    // 儲存文件
    await characterDoc.save();

    // 轉換為 lean 物件以便後續處理
    const updatedCharacter = characterDoc.toObject();

    if (!updatedCharacter) {
      return {
        success: false,
        error: "UPDATE_FAILED",
        message: "更新失敗",
      };
    }

    revalidatePath(`/games/${updatedCharacter.gameId.toString()}`);

    // 清理 secretInfo 中的 _id 以確保純物件可傳遞給 Client Component
    const cleanSecretInfo = updatedCharacter.secretInfo?.secrets
      ? {
          secrets: cleanSecretData(updatedCharacter.secretInfo.secrets),
        }
      : undefined;

    // 清理 tasks 中的 _id（確保 boolean 欄位有預設值）
    const cleanTasks = cleanTaskData(updatedCharacter.tasks).map((task) => ({
      ...task,
      description: task.description || "",
      gmNotes: task.gmNotes || "",
      revealCondition: task.revealCondition || "",
      createdAt: task.createdAt || new Date(),
    }));

    // 清理 items 中的 _id
    const cleanItems = cleanItemData(updatedCharacter.items);

    // 清理 stats 中的 _id
    const cleanStats = cleanStatData(updatedCharacter.stats);

    // 清理 skills 中的 _id
    const cleanSkills = cleanSkillData(updatedCharacter.skills);

    // WebSocket 事件：角色更新（只推送有變動的數值）
    const changedStats = cleanStats
      .map((stat: MongoStat) => {
        const before = (character.stats || []).find(
          (s: { id: string }) => s.id === stat.id
        );
        const newValue = stat.value ?? before?.value;
        const newMax = stat.maxValue ?? before?.maxValue;

        const valueChanged = before ? newValue !== before.value : true;
        const hasBeforeMax =
          before?.maxValue !== undefined && before?.maxValue !== null;
        const hasNewMax = newMax !== undefined && newMax !== null;
        const maxChanged =
          hasBeforeMax && hasNewMax
            ? newMax !== before!.maxValue
            : !hasBeforeMax && hasNewMax;

        if (valueChanged || maxChanged) {
          return {
            ...stat,
            value: newValue,
            maxValue: hasNewMax ? newMax : undefined,
            deltaValue:
              valueChanged && before && newValue !== undefined
                ? newValue - before.value
                : undefined,
            deltaMax:
              maxChanged && hasBeforeMax && hasNewMax
                ? (newMax as number) - (before!.maxValue as number)
                : undefined,
          };
        }
        return null;
      })
      .filter(
        (
          s:
            | MongoStat
            | (MongoStat & { deltaValue?: number; deltaMax?: number })
            | null
        ): s is MongoStat & { deltaValue?: number; deltaMax?: number } =>
          Boolean(s)
      );

    const basicChanged =
      (data.name !== undefined && data.name !== character.name) ||
      (data.description !== undefined &&
        data.description !== character.description) ||
      (data.hasPinLock !== undefined &&
        data.hasPinLock !== character.hasPinLock) ||
      (data.publicInfo !== undefined &&
        JSON.stringify(data.publicInfo) !==
          JSON.stringify(character.publicInfo || {})) ||
      (data.secretInfo !== undefined &&
        JSON.stringify(data.secretInfo) !==
          JSON.stringify(character.secretInfo || {}));

    const statsChanged = changedStats.length > 0;
    const skillsOrTasksChanged =
      (data.skills !== undefined &&
        JSON.stringify(data.skills) !==
          JSON.stringify(character.skills || [])) ||
      (data.tasks !== undefined &&
        JSON.stringify(data.tasks) !== JSON.stringify(character.tasks || []));

    // WebSocket：角色更新（不包含單純的道具變動）
    if (basicChanged || statsChanged || skillsOrTasksChanged) {
      emitRoleUpdated(characterId, {
        characterId,
        updates: {
          name: updatedCharacter.name,
          avatar: updatedCharacter.imageUrl,
          publicInfo: updatedCharacter.publicInfo,
          items: cleanItems,
          stats: statsChanged ? (changedStats as unknown as Record<string, unknown>[]) : undefined,
          skills: cleanSkills as unknown as Record<string, unknown>[],
        },
      }).catch((error) => console.error("Failed to emit role.updated", error));
    }

    // WebSocket：道具事件
    if (inventoryDiffs.length > 0) {
      inventoryDiffs.forEach((diff) => {
        emitInventoryUpdated(characterId, {
          characterId,
          item: diff.item,
          action: diff.action,
        }).catch((error) =>
          console.error("Failed to emit role.inventoryUpdated", error)
        );
      });
    }

    return {
      success: true,
      data: {
        id: updatedCharacter._id.toString(),
        gameId: updatedCharacter.gameId.toString(),
        name: updatedCharacter.name,
        description: updatedCharacter.description,
        imageUrl: updatedCharacter.imageUrl,
        hasPinLock: updatedCharacter.hasPinLock,
        publicInfo: updatedCharacter.publicInfo,
        secretInfo: cleanSecretInfo,
        tasks: cleanTasks,
        items: cleanItems,
        stats: cleanStats,
        skills: cleanSkills,
        createdAt: updatedCharacter.createdAt,
        updatedAt: updatedCharacter.updatedAt,
      },
      message: "角色更新成功",
    };
  } catch (error) {
    console.error("Error updating character:", error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "VALIDATION_ERROR",
        message: error.issues[0]?.message || "驗證失敗",
      };
    }

    return {
      success: false,
      error: "UPDATE_FAILED",
      message: "無法更新角色",
    };
  }
}
