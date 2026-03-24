/**
 * 技能/道具使用相關事件映射器
 * mapSkillContest, mapSkillUsed, mapItemUsed
 */

import type { BaseEvent } from '@/types/event';
import type { SkillContestEvent, SkillUsedEvent, ItemUsedEvent } from '@/types/event';
import type { Notification } from './types';

// ─── 型別 ─────────────────────────────────────────────────────────────────────

type ContestPayload = SkillContestEvent['payload'];

// ─── 攻擊方結果映射（純函數） ──────────────────────────────────────────────────

/**
 * 映射攻擊方的對抗結果通知
 */
function mapAttackerResult(
  event: BaseEvent,
  payload: ContestPayload,
  title: string,
  sourceName: string,
  actionType: string
): Notification[] {
  const isSuccess = payload.result === 'attacker_wins';

  if (isSuccess) {
    // 攻擊方獲勝：等待含效果的完整通知
    if (!payload.effectsApplied || payload.effectsApplied.length === 0) {
      return [];
    }
    const prefix = `對 ${payload.defenderName} 使用 ${sourceName}，${actionType}使用成功`;
    return payload.effectsApplied.map((effect, idx) => ({
      id: `evt-${event.timestamp}-${idx}`,
      title,
      message: `${prefix}，效果：${effect}`,
      type: event.type,
    }));
  }

  // 攻擊方失敗（defender_wins 或 both_fail）
  return [{
    id: `evt-${event.timestamp}`,
    title,
    message: `對 ${payload.defenderName} 使用 ${sourceName}，${actionType}使用失敗`,
    type: event.type,
  }];
}

// ─── 防守方結果映射（純函數） ──────────────────────────────────────────────────

/**
 * 映射防守方的對抗結果通知
 */
function mapDefenderResult(
  event: BaseEvent,
  payload: ContestPayload,
  title: string
): Notification[] {
  const isDefenderWins = payload.result === 'defender_wins';
  const hasDefenderSkills = payload.defenderSkills && payload.defenderSkills.length > 0;
  const hasDefenderItems = payload.defenderItems && payload.defenderItems.length > 0;
  const hasDefenderResponse = hasDefenderSkills || hasDefenderItems;

  // 防守方沒有使用技能/道具，不顯示通知
  if (!hasDefenderResponse) {
    return [];
  }

  if (!isDefenderWins) {
    // 防守方失敗，讓 skill.used 事件處理
    return [];
  }

  // 防守方獲勝且有回應 — 等待含效果的完整通知
  if (!payload.effectsApplied || payload.effectsApplied.length === 0) {
    return [];
  }

  // 決定防守方使用的技能/道具名稱
  const defenderSourceType = hasDefenderSkills ? 'skill' : 'item';
  const payloadSourceType = payload.sourceType || (payload.skillName ? 'skill' : 'item');

  // 防止前一個對抗的殘留值（sourceType 與防守方回應類型不一致）
  if (payloadSourceType !== defenderSourceType && payloadSourceType === (payload.skillName ? 'skill' : 'item')) {
    return [];
  }

  // Phase 7.6: 攻擊方有隱匿標籤時，隱藏名稱
  const targetName = payload.sourceHasStealthTag ? '某人' : payload.attackerName;

  if (payload.skillName && hasDefenderSkills) {
    const prefix = `對 ${targetName} 使用 ${payload.skillName}，技能使用成功`;
    return payload.effectsApplied.map((effect, idx) => ({
      id: `evt-${event.timestamp}-${idx}`,
      title,
      message: `${prefix}，效果：${effect}`,
      type: event.type,
    }));
  }

  if (payload.itemName && hasDefenderItems) {
    const prefix = `對 ${targetName} 使用 ${payload.itemName}，道具使用成功`;
    return payload.effectsApplied.map((effect, idx) => ({
      id: `evt-${event.timestamp}-${idx}`,
      title,
      message: `${prefix}，效果：${effect}`,
      type: event.type,
    }));
  }

  return [];
}

// ─── 主要 factory ─────────────────────────────────────────────────────────────

