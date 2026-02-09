// WebSocket 事件相關類型定義
export interface BaseEvent<T = unknown> {
  type: string;
  timestamp: number;
  payload: T;
}

export interface RoleUpdatedEvent extends BaseEvent<{
  characterId: string;
  updates: {
    name?: string;
    avatar?: string;
    publicInfo?: Record<string, unknown>;
    tasks?: Array<Record<string, unknown>>;
    items?: Array<Record<string, unknown>>;
    stats?: Array<Record<string, unknown>>;
    skills?: Array<Record<string, unknown>>;
  };
}> {
  type: 'role.updated';
}

export interface GameBroadcastEvent extends BaseEvent<{
  gameId: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high';
  data?: Record<string, unknown>;
}> {
  type: 'game.broadcast';
}

export interface SecretUnlockedEvent extends BaseEvent<{
  characterId: string;
  secretInfo: {
    secrets: Array<{
      title: string;
      content: string;
    }>;
    hiddenGoals: string;
  };
}> {
  type: 'role.secretUnlocked';
}

export interface RoleMessageEvent extends BaseEvent<{
  characterId: string;
  from: string;
  title: string;
  message: string;
  style?: 'info' | 'warning' | 'success' | 'error';
}> {
  type: 'role.message';
}

export interface TaskUpdatedEvent extends BaseEvent<{
  characterId: string;
  task: {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    createdAt?: string;
  };
  action: 'added' | 'updated' | 'deleted';
}> {
  type: 'role.taskUpdated';
}

export interface InventoryUpdatedEvent extends BaseEvent<{
  characterId: string;
  item: {
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    acquiredAt?: string;
  };
  action: 'added' | 'updated' | 'deleted';
}> {
  type: 'role.inventoryUpdated';
}

export interface SkillUsedEvent extends BaseEvent<{
  characterId: string;
  skillId: string;
  skillName: string;
  checkType: 'none' | 'contest' | 'random' | 'random_contest'; // Phase 7.6: 新增 random_contest
  checkPassed: boolean;
  checkResult?: number;
  effectsApplied?: string[];
  targetCharacterId?: string; // 目標角色 ID（對抗檢定時使用）
  targetCharacterName?: string; // 目標角色名稱（對抗檢定時使用）
}> {
  type: 'skill.used';
}

export interface SkillCooldownEvent extends BaseEvent<{
  characterId: string;
  skillId: string;
  remainingSeconds: number;
}> {
  type: 'skill.cooldown';
}

export interface SkillContestEvent extends BaseEvent<{
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  skillId?: string; // Phase 8: 改為可選，支援道具檢定
  skillName?: string; // Phase 8: 改為可選，支援道具檢定
  itemId?: string; // Phase 8: 道具檢定時使用
  itemName?: string; // Phase 8: 道具檢定時使用
  sourceType?: 'skill' | 'item'; // Phase 8: 來源類型
  attackerValue: number;
  defenderValue: number;
  attackerItems?: string[];
  attackerSkills?: string[];
  defenderItems?: string[];
  defenderSkills?: string[];
  result: 'attacker_wins' | 'defender_wins' | 'both_fail';
  effectsApplied?: string[];
  // Phase 7: 對抗檢定配置（用於限制防守方可使用的道具/技能數量）
  opponentMaxItems?: number;
  opponentMaxSkills?: number;
  // Phase 7: 目標道具 ID（用於 item_take 和 item_steal 效果）
  targetItemId?: string;
  // Phase 8: 是否需要攻擊方選擇目標道具（判定失敗後才選擇）
  needsTargetItemSelection?: boolean;
  // Phase 7.6: 檢定類型（contest 或 random_contest）
  checkType?: 'contest' | 'random_contest';
  // Phase 7.6: 數值判定名稱（contest 類型時使用）
  relatedStat?: string;
  // Phase 7.6: 隨機對抗檢定上限值（random_contest 類型時使用）
  randomContestMaxValue?: number;
  // Phase 7.6: 對抗檢定 ID（用於追蹤系統）
  contestId?: string;
  // Phase 2: 事件子類型（用於區分請求/結果/效果）
  subType?: 'request' | 'result' | 'effect';
  // Phase 7.6: 攻擊方是否有戰鬥標籤（用於決定防守方是否需要戰鬥標籤）
  attackerHasCombatTag?: boolean;
  // Phase 7.6: 來源是否具有「隱匿」標籤（用於隱藏攻擊方名稱）
  sourceHasStealthTag?: boolean;
}> {
  type: 'skill.contest';
}

// Phase 6.5 方案 A：跨角色影響事件
// Phase 7: 擴展支援 item_take 和 item_steal 效果
export interface CharacterAffectedEvent extends BaseEvent<{
  targetCharacterId: string;
  sourceCharacterId: string;
  sourceCharacterName: string;
  sourceType: 'skill' | 'item';      // 影響來源類型
  sourceName: string;                 // 技能/道具名稱
  sourceHasStealthTag?: boolean;      // Phase 7.6: 來源是否具有「隱匿」標籤
  effectType: 'stat_change' | 'item_take' | 'item_steal'; // Phase 7: 擴展支援 item_take 和 item_steal
  changes: {
    stats?: Array<{                   // 數值變化陣列
      name: string;
      deltaValue?: number;
      deltaMax?: number;
      newValue: number;
      newMax?: number;
    }>;
    items?: Array<{                  // Phase 7: 道具變化陣列
      id: string;
      name: string;
      action: 'stolen' | 'removed';
    }>;
  };
}> {
  type: 'character.affected';
}

export interface ItemTransferredEvent extends BaseEvent<{
  fromCharacterId: string;
  fromCharacterName: string;
  toCharacterId: string;
  toCharacterName: string;
  itemId: string;
  itemName: string;
  quantity: number;
  transferType: 'give' | 'take' | 'steal';
  skillId?: string;
  skillName?: string;
}> {
  type: 'item.transferred';
}

// WebSocket 事件聯合類型
export type WebSocketEvent =
  | RoleUpdatedEvent
  | GameBroadcastEvent
  | SecretUnlockedEvent
  | RoleMessageEvent
  | TaskUpdatedEvent
  | InventoryUpdatedEvent
  | SkillUsedEvent
  | SkillCooldownEvent
  | SkillContestEvent
  | CharacterAffectedEvent
  | ItemTransferredEvent;

