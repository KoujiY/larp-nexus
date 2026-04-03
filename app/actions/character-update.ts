"use server";

import { revalidatePath } from "next/cache";
import { withAction } from "@/lib/actions/action-wrapper";
import { Character } from "@/lib/db/models";
import { getCurrentGMUserId } from "@/lib/auth/session";
import { getCharacterData } from "@/lib/game/get-character-data";
import type { ApiResponse } from "@/types/api";
import type { CharacterData } from "@/types/character";
import { serializePublicInfo } from "@/lib/character/normalize-background";
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
  validateSecrets,
} from "@/lib/character/character-validator";
import {
  updateCharacterStats,
  updateCharacterSkills,
  updateCharacterItems,
  updateCharacterTasks,
  updateCharacterSecrets,
  updateCharacterPublicInfo,
} from "@/lib/character/field-updaters";
import type { MongoItem, MongoSecret, MongoTask } from "@/lib/db/types/mongo-helpers";
import type { UpdateCharacterInput } from "./character-update-types";
import { emitUpdateSideEffects, type InventoryDiff } from "./character-update-side-effects";

/**
 * 更新角色（Server Action）
 *
 * 職責：驗證 → 欄位更新 → 持久化 → 序列化 → 副作用（WS/auto-reveal/log）
 * 型別定義見 character-update-types.ts
 * 副作用邏輯見 character-update-side-effects.ts
 */
export async function updateCharacter(
  characterId: string,
  data: UpdateCharacterInput,
): Promise<ApiResponse<CharacterData>> {
  return withAction(async () => {
    // ── 1. Auth ──────────────────────────────────
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: "UNAUTHORIZED", message: "請先登入" };
    }

    const accessValidation = await validateCharacterAccess(characterId, gmUserId);
    if (!accessValidation.success || !accessValidation.character) {
      return {
        success: false,
        error: accessValidation.error || "VALIDATION_FAILED",
        message: accessValidation.message || "驗證失敗",
      };
    }
    const character = accessValidation.character;

    // ── 2. Before snapshot（變更偵測基準）──────────
    const characterDoc = await getCharacterData(characterId);
    const beforeState = JSON.parse(JSON.stringify(characterDoc.toObject()));

    // ── 3. Basic field validation ────────────────
    const basicValidation = validateCharacterData({
      name: data.name,
      description: data.description,
      hasPinLock: data.hasPinLock,
      pin: data.pin,
    });
    if (!basicValidation.success) {
      return {
        success: false,
        error: basicValidation.error || "VALIDATION_ERROR",
        message: basicValidation.message || "驗證失敗",
      };
    }

    // PIN uniqueness within same game
    if (data.hasPinLock && data.pin) {
      const existing = await Character.findOne({
        gameId: character.gameId,
        pin: data.pin,
        _id: { $ne: characterId },
      });
      if (existing) {
        return {
          success: false,
          error: "DUPLICATE_ERROR",
          message: "此 PIN 在本遊戲中已被使用，請選擇其他 PIN",
        };
      }
    }

    // ── 4. Build update data ─────────────────────
    let buildResult: ReturnType<typeof buildUpdateData>;
    try {
      buildResult = buildUpdateData(data, beforeState);
    } catch (e) {
      if (e instanceof ValidationError) {
        return { success: false, error: e.code, message: e.message };
      }
      throw e;
    }
    const { updateData, inventoryDiffs, hasManualSecretReveal, unrevealedViewedItemIds } = buildResult;

    // ── 5. Persist to Mongoose ───────────────────
    // 清除被重置為未揭露的 viewedItems
    if (unrevealedViewedItemIds.size > 0) {
      const existingViewedItems: Array<{ itemId: string; sourceCharacterId: string; viewedAt: Date }> =
        (characterDoc.get("viewedItems") as Array<{ itemId: string; sourceCharacterId: string; viewedAt: Date }>) || [];
      characterDoc.set(
        "viewedItems",
        existingViewedItems.filter((v) => !unrevealedViewedItemIds.has(v.itemId)),
      );
      characterDoc.markModified("viewedItems");
    }

    applyUpdateToDocument(characterDoc as unknown as Parameters<typeof applyUpdateToDocument>[0], updateData);
    await characterDoc.save();

    const updatedCharacter = characterDoc.toObject();
    if (!updatedCharacter) {
      return { success: false, error: "UPDATE_FAILED", message: "更新失敗" };
    }

    revalidatePath(`/games/${updatedCharacter.gameId.toString()}`);

    // ── 6. Serialize response ────────────────────
    const cleanSecretInfo = updatedCharacter.secretInfo?.secrets
      ? { secrets: cleanSecretData(updatedCharacter.secretInfo.secrets) }
      : undefined;
    const cleanTasks = cleanTaskData(updatedCharacter.tasks).map((task) => ({
      ...task,
      description: task.description || "",
      revealCondition: task.revealCondition || "",
      createdAt: task.createdAt || new Date(),
    }));
    const cleanItems = cleanItemData(updatedCharacter.items);
    const cleanStats = cleanStatData(updatedCharacter.stats);
    const cleanSkills = cleanSkillData(updatedCharacter.skills);

    // ── 7. Side effects (WS + auto-reveal + log) ─
    await emitUpdateSideEffects({
      characterId,
      gmUserId,
      data,
      beforeState,
      updatedCharacter,
      cleanStats,
      cleanItems,
      cleanSkills,
      inventoryDiffs,
      hasManualSecretReveal,
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
        publicInfo: serializePublicInfo(updatedCharacter.publicInfo),
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
  });
}

