/**
 * updateCharacter 的 post-save 副作用
 *
 * 負責：變更偵測、WebSocket 事件推送、自動揭露觸發、操作日誌寫入。
 * 從 character-update.ts 抽取以降低主函式複雜度。
 */

import { serializePublicInfo } from '@/lib/character/normalize-background';
import { emitRoleUpdated, emitInventoryUpdated } from '@/lib/websocket/events';
import { executeAutoReveal, executeChainRevealForSecrets } from '@/lib/reveal/auto-reveal-evaluator';
import { writeLog } from '@/lib/logs/write-log';
import type { MongoStat, MongoItem, MongoSkill } from '@/lib/db/types/mongo-helpers';
import type { InventoryDiff } from '@/lib/character/field-updaters';
import type { UpdateCharacterInput } from './character-update-types';

export type { InventoryDiff };

export type SideEffectParams = {
  characterId: string;
  gmUserId: string;
  data: UpdateCharacterInput;
  beforeState: Record<string, unknown>;
  updatedCharacter: Record<string, unknown>;
  cleanStats: MongoStat[];
  cleanItems: MongoItem[];
  cleanSkills: MongoSkill[];
  inventoryDiffs: InventoryDiff[];
  hasManualSecretReveal: boolean;
};

/**
 * 偵測 stats 中實際變動的項目，回傳含 delta 的陣列
 */
export function detectChangedStats(
  cleanStats: MongoStat[],
  beforeStats: MongoStat[],
): Array<MongoStat & { deltaValue?: number; deltaMax?: number }> {
  const mapped: Array<(MongoStat & { deltaValue?: number; deltaMax?: number }) | null> = cleanStats.map((stat) => {
    const before = beforeStats.find((s) => s.id === stat.id);
    const newValue = stat.value ?? before?.value;
    const newMax = stat.maxValue ?? before?.maxValue;

    const valueChanged = before ? newValue !== before.value : true;
    const hasBeforeMax = before?.maxValue !== undefined && before?.maxValue !== null;
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
        deltaValue: valueChanged && before && newValue !== undefined ? newValue - before.value : undefined,
        deltaMax: maxChanged && hasBeforeMax && hasNewMax ? (newMax as number) - (before!.maxValue as number) : undefined,
      };
    }
    return null;
  });
  return mapped.filter((s): s is MongoStat & { deltaValue?: number; deltaMax?: number } => s !== null);
}

/**
 * 執行所有 post-save 副作用（WebSocket、auto-reveal、logging）
 */
export async function emitUpdateSideEffects({
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
}: SideEffectParams): Promise<void> {
  const beforeStats: MongoStat[] = (beforeState.stats as MongoStat[]) || [];
  const changedStats = detectChangedStats(cleanStats, beforeStats);

  const basicChanged =
    (data.name !== undefined && data.name !== beforeState.name) ||
    (data.description !== undefined && data.description !== beforeState.description) ||
    (data.slogan !== undefined && data.slogan !== beforeState.slogan) ||
    (data.hasPinLock !== undefined && data.hasPinLock !== beforeState.hasPinLock) ||
    (data.publicInfo !== undefined &&
      JSON.stringify(data.publicInfo) !== JSON.stringify(beforeState.publicInfo || {})) ||
    (data.secretInfo !== undefined &&
      JSON.stringify(data.secretInfo) !== JSON.stringify(beforeState.secretInfo || {}));

  const statsChanged = changedStats.length > 0;
  const itemsChanged =
    data.items !== undefined && JSON.stringify(data.items) !== JSON.stringify(beforeState.items || []);
  const skillsChanged =
    data.skills !== undefined && JSON.stringify(data.skills) !== JSON.stringify(beforeState.skills || []);
  const tasksChanged =
    data.tasks !== undefined && JSON.stringify(data.tasks) !== JSON.stringify(beforeState.tasks || []);

  // WebSocket：角色更新
  if (basicChanged || statsChanged || itemsChanged || skillsChanged || tasksChanged) {
    emitRoleUpdated(characterId, {
      characterId,
      updates: {
        name: updatedCharacter.name as string,
        avatar: updatedCharacter.imageUrl as string | undefined,
        publicInfo: serializePublicInfo(updatedCharacter.publicInfo as Record<string, unknown>),
        items: itemsChanged ? (cleanItems as unknown as Record<string, unknown>[]) : undefined,
        stats: statsChanged ? (changedStats as unknown as Record<string, unknown>[]) : undefined,
        skills: skillsChanged ? (cleanSkills as unknown as Record<string, unknown>[]) : undefined,
      },
    }).catch((error) => console.error('Failed to emit role.updated', error));
  }

  // WebSocket：道具事件
  if (inventoryDiffs.length > 0) {
    inventoryDiffs.forEach((diff) => {
      emitInventoryUpdated(characterId, {
        characterId,
        item: diff.item,
        action: diff.action,
      }).catch((error) => console.error('Failed to emit role.inventoryUpdated', error));
    });
  }

  // Phase 7.7: 自動揭露觸發
  const hasNewItems = inventoryDiffs.some((diff) => diff.action === 'added');
  if (hasNewItems) {
    executeAutoReveal(characterId, { type: 'items_acquired' }).catch((error) =>
      console.error('[character-update] Failed to execute auto-reveal for items_acquired', error),
    );
  }

  if (hasManualSecretReveal) {
    executeChainRevealForSecrets(characterId).catch((error) =>
      console.error('[character-update] Failed to execute chain reveal for secrets', error),
    );
  }

  // Phase 10.6: 操作日誌
  const changedFields: string[] = [];
  if (data.name !== undefined && data.name !== beforeState.name) changedFields.push('name');
  if (data.description !== undefined && data.description !== beforeState.description) changedFields.push('description');
  if (data.hasPinLock !== undefined && data.hasPinLock !== beforeState.hasPinLock) changedFields.push('hasPinLock');
  if (data.pin !== undefined && data.pin !== beforeState.pin) changedFields.push('pin');
  if (data.publicInfo !== undefined) {
    const beforePub = (beforeState.publicInfo || {}) as Record<string, unknown>;
    const publicInfoChanged = Object.keys(data.publicInfo).some(
      (key) =>
        JSON.stringify((data.publicInfo as Record<string, unknown>)[key]) !==
        JSON.stringify(beforePub[key]),
    );
    if (publicInfoChanged) changedFields.push('publicInfo');
  }
  if (data.secretInfo !== undefined && JSON.stringify(data.secretInfo) !== JSON.stringify(beforeState.secretInfo || {}))
    changedFields.push('secretInfo');
  if (statsChanged) changedFields.push('stats');
  if (itemsChanged) changedFields.push('items');
  if (skillsChanged) changedFields.push('skills');
  if (tasksChanged) changedFields.push('tasks');

  if (changedFields.length > 0) {
    await writeLog({
      gameId: (updatedCharacter.gameId as { toString(): string }).toString(),
      characterId,
      actorType: 'gm',
      actorId: gmUserId,
      action: 'gm_update',
      details: {
        characterName: updatedCharacter.name,
        updatedFields: changedFields,
        hasStatsChange: statsChanged,
        hasItemsChange: inventoryDiffs.length > 0,
        hasSkillsChange: skillsChanged,
        hasTasksChange: tasksChanged,
        hasSecretReveal: hasManualSecretReveal,
      },
    });
  }
}
