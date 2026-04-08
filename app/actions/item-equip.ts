'use server';

import { revalidatePath } from 'next/cache';
import { withAction } from '@/lib/actions/action-wrapper';
import { validatePlayerAccess } from '@/lib/auth/session';
import { getCharacterData } from '@/lib/game/get-character-data';
import { updateCharacterData } from '@/lib/game/update-character-data';
import { emitEquipmentToggled, emitRoleUpdated } from '@/lib/websocket/events';
import { writeLog } from '@/lib/logs/write-log';
import { buildEquipmentBoostDeltas } from '@/lib/item/apply-equipment-boosts';
import type { ApiResponse } from '@/types/api';
import type { Stat, StatBoost } from '@/types/character';

/**
 * 執行時檢查 statBoosts 陣列結構（取代 `as` 強制轉型）
 *
 * 確認每筆 boost 至少具備合法 statName / numeric value，並將 target
 * 正規化為預設 'both'。不合法的條目會被過濾掉，避免後續 delta 計算
 * 因不信任的資料而崩潰。
 */
function sanitizeStatBoosts(raw: unknown): StatBoost[] {
  if (!Array.isArray(raw)) return [];
  const safe: StatBoost[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const statName = typeof obj.statName === 'string' ? obj.statName : null;
    const value = typeof obj.value === 'number' && Number.isFinite(obj.value) ? obj.value : null;
    if (!statName || value === null) continue;
    const targetRaw = obj.target;
    const target: StatBoost['target'] =
      targetRaw === 'value' || targetRaw === 'maxValue' || targetRaw === 'both'
        ? targetRaw
        : 'both';
    safe.push({ statName, value, target });
  }
  return safe;
}

/**
 * 切換裝備狀態（裝備/卸除）
 *
 * 僅限 type === 'equipment' 的物品。切換 equipped 布林值並將 statBoosts
 * materialize 至 base stats，推送 WebSocket 通知 GM/玩家端。
 *
 * 並發安全性：
 * - `items.$[target].equipped` 透過 arrayFilters 以 `itemId` 為鍵更新，
 *   避免 `items.${index}.equipped` 在並發新增/刪除/轉移時誤寫到其他物品。
 * - `stats` 使用 `$inc` + arrayFilters（以 `stat.id` 為鍵），以相對量更新
 *   value / maxValue。相對更新對並發 `$inc` 具交換律，避免 absolute `$set`
 *   的 lost-write（例如裝備寫入瞬間玩家受傷的 HP 扣減不會被覆蓋）。
 *
 * 註：卸除時的「最大值恢復規則」與時效性效果過期（check-expired-effects.ts）
 * 完全一致，詳見 lib/item/apply-equipment-boosts.ts 檔案 header。
 */
