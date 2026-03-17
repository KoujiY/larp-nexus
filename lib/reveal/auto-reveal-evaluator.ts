/**
 * Phase 7.7: 自動揭露條件評估引擎
 *
 * 負責評估角色的隱藏資訊和隱藏目標是否滿足自動揭露條件，
 * 並在條件達成時執行揭露操作（更新 DB + 發送事件）。
 *
 * 連鎖邏輯：先處理隱藏資訊 → 再處理隱藏目標（含 secrets_revealed 條件）
 * 使用迴圈而非遞迴，限制為 2 層（隱藏目標揭露不會再觸發其他揭露）
 */
import Character from '@/lib/db/models/Character';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import { getCharacterData } from '@/lib/game/get-character-data';
import type { CharacterRuntimeDocument } from '@/lib/db/models/CharacterRuntime';
import type { AutoRevealCondition } from '@/types/character';
import { emitSecretRevealed, emitTaskRevealed } from './reveal-event-emitter';

/** 單次揭露結果 */
export interface RevealResult {
  type: 'secret' | 'task';
  id: string;
  title: string;
  triggerReason: string;
}

/** 自動揭露觸發來源 */
export type RevealTrigger =
  | { type: 'items_viewed'; itemIds: string[] }
  | { type: 'items_acquired' }
  | { type: 'secret_revealed' }
  | { type: 'manual_reveal' };

/** 隱藏資訊結構（從 CharacterDocument 簡化） */
interface SecretEntry {
  id: string;
  title: string;
  isRevealed: boolean;
  autoRevealCondition?: {
    type: string;
    itemIds?: string[];
    secretIds?: string[];
    matchLogic?: string;
  };
}

/** 隱藏目標結構（從 CharacterDocument 簡化） */
interface TaskEntry {
  id: string;
  title: string;
  isHidden: boolean;
  isRevealed: boolean;
  autoRevealCondition?: {
    type: string;
    itemIds?: string[];
    secretIds?: string[];
    matchLogic?: string;
  };
}

/**
 * 檢查單一條件是否滿足
 * @param condition - 自動揭露條件設定
 * @param viewedItemIds - 角色已檢視的道具 ID 集合
 * @param ownedItemIds - 角色背包中的道具 ID 集合
 * @param revealedSecretIds - 角色已揭露的隱藏資訊 ID 集合
 * @returns 是否滿足條件
 */
function isConditionMet(
  condition: AutoRevealCondition,
  viewedItemIds: Set<string>,
  ownedItemIds: Set<string>,
  revealedSecretIds: Set<string>
): boolean {
  if (condition.type === 'none') return false;

  if (condition.type === 'items_viewed') {
    const targetIds = condition.itemIds ?? [];
    if (targetIds.length === 0) return false;

    const matchLogic = condition.matchLogic ?? 'and';
    if (matchLogic === 'and') {
      return targetIds.every((id) => viewedItemIds.has(id));
    } else {
      return targetIds.some((id) => viewedItemIds.has(id));
    }
  }

  if (condition.type === 'items_acquired') {
    const targetIds = condition.itemIds ?? [];
    if (targetIds.length === 0) return false;

    const matchLogic = condition.matchLogic ?? 'and';
    if (matchLogic === 'and') {
      return targetIds.every((id) => ownedItemIds.has(id));
    } else {
      return targetIds.some((id) => ownedItemIds.has(id));
    }
  }

  if (condition.type === 'secrets_revealed') {
    const targetIds = condition.secretIds ?? [];
    if (targetIds.length === 0) return false;

    const matchLogic = condition.matchLogic ?? 'and';
    if (matchLogic === 'and') {
      return targetIds.every((id) => revealedSecretIds.has(id));
    } else {
      return targetIds.some((id) => revealedSecretIds.has(id));
    }
  }

  return false;
}

/**
 * 將 Mongoose 子文檔的 autoRevealCondition 轉為 AutoRevealCondition
 */
function toAutoRevealCondition(
  raw: SecretEntry['autoRevealCondition'] | TaskEntry['autoRevealCondition']
): AutoRevealCondition | null {
  if (!raw || raw.type === 'none') return null;
  return {
    type: raw.type as AutoRevealCondition['type'],
    itemIds: raw.itemIds,
    secretIds: raw.secretIds,
    matchLogic: raw.matchLogic as AutoRevealCondition['matchLogic'],
  };
}

