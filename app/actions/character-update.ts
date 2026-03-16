"use server";

import { revalidatePath } from "next/cache";
import dbConnect from "@/lib/db/mongodb";
import { Character } from "@/lib/db/models";
import { getCurrentGMUserId } from "@/lib/auth/session";
import { getCharacterData } from "@/lib/game/get-character-data"; // Phase 10.4: 統一讀取
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
import {
  validateCharacterData,
  validateCharacterAccess,
  validateStats,
  validateSkills,
  validateItems,
  validateTasks,
} from "@/lib/character/character-validator";
import { executeAutoReveal, executeChainRevealForSecrets } from "@/lib/reveal/auto-reveal-evaluator";
import {
  updateCharacterStats,
  updateCharacterSkills,
  updateCharacterItems,
  updateCharacterTasks,
  updateCharacterSecrets,
  updateCharacterPublicInfo,
} from "@/lib/character/field-updaters";
import { writeLog } from "@/lib/logs/write-log"; // Phase 10.6

// Phase 3.3: MongoDB 類型定義已移至 field-updaters.ts
// MongoDB lean() 返回的類型（可能包含 _id）
// 注意：MongoItem 類型定義在 field-updaters.ts 中，這裡只保留必要的類型引用
type MongoItem = NonNullable<import('@/lib/db/models').CharacterDocument['items']>[number] & { _id?: unknown };

interface MongoStat {
  id: string;
  name: string;
  value: number;
  maxValue?: number;
  _id?: unknown;
}