// ─── Internal helpers ─────────────────────────────

type BuildResult = {
  updateData: Record<string, unknown>;
  inventoryDiffs: InventoryDiff[];
  hasManualSecretReveal: boolean;
  unrevealedViewedItemIds: Set<string>;
};

/**
 * 依據輸入資料和 before snapshot 建構 updateData
 *
 * 負責各欄位的 validation → field-updater 轉換，
 * 並收集副作用所需的中繼資料（inventoryDiffs、manual reveal flag、viewedItems 清理）。
 */
function buildUpdateData(
  data: UpdateCharacterInput,
  beforeState: Record<string, unknown>,
): BuildResult {
  const updateData: Record<string, unknown> = {};
  let hasManualSecretReveal = false;
  const unrevealedViewedItemIds = new Set<string>();
  let inventoryDiffs: InventoryDiff[] = [];

  // Basic fields
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.hasPinLock !== undefined) updateData.hasPinLock = data.hasPinLock;
  if (data.pin !== undefined) updateData.pin = data.pin;

  // publicInfo
  if (data.publicInfo !== undefined) {
    updateData.publicInfo = updateCharacterPublicInfo(
      data.publicInfo,
      beforeState.publicInfo as import("@/lib/db/models").CharacterDocument["publicInfo"],
    );
  }

  // secretInfo
  if (data.secretInfo !== undefined) {
    const validation = validateSecrets(data.secretInfo.secrets);
    if (!validation.success) {
      throw new ValidationError(validation.error || "VALIDATION_ERROR", validation.message || "Secrets 驗證失敗");
    }
    const currentSecrets = ((beforeState.secretInfo as Record<string, unknown>)?.secrets || []) as MongoSecret[];
    updateData.secretInfo = { secrets: updateCharacterSecrets(data.secretInfo.secrets, currentSecrets) };

    for (const newSecret of data.secretInfo.secrets) {
      const oldSecret = currentSecrets.find((s) => s.id === newSecret.id);
      if (!oldSecret) continue;
      if (newSecret.isRevealed && !oldSecret.isRevealed) hasManualSecretReveal = true;
      if (!newSecret.isRevealed && oldSecret.isRevealed) {
        const autoReveal = oldSecret.autoRevealCondition as Record<string, unknown> | undefined;
        if (autoReveal?.type === "items_viewed" && Array.isArray(autoReveal.itemIds)) {
          for (const itemId of autoReveal.itemIds as string[]) unrevealedViewedItemIds.add(itemId);
        }
      }
    }
  }

  // stats
  if (data.stats !== undefined) {
    const validation = validateStats(data.stats);
    if (!validation.success) {
      throw new ValidationError(validation.error || "VALIDATION_ERROR", validation.message || "Stats 驗證失敗");
    }
    updateData.stats = updateCharacterStats(data.stats);
  }

  // tasks
  if (data.tasks !== undefined) {
    const validation = validateTasks(data.tasks);
    if (!validation.success) {
      throw new ValidationError(validation.error || "VALIDATION_ERROR", validation.message || "Tasks 驗證失敗");
    }
    const currentTasks = (beforeState.tasks || []) as MongoTask[];
    updateData.tasks = updateCharacterTasks(data.tasks, currentTasks);

    for (const newTask of data.tasks) {
      const oldTask = currentTasks.find((t) => t.id === newTask.id);
      if (!oldTask) continue;
      if (!newTask.isRevealed && oldTask.isRevealed) {
        const autoReveal = oldTask.autoRevealCondition as Record<string, unknown> | undefined;
        if (autoReveal?.type === "items_viewed" && Array.isArray(autoReveal.itemIds)) {
          for (const itemId of autoReveal.itemIds as string[]) unrevealedViewedItemIds.add(itemId);
        }
      }
    }
  }

  // items
  if (data.items !== undefined) {
    const validation = validateItems(data.items);
    if (!validation.success) {
      throw new ValidationError(validation.error || "VALIDATION_ERROR", validation.message || "Items 驗證失敗");
    }
    const currentItems = (beforeState.items || []) as MongoItem[];
    const result = updateCharacterItems(data.items, currentItems);
    updateData.items = result.items;
    inventoryDiffs = result.inventoryDiffs;
  }

  // skills
  if (data.skills !== undefined) {
    const validation = validateSkills(data.skills);
    if (!validation.success) {
      throw new ValidationError(validation.error || "VALIDATION_ERROR", validation.message || "Skills 驗證失敗");
    }
    updateData.skills = updateCharacterSkills(data.skills);
  }

  return { updateData, inventoryDiffs, hasManualSecretReveal, unrevealedViewedItemIds };
}

