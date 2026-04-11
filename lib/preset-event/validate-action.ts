import type { PresetEventAction } from '@/types/game';
import type { CharacterData } from '@/types/character';

export interface ActionValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * 驗證預設事件動作的引用是否有效
 *
 * 用於兩處：
 * 1. GM 編輯 UI — 標記無效動作（⚠️ badge）
 * 2. Runtime 執行前 — 決定是否跳過
 */
export function validatePresetAction(
  action: PresetEventAction,
  characters: CharacterData[],
): ActionValidationResult {
  const charMap = new Map(characters.map((c) => [c.id, c]));

  switch (action.type) {
    case 'broadcast': {
      const targets = action.broadcastTargets;
      if (targets === 'all') return { valid: true };
      if (!Array.isArray(targets) || targets.length === 0) {
        return { valid: false, reason: '未指定廣播目標' };
      }
      const missing = targets.filter((id) => !charMap.has(id));
      if (missing.length > 0) {
        return { valid: false, reason: `${missing.length} 個目標角色已不存在` };
      }
      return { valid: true };
    }

    case 'stat_change': {
      if (!action.statName) {
        return { valid: false, reason: '未指定數值名稱' };
      }
      const targets = action.statTargets;
      if (targets === 'all') {
        // 檢查是否至少有一個角色擁有此數值
        const hasAnyStat = characters.some((c) =>
          (c.stats || []).some((s) => s.name === action.statName),
        );
        if (!hasAnyStat) {
          return { valid: false, reason: `沒有角色擁有「${action.statName}」數值` };
        }
        return { valid: true };
      }
      if (!Array.isArray(targets) || targets.length === 0) {
        return { valid: false, reason: '未指定數值變更目標' };
      }
      const missing = targets.filter((id) => !charMap.has(id));
      if (missing.length > 0) {
        return { valid: false, reason: `${missing.length} 個目標角色已不存在` };
      }
      return { valid: true };
    }

    case 'reveal_secret': {
      if (!action.revealCharacterId) {
        return { valid: false, reason: '未指定目標角色' };
      }
      const char = charMap.get(action.revealCharacterId);
      if (!char) {
        return { valid: false, reason: '目標角色已不存在' };
      }
      if (!action.revealTargetId) {
        return { valid: false, reason: '未指定隱藏資訊' };
      }
      const secret = char.secretInfo?.secrets?.find((s) => s.id === action.revealTargetId);
      if (!secret) {
        return { valid: false, reason: '目標隱藏資訊已不存在' };
      }
      if (secret.isRevealed) {
        return { valid: false, reason: '目標隱藏資訊已揭露' };
      }
      return { valid: true };
    }

    case 'reveal_task': {
      if (!action.revealCharacterId) {
        return { valid: false, reason: '未指定目標角色' };
      }
      const char = charMap.get(action.revealCharacterId);
      if (!char) {
        return { valid: false, reason: '目標角色已不存在' };
      }
      if (!action.revealTargetId) {
        return { valid: false, reason: '未指定隱藏任務' };
      }
      const task = (char.tasks || []).find((t) => t.id === action.revealTargetId);
      if (!task) {
        return { valid: false, reason: '目標隱藏任務已不存在' };
      }
      if (!task.isHidden) {
        return { valid: false, reason: '目標任務不是隱藏任務' };
      }
      if (task.isRevealed) {
        return { valid: false, reason: '目標隱藏任務已揭露' };
      }
      return { valid: true };
    }

    default:
      return { valid: false, reason: `不支援的動作類型: ${action.type}` };
  }
}

/**
 * 批次驗證事件中所有動作
 *
 * @returns 每個 action.id 對應的驗證結果
 */
export function validatePresetEventActions(
  actions: PresetEventAction[],
  characters: CharacterData[],
): Map<string, ActionValidationResult> {
  const results = new Map<string, ActionValidationResult>();
  for (const action of actions) {
    results.set(action.id, validatePresetAction(action, characters));
  }
  return results;
}
