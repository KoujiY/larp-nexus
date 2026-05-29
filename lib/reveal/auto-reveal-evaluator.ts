/**
 * Phase 7.7: 自動揭露條件評估引擎
 *
 * 負責評估角色的隱藏資訊和隱藏目標是否滿足自動揭露條件，
 * 並在條件達成時執行揭露操作（更新 DB + 發送事件）。
 *
 * 連鎖邏輯：先處理隱藏資訊 → 再處理隱藏目標（含 secrets_revealed 條件）
 *          → 最後處理技能/物品可見性（含 same-layer chain，限一輪）
 * 使用迴圈而非遞迴，限制為 2 層（隱藏目標揭露不會再觸發其他揭露）
 */
import Character from '@/lib/db/models/Character';
import CharacterRuntime from '@/lib/db/models/CharacterRuntime';
import { getCharacterData } from '@/lib/game/get-character-data';
import type { CharacterRuntimeDocument } from '@/lib/db/models/CharacterRuntime';
import type { AutoRevealCondition } from '@/types/character';
import {
  emitSecretRevealed, emitTaskRevealed,
  emitSkillRevealed, emitSkillHidden,
  emitItemRevealed, emitItemHidden,
} from './reveal-event-emitter';

/** 單次揭露結果 */
export interface RevealResult {
  type: 'secret' | 'task' | 'skill' | 'item';
  action: 'reveal' | 'hide';
  id: string;
  title: string;
  triggerReason: string;
}

/** 自動揭露觸發來源 */
export type RevealTrigger =
  | { type: 'items_viewed'; itemIds: string[] }
  | { type: 'items_acquired' }
  | { type: 'secret_revealed' }
  | { type: 'skill_used'; skillIds: string[] }
  | { type: 'item_used'; itemIds: string[] }
  | { type: 'skill_visibility_changed' }
  | { type: 'item_visibility_changed' }
  | { type: 'manual_reveal' }
  | { type: 'manual_hide' }
  | { type: 'preset_event' };

/** 隱藏資訊結構（從 CharacterDocument 簡化） */
// 註：autoRevealCondition 用寬鬆內聯型別（type: string）以接受 Mongoose lean
// 原始物件；toAutoRevealCondition 會驗證 type 並收斂為 AutoRevealCondition。
interface SecretEntry {
  id: string;
  title: string;
  isRevealed: boolean;
  autoRevealCondition?: {
    type: string;
    itemIds?: string[];
    secretIds?: string[];
    skillIds?: string[];
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
    skillIds?: string[];
    matchLogic?: string;
  };
}

/** 技能結構（從 CharacterDocument 簡化） */
interface SkillEntry {
  id: string;
  name: string;
  isHidden?: boolean;
  autoRevealCondition?: AutoRevealCondition;
}

/** 物品結構（從 CharacterDocument 簡化） */
interface ItemEntry {
  id: string;
  name: string;
  isHidden?: boolean;
  equipped?: boolean;
  autoRevealCondition?: AutoRevealCondition;
}

/** 條件評估上下文 */
interface ConditionContext {
  viewedItemIds: Set<string>;
  ownedItemIds: Set<string>;
  revealedSecretIds: Set<string>;
  usedSkillIds: Set<string>;
  usedItemIds: Set<string>;
  revealedSkillIds: Set<string>;
  revealedItemIds: Set<string>;
}

/**
 * 檢查單一條件是否滿足
 * @param condition - 自動揭露條件設定
 * @param context - 條件評估上下文
 * @returns 是否滿足條件
 */