/**
 * 評估隱藏資訊的揭露條件
 * @returns 需要揭露的隱藏資訊列表
 */
function evaluateSecretConditions(
  secrets: SecretEntry[],
  viewedItemIds: Set<string>,
  ownedItemIds: Set<string>
): RevealResult[] {
  const results: RevealResult[] = [];
  // secrets_revealed 不適用於隱藏資訊，傳入空集合
  const emptySecretIds = new Set<string>();

  for (const secret of secrets) {
    // 跳過已揭露的
    if (secret.isRevealed) continue;
    // 跳過沒有自動揭露條件的
    const condition = toAutoRevealCondition(secret.autoRevealCondition);
    if (!condition) continue;

    if (isConditionMet(condition, viewedItemIds, ownedItemIds, emptySecretIds)) {
      const triggerReason = buildTriggerReason(condition);
      results.push({
        type: 'secret',
        id: secret.id,
        title: secret.title,
        triggerReason,
      });
    }
  }

  return results;
}

/**
 * 評估隱藏目標的揭露條件
 * @param revealedSecretIds - 包含本次新揭露的隱藏資訊 ID
 * @returns 需要揭露的隱藏目標列表
 */
function evaluateTaskConditions(
  tasks: TaskEntry[],
  viewedItemIds: Set<string>,
  ownedItemIds: Set<string>,
  revealedSecretIds: Set<string>
): RevealResult[] {
  const results: RevealResult[] = [];

  for (const task of tasks) {
    // 跳過非隱藏目標或已揭露的
    if (!task.isHidden || task.isRevealed) continue;
    // 跳過沒有自動揭露條件的
    const condition = toAutoRevealCondition(task.autoRevealCondition);
    if (!condition) continue;

    if (isConditionMet(condition, viewedItemIds, ownedItemIds, revealedSecretIds)) {
      const triggerReason = buildTriggerReason(condition);
      results.push({
        type: 'task',
        id: task.id,
        title: task.title,
        triggerReason,
      });
    }
  }

  return results;
}

/**
 * 建構觸發原因描述
 */
function buildTriggerReason(condition: AutoRevealCondition): string {
  switch (condition.type) {
    case 'items_viewed':
      return '滿足道具檢視條件';
    case 'items_acquired':
      return '滿足道具取得條件';
    case 'secrets_revealed':
      return '滿足隱藏資訊揭露條件';
    default:
      return '自動揭露';
  }
}

/**
 * 統一入口：執行自動揭露評估與更新
 *
 * 流程：
 * 1. 從 DB 讀取最新角色資料
 * 2. 建立查找集合（viewedItemIds, ownedItemIds, revealedSecretIds）
 * 3. 評估所有未揭露的隱藏資訊 → 揭露符合條件的
 * 4. 更新 revealedSecretIds（加入剛揭露的）
 * 5. 評估所有未揭露的隱藏目標 → 揭露符合條件的（含連鎖）
 * 6. 批量更新 DB
 * 7. 批量發送揭露事件
 *
 * @param characterId - 要檢查的角色 ID
 * @param trigger - 觸發來源（用於日誌）
 * @returns 所有揭露結果
 */