/** Validation error — 由 buildUpdateData 拋出，主函式 catch 後轉換為 API response */
class ValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/** 陣列子文檔與巢狀物件的 Mongoose 寫入策略 */
const REPLACE_ARRAY_FIELDS = new Set(["skills", "items", "tasks"]);
const NESTED_FIELDS = new Set(["secretInfo", "publicInfo"]);

/**
 * 將 updateData 套用到 Mongoose document
 *
 * 陣列子文檔需先清空再設定（避免 Mongoose 根據 _id 合併舊資料），
 * 巢狀物件同理（避免 autoRevealCondition 等欄位遺失）。
 */
function applyUpdateToDocument(
  doc: { set(key: string, val: unknown): void; markModified(key: string): void } & Record<string, unknown>,
  updateData: Record<string, unknown>,
): void {
  for (const key of Object.keys(updateData)) {
    if (REPLACE_ARRAY_FIELDS.has(key)) {
      const cleanData = JSON.parse(JSON.stringify(updateData[key]));
      (doc as unknown as Record<string, unknown>)[key] = [];
      doc.markModified(key);
      doc.set(key, cleanData);
      doc.markModified(key);
    } else if (NESTED_FIELDS.has(key)) {
      const cleanData = JSON.parse(JSON.stringify(updateData[key]));
      (doc as unknown as Record<string, unknown>)[key] = {};
      doc.markModified(key);
      doc.set(key, cleanData);
      doc.markModified(key);
    } else {
      doc.set(key, updateData[key]);
    }
  }
}