function isConditionMet(
  condition: AutoRevealCondition,
  context: ConditionContext
): boolean {
  const logic = condition.matchLogic ?? 'and';
  const match = (ids: string[] | undefined, pool: Set<string>) => {
    const list = ids ?? [];
    if (list.length === 0) return false;
    return logic === 'or' ? list.some((id) => pool.has(id)) : list.every((id) => pool.has(id));
  };
  switch (condition.type) {
    case 'items_viewed': return match(condition.itemIds, context.viewedItemIds);
    case 'items_acquired': return match(condition.itemIds, context.ownedItemIds);
    case 'secrets_revealed': return match(condition.secretIds, context.revealedSecretIds);
    case 'skills_revealed': return match(condition.skillIds, context.revealedSkillIds);
    case 'items_revealed': return match(condition.itemIds, context.revealedItemIds);
    case 'skill_used': return match(condition.skillIds, context.usedSkillIds);
    case 'item_used': return match(condition.itemIds, context.usedItemIds);
    case 'none':
    default: return false;
  }
}

/**
 * 將 Mongoose 子文檔的 autoRevealCondition 原始物件轉為 AutoRevealCondition
 */
const VALID_CONDITION_TYPES: ReadonlySet<AutoRevealCondition['type']> = new Set([
  'items_viewed', 'items_acquired', 'secrets_revealed',
  'skills_revealed', 'items_revealed', 'skill_used', 'item_used',
]);

