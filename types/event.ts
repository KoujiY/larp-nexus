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
  checkType: 'none' | 'contest' | 'random';
  checkPassed: boolean;
  checkResult?: number;
  effectsApplied?: string[];
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
  skillId: string;
  skillName: string;
  attackerValue: number;
  defenderValue: number;
  attackerItems?: string[];
  attackerSkills?: string[];
  defenderItems?: string[];
  defenderSkills?: string[];
  result: 'attacker_wins' | 'defender_wins' | 'both_fail';
  effectsApplied?: string[];
}> {
  type: 'skill.contest';
}

// Phase 6.5 方案 A：跨角色影響事件
export interface CharacterAffectedEvent extends BaseEvent<{
  targetCharacterId: string;
  sourceCharacterId: string;
  sourceCharacterName: string;
  sourceType: 'skill' | 'item';      // 影響來源類型
  sourceName: string;                 // 技能/道具名稱
  effectType: 'stat_change';          // 方案 A 只支援 stat_change
  changes: {
    stats?: Array<{                   // 數值變化陣列
      name: string;
      deltaValue?: number;
      deltaMax?: number;
      newValue: number;
      newMax?: number;
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