export async function toggleEquipment(
  characterId: string,
  itemId: string,
): Promise<ApiResponse<{ equipped: boolean }>> {
  return withAction(async () => {
    // 驗證玩家權限
    if (!(await validatePlayerAccess(characterId))) {
      return { success: false, error: 'UNAUTHORIZED', message: '未授權操作此角色（請嘗試重新整理頁面並重新解鎖）' };
    }

    // 讀取角色資料（自動判斷 Baseline/Runtime）
    const character = await getCharacterData(characterId);
    const items = (character.items || []) as Array<Record<string, unknown>>;
    const item = items.find((i) => (i as { id: string }).id === itemId) as
      | (Record<string, unknown> & { id: string; type?: string; equipped?: boolean; name?: string; statBoosts?: unknown })
      | undefined;

    if (!item) {
      return { success: false, error: 'NOT_FOUND', message: '找不到此物品' };
    }

    // 只有 equipment 類型可以裝備/卸除
    if (item.type !== 'equipment') {
      return { success: false, error: 'INVALID_TYPE', message: '此物品不是裝備類型' };
    }

    const newEquipped = !item.equipped;
    // M-4: runtime guard 取代原本的 as 轉型
    const statBoosts = sanitizeStatBoosts(item.statBoosts);

    // 計算 stat deltas（相對量更新 + 廣播用的 expected 值）
    // - 裝備時套用 boost
    // - 卸除時依照最大值恢復規則反向（與時效性效果過期邏輯一致）
    const currentStats = (character.stats || []) as Stat[];
    const deltas = buildEquipmentBoostDeltas(
      currentStats,
      statBoosts,
      newEquipped ? 'apply' : 'revert',
    );

    // 組合 update spec：
    // - $set items.$[target].equipped（arrayFilter 以 id 為鍵）
    // - $inc stats.$[s{i}].value / .maxValue（arrayFilter 以 stat.id 為鍵）
    const setUpdates: Record<string, unknown> = {
      'items.$[target].equipped': newEquipped,
    };
    const incUpdates: Record<string, number> = {};
    const arrayFilters: Array<Record<string, unknown>> = [
      { 'target.id': itemId },
    ];

    deltas.forEach((delta, index) => {
      const key = `s${index}`;
      let used = false;
      if (delta.valueDelta !== 0) {
        incUpdates[`stats.$[${key}].value`] = delta.valueDelta;
        used = true;
      }
      if (delta.maxValueDelta !== 0) {
        incUpdates[`stats.$[${key}].maxValue`] = delta.maxValueDelta;
        used = true;
      }
      if (used) {
        arrayFilters.push({ [`${key}.id`]: delta.statId });
      }
    });

    const updateOp: Record<string, unknown> = { $set: setUpdates };
    if (Object.keys(incUpdates).length > 0) {
      updateOp.$inc = incUpdates;
    }

    await updateCharacterData(characterId, updateOp, { arrayFilters });

    // L-2: 省去第二次 DB 讀取，改為本地計算廣播資料
    // 註：expected 值假設「寫入瞬間無並發變動」，若有並發變動，後續動作
    //      或下一次 role.updated 事件會自然糾正。
    const deltaById = new Map(deltas.map((d) => [d.statId, d]));
    const broadcastItems = items.map((it) =>
      (it as { id: string }).id === itemId ? { ...it, equipped: newEquipped } : it,
    );
    const broadcastStats = currentStats.map((s) => {
      const d = deltaById.get(s.id);
      if (!d) {
        return { id: s.id, name: s.name, value: s.value, maxValue: s.maxValue };
      }
      return {
        id: s.id,
        name: s.name,
        value: d.expectedValue,
        maxValue: d.expectedMaxValue,
      };
    });

    // 推送 WebSocket：通知玩家端 items 與 stats 同步更新
    // silentSync: 此 role.updated 為副作用同步事件，玩家端不產生通知
    // （裝備切換的玩家通知由 equipment.toggled 處理），GM 端 useRoleUpdated
    // 預設過濾，避免重複 refresh / sticky bar
    await emitRoleUpdated(characterId, {
      characterId,
      silentSync: true,
      updates: {
        items: broadcastItems,
        stats: broadcastStats,
      },
    });

    // 推送裝備切換事件（GM 端監聽）
    await emitEquipmentToggled(characterId, {
      characterId,
      itemId,
      itemName: item.name as string,
      equipped: newEquipped,
      statBoosts,
    });

    // GM 事件紀錄
    const gameId = character.gameId?.toString();
    if (gameId) {
      await writeLog({
        gameId,
        characterId,
        actorType: 'character',
        actorId: characterId,
        action: 'equipment_toggle',
        details: {
          itemName: item.name,
          equipped: newEquipped,
          statBoosts,
        },
      });
    }

    revalidatePath(`/character/${characterId}`);
    // GM 編輯頁也需要 revalidate，才能讓 router.refresh() 讀到最新的 items
    if (gameId) {
      revalidatePath(`/games/${gameId}/characters/${characterId}`);
      revalidatePath(`/games/${gameId}`);
    }

    return {
      success: true,
      data: { equipped: newEquipped },
    };
  });
}