export function createSkillEventMappers(characterId: string) {
  /**
   * 映射技能對抗檢定事件
   */
  const mapSkillContest = (event: BaseEvent): Notification[] => {
    const payload = event.payload as ContestPayload;

    // 只處理結果事件（attackerValue !== 0），忽略請求事件
    if (payload.attackerValue === 0) {
      return [];
    }

    const characterIdStr = String(characterId);
    const isAttacker = String(payload.attackerId) === characterIdStr;
    const isDefender = String(payload.defenderId) === characterIdStr;

    if (!isAttacker && !isDefender) {
      return [];
    }

    // 決定來源類型與名稱
    let sourceType: 'skill' | 'item' = payload.sourceType || 'skill';
    let sourceName: string;

    if (payload.itemName) {
      sourceType = 'item';
      sourceName = payload.itemName;
    } else if (payload.skillName) {
      sourceType = 'skill';
      sourceName = payload.skillName;
    } else {
      sourceName = sourceType === 'item' ? '未知道具' : '未知技能';
    }

    const title = sourceType === 'item' ? '道具使用結果' : '技能使用結果';
    const actionType = sourceType === 'item' ? '道具' : '技能';

    // 若需選擇目標道具且尚無效果，跳過（等待完整通知）
    if (payload.needsTargetItemSelection === true && payload.result === 'attacker_wins' &&
        (!payload.effectsApplied || payload.effectsApplied.length === 0)) {
      return [];
    }

    if (isAttacker) {
      return mapAttackerResult(event, payload, title, sourceName, actionType);
    }

    return mapDefenderResult(event, payload, title);
  };

  /**
   * 映射技能使用事件
   */
  const mapSkillUsed = (event: BaseEvent): Notification[] => {
    const payload = event.payload as SkillUsedEvent['payload'];

    // 只處理當前角色的通知
    if (String(payload.characterId) !== String(characterId)) {
      return [];
    }

    // 對抗檢定：只處理防守方失敗的情況
    if (payload.checkType === 'contest' || payload.checkType === 'random_contest') {
      if (!payload.checkPassed) {
        // effectsApplied 為 undefined 表示攻擊方的對抗請求事件，不顯示
        if (payload.effectsApplied === undefined) {
          return [];
        }
        const title = '技能使用結果';
        const skillName = payload.skillName || '技能';
        const message = payload.targetCharacterName
          ? `對 ${payload.targetCharacterName} 使用 ${skillName}，技能使用失敗`
          : `使用 ${skillName}，技能使用失敗`;
        return [{ id: `evt-${event.timestamp}`, title, message, type: event.type }];
      }
      return [];
    }

    // 非對抗檢定
    const title = '技能使用結果';
    const skillName = payload.skillName || '技能';
    const prefix = payload.targetCharacterName
      ? `對 ${payload.targetCharacterName} 使用 ${skillName}`
      : `使用 ${skillName}`;

    if (payload.checkPassed) {
      if (payload.effectsApplied && payload.effectsApplied.length > 0) {
        return payload.effectsApplied.map((effect, idx) => ({
          id: `evt-${event.timestamp}-${idx}`,
          title,
          message: `${prefix}，技能使用成功，效果：${effect}`,
          type: event.type,
        }));
      }
      return [{ id: `evt-${event.timestamp}`, title, message: `${prefix}，技能使用成功`, type: event.type }];
    }

    const failParts = [prefix, '技能使用失敗'];
    if (payload.checkResult !== undefined) {
      failParts.push(`檢定結果：${payload.checkResult}`);
    }
    return [{ id: `evt-${event.timestamp}`, title, message: failParts.join('，'), type: event.type }];
  };

  /**
   * 映射道具使用事件
   */
  const mapItemUsed = (event: BaseEvent): Notification[] => {
    const payload = event.payload as ItemUsedEvent['payload'];

    // 只處理當前角色的通知
    if (String(payload.characterId) !== String(characterId)) {
      return [];
    }

    const title = '道具使用結果';
    const itemName = payload.itemName || '道具';
    const prefix = payload.targetCharacterName
      ? `對 ${payload.targetCharacterName} 使用 ${itemName}`
      : `使用 ${itemName}`;

    if (payload.checkPassed) {
      if (payload.effectsApplied && payload.effectsApplied.length > 0) {
        return payload.effectsApplied.map((effect, idx) => ({
          id: `evt-${event.timestamp}-${idx}`,
          title,
          message: `${prefix}，道具使用成功，效果：${effect}`,
          type: event.type,
        }));
      }
      return [{ id: `evt-${event.timestamp}`, title, message: `${prefix}，道具使用成功`, type: event.type }];
    }

    const failParts = [prefix, '道具使用失敗'];
    if (payload.checkResult !== undefined) {
      failParts.push(`檢定結果：${payload.checkResult}`);
    }
    return [{ id: `evt-${event.timestamp}`, title, message: failParts.join('，'), type: event.type }];
  };

  return { mapSkillContest, mapSkillUsed, mapItemUsed };
}
