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
  effect?: {
    type: "stat_change" | "buff" | "custom";
    targetStat?: string;
    value?: number;
    statChangeTarget?: "value" | "maxValue";
    syncValue?: boolean;
    duration?: number;
    description?: string;
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
      effect?: {
        type: "stat_change" | "buff" | "custom";
        targetStat?: string;
        value?: number;
        duration?: number;
        description?: string;
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
      updateData.items = data.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        type: item.type,
        quantity: item.quantity,
        effect: item.effect,
        usageLimit: item.usageLimit,
        usageCount: item.usageCount || 0,
        cooldown: item.cooldown,
        lastUsedAt: item.lastUsedAt,
        isTransferable: item.isTransferable,
        acquiredAt: item.acquiredAt || new Date(),
      }));

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

            // Phase 6.5: 目標設定
            const effectAny = effect as Record<string, unknown>;
            const normalizedTargetType =
              (effectAny.targetType as "self" | "other" | "any" | undefined) ??
              "self";
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
