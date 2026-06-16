// WebSocket 事件相關類型定義
export interface BaseEvent<T = unknown> {
  type: string;
  timestamp: number;
  payload: T;
}

export interface RoleUpdatedEvent extends BaseEvent<{
  characterId: string;
  /**
   * 內部同步標記：為 true 時表示此事件為「副作用同步」而非「主動編輯」。
   *
   * 用途：裝備切換、技能/物品效果套用、時效性效果過期等場景，server 端會
   * 在主事件（equipment.toggled / character.affected / effect.expired）之外
   * 額外推送一個 role.updated 來同步 GM Console，但這個 role.updated **不應**：
   *   1. 在玩家端產生通知（已由 mapRoleUpdated 過濾）
   *   2. 在 GM 編輯頁觸發 sticky bar / 重複 refresh / 假冒「外部變更」toast
   *      （由 useRoleUpdated hook 預設過濾，listener 顯式 opt-in 才會收到）
   *
   * 想接收 silentSync 事件的訂閱端必須使用 `useRoleUpdated(..., { includeSilentSync: true })`
   * 或直接使用原生 Pusher 訂閱（如 runtime-console-ws-listener）。
   */
  silentSync?: boolean;
  updates: {
    name?: string;
    avatar?: string;
    publicInfo?: Record<string, unknown>;
    tasks?: Array<Record<string, unknown>>;
    /**
     * 物品有變動的輕量訊號（取代原 items 完整陣列）。
     *
     * 不攜帶內容：全 codebase 無訂閱端讀取 items 內容（GM console 只讀
     * stats、編輯頁與玩家端皆以事件為 refresh 訊號），而完整陣列在大
     * 物品欄會超過 Pusher 10KB 上限（413 被吞）。需要最新清單的訂閱端
     * 一律走 refresh / refetch。
     */
    itemsChanged?: boolean;
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
 * 物品使用事件（攻擊方通知）
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
  skillId?: string; // Phase 8: 改為可選，支援物品檢定
  skillName?: string; // Phase 8: 改為可選，支援物品檢定
  itemId?: string; // Phase 8: 物品檢定時使用
  itemName?: string; // Phase 8: 物品檢定時使用
  sourceType?: 'skill' | 'item'; // Phase 8: 來源類型
  attackerValue: number;
  defenderValue: number;
  attackerItems?: string[];
  attackerSkills?: string[];
  defenderItems?: string[];
  defenderSkills?: string[];
  result: 'attacker_wins' | 'defender_wins' | 'both_fail';
  effectsApplied?: string[];
  // Phase 7: 對抗檢定配置（用於限制防守方可使用的物品/技能數量）
  opponentMaxItems?: number;
  opponentMaxSkills?: number;
  // Phase 7: 目標物品 ID（用於 item_take 和 item_steal 效果）
  targetItemId?: string;
  // Phase 8: 是否需要攻擊方選擇目標物品（判定失敗後才選擇）
  needsTargetItemSelection?: boolean;
  // Phase 7.6: 檢定類型（contest 或 random_contest）
  checkType?: 'contest' | 'random_contest';
  // Phase 7.6: 數值判定名稱（contest 類型時使用）
  relatedStat?: string;
  // Phase 7.6: 隨機對抗檢定上限值（random_contest 類型時使用）
  randomContestMaxValue?: number;
  // Phase 7.6: 對抗檢定 ID（用於追蹤系統）
  contestId?: string;
  // Phase 2: 事件子類型（用於區分請求/結果/效果/中斷）
  subType?: 'request' | 'result' | 'effect' | 'abort';
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
  sourceName: string;                 // 技能/物品名稱
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
    items?: Array<{                  // Phase 7: 物品變化陣列
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
  triggerReason?: string;           // 觸發原因描述（如「檢視了物品：神秘信件」）
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
 * 隱藏技能揭露事件
 */
export interface SkillRevealedEvent extends BaseEvent<{
  characterId: string;
  skillId: string;
  skillName: string;
  revealType: 'auto' | 'manual' | 'preset_event';
  triggerReason?: string;
}> {
  type: 'skill.revealed';
}

/**
 * 技能隱藏事件
 */
export interface SkillHiddenEvent extends BaseEvent<{
  characterId: string;
  skillId: string;
  skillName: string;
  hideType: 'auto' | 'manual' | 'preset_event';
  triggerReason?: string;
}> {
  type: 'skill.hidden';
}

/**
 * 隱藏物品揭露事件
 */
export interface ItemRevealedEvent extends BaseEvent<{
  characterId: string;
  itemId: string;
  itemName: string;
  revealType: 'auto' | 'manual' | 'preset_event';
  triggerReason?: string;
}> {
  type: 'item.revealed';
}

/**
 * 物品隱藏事件
 */
export interface ItemHiddenEvent extends BaseEvent<{
  characterId: string;
  itemId: string;
  itemName: string;
  hideType: 'auto' | 'manual' | 'preset_event';
  triggerReason?: string;
}> {
  type: 'item.hidden';
}

/**
 * Phase 7.7: 物品展示事件
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
  /** 物品資訊（完整，用於被展示方顯示 Dialog） */
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
 * 一鍵清除通知事件（遊戲頻道）
 *
 * GM 在控制台按下「清除顯示」時推送至遊戲頻道，
 * 各玩家 client 收到後清空本地通知面板（localStorage）。
 * 純前端清除訊號 —— 不刪除任何 DB 資料（玩家通知本就不入庫，
 * GM 歷史紀錄 Log collection 亦完整保留）。
 */
export interface NotificationsClearedEvent extends BaseEvent<{
  /** 遊戲 ID */
  gameId: string;
  /** 清除動作時間戳（毫秒） */
  clearedAt: number;
}> {
  type: 'notifications.cleared';
}

/**
 * 裝備切換事件
 *
 * 玩家裝備或卸除 equipment 類型物品時推送，
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
  createdAt: string | Date;

  /** 是否已送達 */
  isDelivered: boolean;

  /** 送達時間 */
  deliveredAt?: string | Date;

  /** 過期時間（createdAt + 24h） */
  expiresAt: string | Date;
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
  | NotificationsClearedEvent // 一鍵清除前端通知
  | GameStartedEvent         // Phase 10.7
  | GameEndedEvent           // Phase 10.7
  | SkillRevealedEvent       // Hidden skills/items
  | SkillHiddenEvent         // Hidden skills/items
  | ItemRevealedEvent        // Hidden skills/items
  | ItemHiddenEvent;         // Hidden skills/items

