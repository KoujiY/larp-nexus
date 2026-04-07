// WebSocket 事件相關類型定義
export interface BaseEvent<T = unknown> {
  type: string;
  timestamp: number;
  payload: T;
}

export interface RoleUpdatedEvent extends BaseEvent<{
  characterId: string;
  /** GM Console 即時同步標記：為 true 時玩家端不產生通知（避免與專屬事件重複） */
  _statsSync?: boolean;
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

/**
 * 道具使用事件（攻擊方通知）
 */
export interface ItemUsedEvent extends BaseEvent<{
  characterId: string;
  itemId: string;
  itemName: string;
  checkPassed: boolean;
  checkResult?: number;
  effectsApplied?: string[];
  targetCharacterId?: string;
  targetCharacterName?: string;
}> {
  type: 'item.used';
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
  // Phase 11: 跨通道去重 ID（WebSocket + Pending Events 共用）
  _eventId?: string;
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

/**
 * Phase 7.7: 隱藏資訊自動揭露事件
 */
export interface SecretRevealedEvent extends BaseEvent<{
  characterId: string;
  secretId: string;
  secretTitle: string;
  revealType: 'auto' | 'manual';  // 區分自動揭露與手動揭露
  triggerReason?: string;           // 觸發原因描述（如「檢視了道具：神秘信件」）
}> {
  type: 'secret.revealed';
}

/**
 * Phase 7.7: 隱藏目標自動揭露事件
 */
export interface TaskRevealedEvent extends BaseEvent<{
  characterId: string;
  taskId: string;
  taskTitle: string;
  revealType: 'auto' | 'manual';
  triggerReason?: string;
}> {
  type: 'task.revealed';
}

/**
 * Phase 7.7: 道具展示事件
 */
export interface ItemShowcasedEvent extends BaseEvent<{
  /** 展示方角色 ID */
  fromCharacterId: string;
  /** 展示方角色名稱 */
  fromCharacterName: string;
  /** 被展示方角色 ID */
  toCharacterId: string;
  /** 被展示方角色名稱 */
  toCharacterName: string;
  /** 道具資訊（完整，用於被展示方顯示 Dialog） */
  item: {
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    type: 'consumable' | 'tool' | 'equipment';
    quantity: number;
    tags?: string[];
  };
}> {
  type: 'item.showcased';
}

/**
 * Phase 8: 效果過期事件
 */
export interface EffectExpiredEvent extends BaseEvent<{
  targetCharacterId: string;
  effectId: string;
  sourceType: 'skill' | 'item' | 'preset_event';
  sourceId: string;
  sourceCharacterId: string;
  sourceCharacterName: string;
  sourceName: string;
  effectType: 'stat_change';
  targetStat: string;
  restoredValue: number;        // 恢復後的數值
  restoredMax?: number;         // 恢復後的最大值
  deltaValue?: number;          // 原始的變化量（用於顯示）
  deltaMax?: number;            // 原始的最大值變化量
  statChangeTarget: 'value' | 'maxValue';
  duration: number;
}> {
  type: 'effect.expired';
}

/**
 * Phase 10.7: 遊戲開始事件
 *
 * 當 GM 按下「開始遊戲」時推送此事件，
 * 通知所有玩家遊戲已開始，觸發頁面重新載入。
 */
export interface GameStartedEvent extends BaseEvent<{
  /** 遊戲 ID */
  gameId: string;
  /** 遊戲代碼（6 位英數字） */
  gameCode: string;
  /** 遊戲名稱 */
  gameName: string;
}> {
  type: 'game.started';
}

/**
 * Phase 10.7: 遊戲結束事件
 *
 * 當 GM 按下「結束遊戲」時推送此事件，
 * 通知所有玩家遊戲已結束，觸發頁面重新載入。
 */
export interface GameEndedEvent extends BaseEvent<{
  /** 遊戲 ID */
  gameId: string;
  /** 遊戲代碼（6 位英數字） */
  gameCode: string;
  /** 遊戲名稱 */
  gameName: string;
  /** Snapshot ID（可選） */
  snapshotId?: string;
}> {
  type: 'game.ended';
}

/**
 * 裝備切換事件
 *
 * 玩家裝備或卸除 equipment 類型道具時推送，
 * 通知 GM 端更新角色狀態。
 */
export interface EquipmentToggledEvent extends BaseEvent<{
  characterId: string;
  itemId: string;
  itemName: string;
  equipped: boolean;
  statBoosts: Array<{ statName: string; value: number; target?: 'value' | 'maxValue' | 'both' }>;
}> {
  type: 'equipment.toggled';
}

/**
 * Phase 9: 離線事件佇列記錄
 *
 * 用於儲存玩家離線時錯過的 WebSocket 事件，
 * 確保玩家重新上線後能接收到所有通知。
 */
export interface PendingEvent {
  /** 唯一識別碼 */
  id: string;

  /** 接收者角色 ID（character-level 事件） */
  targetCharacterId?: string;

  /** 接收劇本 ID（game-level 事件，如 game.broadcast） */
  targetGameId?: string;

  /** WebSocket 事件類型（如 'skill.contest', 'character.affected'） */
  eventType: string;

  /** 原始事件的 payload */
  eventPayload: Record<string, unknown>;

  /** 事件產生時間 */
  createdAt: Date;

  /** 是否已送達 */
  isDelivered: boolean;

  /** 送達時間 */
  deliveredAt?: Date;

  /** 過期時間（createdAt + 24h） */
  expiresAt: Date;
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
  | ItemUsedEvent
  | SkillCooldownEvent
  | SkillContestEvent
  | CharacterAffectedEvent
  | ItemTransferredEvent
  | SecretRevealedEvent      // Phase 7.7
  | TaskRevealedEvent        // Phase 7.7
  | ItemShowcasedEvent       // Phase 7.7
  | EffectExpiredEvent       // Phase 8
  | EquipmentToggledEvent
  | GameStartedEvent         // Phase 10.7
  | GameEndedEvent;          // Phase 10.7