function toAutoRevealCondition(
  raw: {
    type: string;
    itemIds?: string[];
    secretIds?: string[];
    skillIds?: string[];
    matchLogic?: string;
  } | AutoRevealCondition | undefined
): AutoRevealCondition | null {
  if (!raw || raw.type === 'none') return null;
  // 驗證而非盲目 cast：DB 若殘留舊 schema 的未知 type，視為無條件（return null），
  // 避免任意字串穿透到 isConditionMet
  if (!VALID_CONDITION_TYPES.has(raw.type as AutoRevealCondition['type'])) return null;
  return {
    type: raw.type as AutoRevealCondition['type'],
    itemIds: raw.itemIds,
    secretIds: raw.secretIds,
    skillIds: raw.skillIds,
    matchLogic: raw.matchLogic === 'or' ? 'or' : 'and',
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
  const context: ConditionContext = {
    viewedItemIds,
    ownedItemIds,
    revealedSecretIds: new Set<string>(),
    usedSkillIds: new Set<string>(),
    usedItemIds: new Set<string>(),
    revealedSkillIds: new Set<string>(),
    revealedItemIds: new Set<string>(),
  };

  for (const secret of secrets) {
    // 跳過已揭露的
    if (secret.isRevealed) continue;
    // 跳過沒有自動揭露條件的
    const condition = toAutoRevealCondition(secret.autoRevealCondition);
    if (!condition) continue;

    if (isConditionMet(condition, context)) {
      const triggerReason = buildTriggerReason(condition);
      results.push({
        type: 'secret',
        action: 'reveal',
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
  const context: ConditionContext = {
    viewedItemIds,
    ownedItemIds,
    revealedSecretIds,
    usedSkillIds: new Set<string>(),
    usedItemIds: new Set<string>(),
    revealedSkillIds: new Set<string>(),
    revealedItemIds: new Set<string>(),
  };

  for (const task of tasks) {
    // 跳過非隱藏目標或已揭露的
    if (!task.isHidden || task.isRevealed) continue;
    // 跳過沒有自動揭露條件的
    const condition = toAutoRevealCondition(task.autoRevealCondition);
    if (!condition) continue;

    if (isConditionMet(condition, context)) {
      const triggerReason = buildTriggerReason(condition);
      results.push({
        type: 'task',
        action: 'reveal',
        id: task.id,
        title: task.title,
        triggerReason,
      });
    }
  }

  return results;
}

/**
 * 評估技能與物品的可見性條件（reveal-only，單一條件）
 * @returns 需要揭露的技能與物品列表
 */
function evaluateSkillItemConditions(
  skills: SkillEntry[],
  items: ItemEntry[],
  context: ConditionContext,
): RevealResult[] {
  const results: RevealResult[] = [];

  const evalOne = (entry: SkillEntry | ItemEntry, kind: 'skill' | 'item') => {
    if (!entry.isHidden || !entry.autoRevealCondition) return;
    const cond = toAutoRevealCondition(entry.autoRevealCondition);
    if (!cond || cond.type === 'none') return;
    if (isConditionMet(cond, context)) {
      results.push({
        type: kind,
        action: 'reveal',
        id: entry.id,
        title: entry.name,
        triggerReason: buildTriggerReason(cond),
      });
    }
  };

  for (const s of skills) evalOne(s, 'skill');
  for (const i of items) evalOne(i, 'item');

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
    case 'skill_used':
      return '滿足技能使用條件';
    case 'item_used':
      return '滿足道具使用條件';
    case 'skills_revealed':
      return '滿足技能揭露條件';
    case 'items_revealed':
      return '滿足道具揭露條件';
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
 * 6. 評估技能/物品可見性條件（含 same-layer chain，限一輪）
 * 7. 批量更新 DB
 * 8. 批量發送揭露事件
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
  const rawItems = character.items ?? [];

  // 2. 建立查找集合
  const viewedItemIds = new Set<string>(
    viewedItems.map((v: { itemId: string }) => v.itemId)
  );
  const ownedItemIds = new Set<string>(
    rawItems.map((i: { id: string }) => i.id)
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

  // 6. 評估技能/物品可見性條件
  const usedSkillIds = new Set<string>(
    trigger.type === 'skill_used' ? trigger.skillIds : []
  );
  const usedItemIds = new Set<string>(
    trigger.type === 'item_used' ? trigger.itemIds : []
  );

  const skillEntries: SkillEntry[] = (character.skills ?? []).map((s: {
    id: string; name: string; isHidden?: boolean;
    autoRevealCondition?: AutoRevealCondition;
  }) => ({
    id: s.id,
    name: s.name,
    isHidden: s.isHidden,
    autoRevealCondition: s.autoRevealCondition,
  }));

  const itemEntries: ItemEntry[] = rawItems.map((i: {
    id: string; name: string; isHidden?: boolean; equipped?: boolean;
    autoRevealCondition?: AutoRevealCondition;
  }) => ({
    id: i.id,
    name: i.name,
    isHidden: i.isHidden,
    equipped: i.equipped,
    autoRevealCondition: i.autoRevealCondition,
  }));

  // 建立已揭露的技能/物品 ID 集合（目前可見的）
  const revealedSkillIds = new Set<string>(
    skillEntries.filter((s) => !s.isHidden).map((s) => s.id)
  );
  const revealedItemIds = new Set<string>(
    itemEntries.filter((i) => !i.isHidden).map((i) => i.id)
  );

  const skillItemContext: ConditionContext = {
    viewedItemIds,
    ownedItemIds,
    revealedSecretIds,
    usedSkillIds,
    usedItemIds,
    revealedSkillIds,
    revealedItemIds,
  };

  // 第一輪：直接條件觸發
  const firstPassResults = evaluateSkillItemConditions(
    skillEntries, itemEntries, skillItemContext
  );

  // 建構第二輪 context（immutable：不修改原始 context）
  const updatedRevealedSkillIds = new Set(skillItemContext.revealedSkillIds);
  const updatedRevealedItemIds = new Set(skillItemContext.revealedItemIds);
  for (const r of firstPassResults) {
    if (r.type === 'skill') {
      if (r.action === 'reveal') updatedRevealedSkillIds.add(r.id);
      if (r.action === 'hide') updatedRevealedSkillIds.delete(r.id);
    }
    if (r.type === 'item') {
      if (r.action === 'reveal') updatedRevealedItemIds.add(r.id);
      if (r.action === 'hide') updatedRevealedItemIds.delete(r.id);
    }
  }
  const secondPassContext: ConditionContext = {
    ...skillItemContext,
    revealedSkillIds: updatedRevealedSkillIds,
    revealedItemIds: updatedRevealedItemIds,
  };

  // 第二輪：same-layer chain（skills_revealed / items_revealed）
  const firstPassKeys = new Set(firstPassResults.map((r) => `${r.type}:${r.id}:${r.action}`));
  const secondPassResults = evaluateSkillItemConditions(
    skillEntries, itemEntries, secondPassContext
  ).filter((r) => !firstPassKeys.has(`${r.type}:${r.id}:${r.action}`));

  const skillItemResults = [...firstPassResults, ...secondPassResults];

  const allResults = [...secretResults, ...taskResults, ...skillItemResults];

  // 如果沒有任何揭露，直接返回
  if (allResults.length === 0) return [];

  // 7. 批量更新 DB — 使用原始陣列的索引
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

  const rawSkills = character.skills ?? [];
  const rawItemsForUpdate = character.items ?? [];
  for (const result of skillItemResults) {
    if (result.type === 'skill') {
      const idx = rawSkills.findIndex(
        (s: { id: string }) => s.id === result.id
      );
      if (idx !== -1) {
        const isHiding = result.action === 'hide';
        updateOps[`skills.${idx}.isHidden`] = isHiding;
        updateOps[`skills.${idx}.hiddenAt`] = isHiding ? now : null;
      }
    } else if (result.type === 'item') {
      const idx = rawItemsForUpdate.findIndex(
        (i: { id: string }) => i.id === result.id
      );
      if (idx !== -1) {
        const isHiding = result.action === 'hide';
        updateOps[`items.${idx}.isHidden`] = isHiding;
        updateOps[`items.${idx}.hiddenAt`] = isHiding ? now : null;
        // 隱藏裝備中的物品時，同時取消裝備
        if (isHiding) {
          const entry = itemEntries.find((i) => i.id === result.id);
          if (entry?.equipped) {
            updateOps[`items.${idx}.equipped`] = false;
          }
        }
      }
    }
  }

  if (Object.keys(updateOps).length > 0) {
    // Phase 11: 使用正確的 Model（Baseline 或 Runtime）更新
    await UpdateModel.findByIdAndUpdate(documentId, { $set: updateOps });
  }

  // 8. 批量發送揭露事件
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
    } else if (result.type === 'task') {
      emitTaskRevealed(characterIdStr, {
        characterId: characterIdStr,
        taskId: result.id,
        taskTitle: result.title,
        revealType: 'auto',
        triggerReason: result.triggerReason,
      }).catch((error) =>
        console.error('[auto-reveal] Failed to emit task.revealed', error)
      );
    } else if (result.type === 'skill') {
      if (result.action === 'reveal') {
        emitSkillRevealed(characterIdStr, {
          characterId: characterIdStr,
          skillId: result.id,
          skillName: result.title,
          revealType: 'auto',
          triggerReason: result.triggerReason,
        }).catch((error) =>
          console.error('[auto-reveal] Failed to emit skill.revealed', error)
        );
      } else {
        emitSkillHidden(characterIdStr, {
          characterId: characterIdStr,
          skillId: result.id,
          skillName: result.title,
          hideType: 'auto',
          triggerReason: result.triggerReason,
        }).catch((error) =>
          console.error('[auto-reveal] Failed to emit skill.hidden', error)
        );
      }
    } else if (result.type === 'item') {
      if (result.action === 'reveal') {
        emitItemRevealed(characterIdStr, {
          characterId: characterIdStr,
          itemId: result.id,
          itemName: result.title,
          revealType: 'auto',
          triggerReason: result.triggerReason,
        }).catch((error) =>
          console.error('[auto-reveal] Failed to emit item.revealed', error)
        );
      } else {
        emitItemHidden(characterIdStr, {
          characterId: characterIdStr,
          itemId: result.id,
          itemName: result.title,
          hideType: 'auto',
          triggerReason: result.triggerReason,
        }).catch((error) =>
          console.error('[auto-reveal] Failed to emit item.hidden', error)
        );
      }
    }
  }

  const skillItemCount = skillItemResults.length;
  console.info(
    `[auto-reveal] Character ${characterIdStr}: revealed ${secretResults.length} secrets, ${taskResults.length} tasks, ${skillItemCount} skill/item changes (trigger: ${trigger.type})`
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