// Phase 3.3: 驗證邏輯已移至 lib/character/character-validator.ts

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
        // Phase 7.7: 自動揭露條件
        autoRevealCondition?: {
          type: string;
          itemIds?: string[];
          secretIds?: string[];
          matchLogic?: string;
        };
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
      // Phase 7.7: 自動揭露條件
      autoRevealCondition?: {
        type: string;
        itemIds?: string[];
        secretIds?: string[];
        matchLogic?: string;
      };
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
      // Phase 7.6: 標籤系統
      tags?: string[];
      // Phase 8: 檢定系統（Phase 7.6: 擴展為包含 random_contest）
      checkType?: "none" | "contest" | "random" | "random_contest";
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
      // Phase 7.6: 標籤系統
      tags?: string[];
      // Phase 7.6: 擴展為包含 random_contest
      checkType: "none" | "contest" | "random" | "random_contest";
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

    // Phase 3.3: 使用驗證模組驗證角色訪問權限
    const accessValidation = await validateCharacterAccess(characterId, gmUserId);
    if (!accessValidation.success || !accessValidation.character) {
      return {
        success: false,
        error: accessValidation.error || 'VALIDATION_FAILED',
        message: accessValidation.message || '驗證失敗',
      };
    }
    const character = accessValidation.character;

    // Phase 3.3: 使用驗證模組驗證角色基本資料
    const characterDataValidation = validateCharacterData({
      name: data.name,
      description: data.description,
      hasPinLock: data.hasPinLock,
      pin: data.pin,
    });
    if (!characterDataValidation.success) {
      return {
        success: false,
        error: characterDataValidation.error || 'VALIDATION_ERROR',
        message: characterDataValidation.message || '驗證失敗',
      };
    }

    // Phase 10.9.2: 檢查 PIN 在同遊戲內的唯一性（編輯時排除自己）
    if (data.hasPinLock && data.pin) {
      const existingCharacter = await Character.findOne({
        gameId: character.gameId,
        pin: data.pin,
        _id: { $ne: characterId }, // 排除當前角色
      });

      if (existingCharacter) {
        return {
          success: false,
          error: 'DUPLICATE_ERROR',
          message: '此 PIN 在本遊戲中已被使用，請選擇其他 PIN',
        };
      }
    }

    // 更新資料
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.hasPinLock !== undefined) {
      updateData.hasPinLock = data.hasPinLock;
    }
    if (data.pin !== undefined) {
      updateData.pin = data.pin;
    }

    // Phase 3.3: 使用欄位更新模組處理 publicInfo 更新
    if (data.publicInfo !== undefined) {
      const currentPublicInfo = character.publicInfo;
      updateData.publicInfo = updateCharacterPublicInfo(data.publicInfo, currentPublicInfo);
    }

    // Phase 3.3: 使用欄位更新模組處理 secretInfo 更新
    // Phase 7.7: 記錄手動揭露的隱藏資訊（用於連鎖揭露觸發）
    let hasManualSecretReveal = false;
    if (data.secretInfo !== undefined) {
      const currentSecrets = character.secretInfo?.secrets || [];
      const secretsResult = updateCharacterSecrets(data.secretInfo.secrets, currentSecrets);

      updateData.secretInfo = { secrets: secretsResult };

      // Phase 7.7: 檢查是否有隱藏資訊從未揭露變為已揭露（GM 手動揭露）
      for (const newSecret of data.secretInfo.secrets) {
        if (newSecret.isRevealed) {
          const oldSecret = currentSecrets.find((s: { id: string }) => s.id === newSecret.id);
          if (oldSecret && !oldSecret.isRevealed) {
            hasManualSecretReveal = true;
            break;
          }
        }
      }
    }

    // Phase 3.3: 使用驗證和更新模組處理 stats 更新
    if (data.stats !== undefined) {
      const statsValidation = validateStats(data.stats);
      if (!statsValidation.success) {
        return {
          success: false,
          error: statsValidation.error || 'VALIDATION_ERROR',
          message: statsValidation.message || 'Stats 驗證失敗',
        };
      }
      updateData.stats = updateCharacterStats(data.stats);
    }

    // Phase 3.3: 使用驗證和更新模組處理 tasks 更新
    if (data.tasks !== undefined) {
      const tasksValidation = validateTasks(data.tasks);
      if (!tasksValidation.success) {
        return {
          success: false,
          error: tasksValidation.error || 'VALIDATION_ERROR',
          message: tasksValidation.message || 'Tasks 驗證失敗',
        };
      }
      const currentTasks = character.tasks || [];
      updateData.tasks = updateCharacterTasks(data.tasks, currentTasks);
    }

    // Phase 3.3: 使用驗證和更新模組處理 items 更新
    let inventoryDiffs: Array<{
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
      const itemsValidation = validateItems(data.items);
      if (!itemsValidation.success) {
        return {
          success: false,
          error: itemsValidation.error || 'VALIDATION_ERROR',
          message: itemsValidation.message || 'Items 驗證失敗',
        };
      }
      const currentItems: MongoItem[] = character.items || [];
      const itemsResult = updateCharacterItems(data.items, currentItems);
      updateData.items = itemsResult.items;
      inventoryDiffs = itemsResult.inventoryDiffs;
    }

    // Phase 3.3: 使用驗證和更新模組處理 skills 更新
    if (data.skills !== undefined) {
      const skillsValidation = validateSkills(data.skills);
      if (!skillsValidation.success) {
        return {
          success: false,
          error: skillsValidation.error || 'VALIDATION_ERROR',
          message: skillsValidation.message || 'Skills 驗證失敗',
        };
      }
      updateData.skills = updateCharacterSkills(data.skills);
    }

    // Phase 10.4: 使用統一的讀取函數（自動判斷 Baseline/Runtime）
    // 取得文件，手動更新後再 save，Mongoose 會自動保存到正確的 collection
    const characterDoc = await getCharacterData(characterId);

    // 將 field-updaters 產出的資料套用到 Mongoose 文件
    // field-updaters 已處理完所有資料轉換（tags 標準化、effects 處理、檢定配置等），
    // 這裡只負責 Mongoose 文件的寫入策略
    const REPLACE_ARRAY_FIELDS = new Set(['skills', 'items']);
    const NESTED_FIELDS = new Set(['secretInfo', 'publicInfo']);

    Object.keys(updateData).forEach((key) => {
      if (REPLACE_ARRAY_FIELDS.has(key)) {
        // 陣列子文檔：先清空再設定，避免 Mongoose 根據 _id 合併舊資料
        // JSON 深拷貝移除 Mongoose 內部屬性，確保乾淨寫入
        const cleanData = JSON.parse(JSON.stringify(updateData[key]));
        (characterDoc as unknown as Record<string, unknown>)[key] = [];
        characterDoc.markModified(key);
        characterDoc.set(key, cleanData);
        characterDoc.markModified(key);
      } else if (NESTED_FIELDS.has(key)) {
        // 巢狀物件內含陣列子文檔（如 secretInfo.secrets）：
        // 同樣需要 JSON 深拷貝 + 先清空再設定，
        // 避免 Mongoose 合併舊的巢狀陣列資料導致欄位遺失（如 autoRevealCondition）
        const cleanData = JSON.parse(JSON.stringify(updateData[key]));
        (characterDoc as unknown as Record<string, unknown>)[key] = {};
        characterDoc.markModified(key);
        characterDoc.set(key, cleanData);
        characterDoc.markModified(key);
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

    // Phase 7.7: GM 新增道具後，觸發自動揭露評估（items_acquired）
    const hasNewItems = inventoryDiffs.some((diff) => diff.action === "added");
    if (hasNewItems) {
      executeAutoReveal(characterId, { type: "items_acquired" })
        .catch((error) => console.error("[character-update] Failed to execute auto-reveal for items_acquired", error));
    }

    // Phase 7.7: GM 手動揭露隱藏資訊後，觸發連鎖揭露（secrets_revealed → 隱藏目標）
    if (hasManualSecretReveal) {
      executeChainRevealForSecrets(characterId)
        .catch((error) => console.error("[character-update] Failed to execute chain reveal for secrets", error));
    }

    // Phase 10.6: 記錄 GM 更新角色日誌
    await writeLog({
      gameId: updatedCharacter.gameId.toString(),
      characterId,
      actorType: "gm",
      actorId: gmUserId,
      action: "gm_update",
      details: {
        characterName: updatedCharacter.name,
        updatedFields: Object.keys(updateData),
        hasStatsChange: statsChanged,
        hasItemsChange: inventoryDiffs.length > 0,
        hasSkillsChange: data.skills !== undefined,
        hasTasksChange: data.tasks !== undefined,
        hasSecretReveal: hasManualSecretReveal,
      },
    });

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

    // Phase 3.3: 驗證錯誤已在驗證模組中處理，這裡只處理其他錯誤
    return {
      success: false,
      error: "UPDATE_FAILED",
      message: "無法更新角色",
    };
  }
}