export async function executeAutoReveal(
  characterId: string,
  trigger: RevealTrigger
): Promise<RevealResult[]> {
  // 1. 讀取最新角色資料（Phase 11: 自動判斷 Baseline/Runtime）
  let character;
  try {
    character = await getCharacterData(characterId);
  } catch {
    console.warn(`[auto-reveal] Character not found: ${characterId}`);
    return [];
  }

  // Phase 11: 判斷是 Runtime 還是 Baseline，決定更新時使用的 Model
  const isRuntime = !!(character as CharacterRuntimeDocument).refId;
  const UpdateModel = isRuntime ? CharacterRuntime : Character;
  const documentId = character._id;

  const secrets: SecretEntry[] = (character.secretInfo?.secrets ?? []).map((s: {
    id: string; title: string; isRevealed: boolean;
    autoRevealCondition?: { type: string; itemIds?: string[]; matchLogic?: string };
  }) => ({
    id: s.id,
    title: s.title,
    isRevealed: s.isRevealed,
    autoRevealCondition: s.autoRevealCondition,
  }));

  const tasks: TaskEntry[] = (character.tasks ?? []).map((t: {
    id: string; title: string; isHidden: boolean; isRevealed: boolean;
    autoRevealCondition?: { type: string; itemIds?: string[]; secretIds?: string[]; matchLogic?: string };
  }) => ({
    id: t.id,
    title: t.title,
    isHidden: t.isHidden,
    isRevealed: t.isRevealed,
    autoRevealCondition: t.autoRevealCondition,
  }));

  const viewedItems = character.viewedItems ?? [];
  const items = character.items ?? [];

  // 2. 建立查找集合
  const viewedItemIds = new Set<string>(
    viewedItems.map((v: { itemId: string }) => v.itemId)
  );
  const ownedItemIds = new Set<string>(
    items.map((i: { id: string }) => i.id)
  );
  const revealedSecretIds = new Set(
    secrets.filter((s) => s.isRevealed).map((s) => s.id)
  );

  // 3. 評估隱藏資訊
  const secretResults = evaluateSecretConditions(
    secrets,
    viewedItemIds,
    ownedItemIds
  );

  // 4. 更新 revealedSecretIds（加入剛揭露的）
  for (const result of secretResults) {
    revealedSecretIds.add(result.id);
  }

  // 5. 評估隱藏目標（含 secrets_revealed 連鎖）
  const taskResults = evaluateTaskConditions(
    tasks,
    viewedItemIds,
    ownedItemIds,
    revealedSecretIds
  );

  const allResults = [...secretResults, ...taskResults];

  // 如果沒有任何揭露，直接返回
  if (allResults.length === 0) return [];

  // 6. 批量更新 DB — 使用原始陣列的索引
  const now = new Date();
  const updateOps: Record<string, unknown> = {};

  const rawSecrets = character.secretInfo?.secrets ?? [];
  for (const result of secretResults) {
    const idx = rawSecrets.findIndex(
      (s: { id: string }) => s.id === result.id
    );
    if (idx !== -1) {
      updateOps[`secretInfo.secrets.${idx}.isRevealed`] = true;
      updateOps[`secretInfo.secrets.${idx}.revealedAt`] = now;
    }
  }

  const rawTasks = character.tasks ?? [];
  for (const result of taskResults) {
    const idx = rawTasks.findIndex(
      (t: { id: string }) => t.id === result.id
    );
    if (idx !== -1) {
      updateOps[`tasks.${idx}.isRevealed`] = true;
      updateOps[`tasks.${idx}.revealedAt`] = now;
    }
  }

  if (Object.keys(updateOps).length > 0) {
    // Phase 11: 使用正確的 Model（Baseline 或 Runtime）更新
    await UpdateModel.findByIdAndUpdate(documentId, { $set: updateOps });
  }

  // 7. 批量發送揭露事件
  const characterIdStr = characterId.toString();
  for (const result of allResults) {
    if (result.type === 'secret') {
      emitSecretRevealed(characterIdStr, {
        characterId: characterIdStr,
        secretId: result.id,
        secretTitle: result.title,
        revealType: 'auto',
        triggerReason: result.triggerReason,
      }).catch((error) =>
        console.error('[auto-reveal] Failed to emit secret.revealed', error)
      );
    } else {
      emitTaskRevealed(characterIdStr, {
        characterId: characterIdStr,
        taskId: result.id,
        taskTitle: result.title,
        revealType: 'auto',
        triggerReason: result.triggerReason,
      }).catch((error) =>
        console.error('[auto-reveal] Failed to emit task.revealed', error)
      );
    }
  }

  console.info(
    `[auto-reveal] Character ${characterIdStr}: revealed ${secretResults.length} secrets, ${taskResults.length} tasks (trigger: ${trigger.type})`
  );

  return allResults;
}

/**
 * 檢查隱藏資訊揭露後是否有連鎖觸發的隱藏目標
 * 用於 GM 手動揭露隱藏資訊時的連鎖觸發
 *
 * @param characterId - 角色 ID
 * @returns 連鎖揭露的結果
 */
export async function executeChainRevealForSecrets(
  characterId: string
): Promise<RevealResult[]> {
  return executeAutoReveal(characterId, { type: 'secret_revealed' });
}
