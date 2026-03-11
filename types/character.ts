// Character (角色) 相關類型定義

/**
 * Phase 4 擴展版角色資料（用於 API 回傳）
 */
export interface CharacterData {
  id: string;
  gameId: string;
  name: string;
  description: string;
  imageUrl?: string;
  hasPinLock: boolean;
  publicInfo?: PublicInfo;
  secretInfo?: SecretInfo;
  tasks?: Task[];
  items?: Item[];
  stats?: Stat[];
  skills?: Skill[];
  randomContestMaxValue?: number; // Phase 7.6: 隨機對抗檢定上限值
  viewedItems?: ViewedItem[]; // Phase 7.7: 已檢視的道具記錄
  temporaryEffects?: TemporaryEffect[]; // Phase 8: 時效性效果記錄
  pendingEvents?: import('@/types/event').PendingEvent[]; // Phase 9: 離線事件佇列
  /**
   * Phase 10: 遊戲是否進行中
   * true = 遊戲正在進行（Runtime 模式），false = 遊戲未開始或已結束
   * 用於前端判斷是否需要清除解鎖狀態、顯示遊戲結束提示
   */
  isGameActive?: boolean;
  /**
   * Phase 11.5: 遊戲進行中時，附帶 Game Code 供玩家端 Runtime Banner 顯示
   * 僅在 isGameActive=true 且玩家已完整解鎖時才有值
   */
  gameCode?: string;
  /**
   * Phase 10: 遊戲進行中時，附帶 Baseline 原始資料
   * 用於唯讀預覽模式（PIN-only）顯示未修改的角色設定
   * 僅在 isActive=true 時由 getPublicCharacter 填充
   */
  baselineData?: CharacterBaselineSnapshot;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/**
 * Phase 10: Baseline 快照（用於唯讀預覽模式）
 * 只包含遊戲進行中可能改變的欄位
 */
export interface CharacterBaselineSnapshot {
  stats?: Stat[];
  items?: Item[];
  skills?: Skill[];
  tasks?: Task[];
  secretInfo?: SecretInfo;
}

/**
 * 完整版角色資料（Phase 4 使用）
 */
export interface Character {
  _id: string;
  gameId: string;
  name: string;
  avatar?: string;
  hasPinLock: boolean;
  pinHash?: string;
  publicInfo: PublicInfo;
  secretInfo: SecretInfo;
  tasks: Task[];
  items: Item[];
  stats: Stat[];
  wsChannelId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicInfo {
  background: string;
  personality: string;
  relationships: Relationship[];
}

export interface Relationship {
  targetName: string;
  description: string;
}

/**
 * Phase 7.7: 自動揭露條件類型
 */
export type AutoRevealConditionType =
  | 'none'                    // 無其他自動揭露條件
  | 'items_viewed'            // 檢視過某幾樣道具（展示/自行檢視，支援 AND/OR 邏輯）
  | 'items_acquired'          // 取得了某幾樣道具（支援 AND/OR 邏輯）
  | 'secrets_revealed';       // 某幾樣隱藏資訊已揭露（僅隱藏目標可用）

/**
 * Phase 7.7: 自動揭露條件設定
 */
export interface AutoRevealCondition {
  type: AutoRevealConditionType;
  /**
   * 條件引用的道具 ID 列表（items_viewed 和 items_acquired 使用）
   * 此處的 ID 直接對應角色背包中的道具 ID，由 GM 在設定時選擇
   * items_viewed 和 items_acquired 的匹配邏輯完全一致，僅資料來源不同
   */
  itemIds?: string[];
  /** 條件引用的隱藏資訊 ID 列表（僅 secrets_revealed 使用） */
  secretIds?: string[];
  /**
   * 匹配邏輯（items_viewed 和 items_acquired 使用）
   * - 'and'：所有條件都要滿足（預設）
   * - 'or'：滿足其一即可
   *
   * secrets_revealed 固定為 AND 邏輯（所有指定隱藏資訊都必須已揭露）
   */
  matchLogic?: 'and' | 'or';
}

/**
 * Phase 7.7: 角色已檢視的道具記錄
 * 用於追蹤「檢視過某幾樣道具」(items_viewed) 揭露條件
 *
 * 「檢視」的觸發場景有兩種：
 * 1. 別人展示道具給你（showcase）→ itemId 為展示方背包中的道具 ID
 * 2. 自己點開道具詳情查看（self-view）→ itemId 為自己背包中的道具 ID
 *
 * 判定邏輯：直接以道具 ID 匹配。
 * GM 應在設定條件時就把所有可能的道具（包含同名道具）都設定進去。
 */
export interface ViewedItem {
  /** 被檢視的道具 ID */
  itemId: string;
  /** 來源角色 ID（展示方角色 ID；若為自行檢視則為自己的角色 ID） */
  sourceCharacterId: string;
  /** 檢視時間 */
  viewedAt: Date;
}

/**
 * Phase 8: 時效性效果記錄
 * 記錄在被影響方角色上
 */
export interface TemporaryEffect {
  id: string;                           // 效果唯一識別碼（如 'teff-xxx-123'）
  sourceType: 'skill' | 'item';        // 來源類型
  sourceId: string;                     // 技能/道具 ID
  sourceCharacterId: string;            // 施放者角色 ID
  sourceCharacterName: string;          // 施放者角色名稱
  sourceName: string;                   // 技能/道具名稱
  effectType: 'stat_change';            // 效果類型（Phase 8 僅支援 stat_change）
  targetStat: string;                   // 目標數值名稱
  deltaValue?: number;                  // 對 value 的變化量（恢復時反向）
  deltaMax?: number;                    // 對 maxValue 的變化量（恢復時反向）
  statChangeTarget: 'value' | 'maxValue'; // 數值變化目標
  syncValue?: boolean;                  // 是否同步修改了 value（當 statChangeTarget='maxValue'）
  duration: number;                     // 持續時間（秒）
  appliedAt: string | Date;              // 效果套用時間
  expiresAt: string | Date;              // 效果過期時間
  isExpired: boolean;                   // 是否已過期
}

/**
 * Phase 3.5: 隱藏資訊
 */
export interface SecretInfo {
  secrets: Secret[];
}

export interface Secret {
  id: string;
  title: string;
  content: string;
  isRevealed: boolean;
  revealCondition?: string;
  autoRevealCondition?: AutoRevealCondition;  // Phase 7.7: 結構化自動揭露條件
  revealedAt?: Date;
}

/**
 * Phase 4.5: 任務系統（擴展版）
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  // 隱藏目標機制
  isHidden: boolean;
  isRevealed: boolean;
  revealedAt?: Date;
  // 完成狀態
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  completedAt?: Date;
  // GM 專用欄位（玩家端不顯示）
  gmNotes?: string;
  revealCondition?: string;
  autoRevealCondition?: AutoRevealCondition;  // Phase 7.7: 結構化自動揭露條件
  createdAt: Date;
}

/**
 * Phase 4.5: 道具效果
 */
/**
 * Phase 4.5: 道具效果
 * Phase 6.5: 擴展跨角色效果（方案 A）
 * 重構：與 SkillEffect 統一結構，支援多個效果
 */
export interface ItemEffect {
  type: 'stat_change' | 'custom' | 'item_take' | 'item_steal'; // Phase 7: 添加 item_take 和 item_steal
  
  // Phase 6.5 方案 A: 目標設定
  targetType?: 'self' | 'other' | 'any';  // 目標對象類型（GM 設定）
  requiresTarget?: boolean;                // 是否需要玩家選擇目標角色
  
  targetStat?: string;
  value?: number;
  // 數值變化目標：'value' 修改目前值，'maxValue' 修改最大值
  statChangeTarget?: 'value' | 'maxValue';
  // 當 statChangeTarget === 'maxValue' 時，是否同步修改目前值
  syncValue?: boolean;
  duration?: number;
  description?: string;
  targetItemId?: string; // Phase 7: 目標道具 ID（用於 item_take 和 item_steal，由玩家在執行時選擇）
}

/**
 * Phase 4.5: 道具系統（擴展版）
 * Phase 8: 添加檢定系統
 * 重構：支援多個效果（與技能一致）
 */
export interface Item {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  // 道具類型與數量
  type: 'consumable' | 'equipment';
  quantity: number;
  // 使用效果（重構：改為陣列，支援多個效果）
  effects?: ItemEffect[];
  // 向後兼容：保留 effect 欄位（單一效果），但優先使用 effects
  /** @deprecated 使用 effects 陣列代替 */
  effect?: ItemEffect;
  // Phase 7.6: 標籤系統
  tags?: string[];
  // 檢定系統（Phase 8，Phase 7.6: 擴展為包含 random_contest）
  checkType?: 'none' | 'contest' | 'random' | 'random_contest';
  // 對抗檢定設定（checkType === 'contest' 時使用）
  contestConfig?: ContestConfig;
  // 隨機檢定設定（checkType === 'random' 時使用）
  randomConfig?: RandomConfig;
  // 使用限制
  usageLimit?: number;
  usageCount?: number;
  cooldown?: number;
  lastUsedAt?: Date;
  // 流通性
  isTransferable: boolean;
  acquiredAt: Date;
}

/**
 * Phase 4: 數值系統
 */
export interface Stat {
  id: string;
  name: string;
  value: number;
  maxValue?: number;
}

/**
 * Phase 5: 技能效果
 * Phase 6.5: 擴展跨角色效果（方案 A）
 * Phase 8: 添加 duration 欄位支援時效性效果
 */
export interface SkillEffect {
  type: 'stat_change' | 'item_give' | 'item_take' | 'item_steal' |
        'task_reveal' | 'task_complete' | 'custom';

  // Phase 6.5 方案 A: 目標設定
  targetType?: 'self' | 'other' | 'any';  // 目標對象類型（GM 設定）
  requiresTarget?: boolean;                // 是否需要玩家選擇目標角色

  targetStat?: string;
  value?: number;
  // 數值變化目標：'value' 修改目前值，'maxValue' 修改最大值（需要該數值有 maxValue）
  statChangeTarget?: 'value' | 'maxValue';
  // 當 statChangeTarget === 'maxValue' 時，是否同步修改目前值
  syncValue?: boolean;
  duration?: number; // Phase 8: 持續時間（秒），undefined/0 = 永久
  targetItemId?: string;
  targetTaskId?: string;
  description?: string;
}

/**
 * Phase 5: 對抗檢定設定
 */
export interface ContestConfig {
  relatedStat: string; // 使用的數值名稱
  opponentMaxItems?: number; // 對方最多可使用道具數（預設 0）
  opponentMaxSkills?: number; // 對方最多可使用技能數（預設 0）
  tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail'; // 平手裁決方式
}

/**
 * Phase 5: 隨機檢定設定
 */
export interface RandomConfig {
  maxValue: number; // 隨機數值上限（預設 100）
  threshold: number; // 門檻值（必須 <= maxValue）
}

/**
 * Phase 5: 技能系統
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  // Phase 7.6: 標籤系統
  tags?: string[];
  // 檢定系統（Phase 7.6: 擴展為包含 random_contest）
  checkType: 'none' | 'contest' | 'random' | 'random_contest';
  // 對抗檢定設定（checkType === 'contest' 時使用）
  contestConfig?: ContestConfig;
  // 隨機檢定設定（checkType === 'random' 時使用）
  randomConfig?: RandomConfig;
  // 使用限制
  usageLimit?: number;
  usageCount?: number;
  cooldown?: number;
  lastUsedAt?: Date;
  // 效果定義（可多個）
  effects?: SkillEffect[];
}

export interface CreateCharacterInput {
  name: string;
  avatar?: string;
  hasPinLock: boolean;
  pin?: string;
  publicInfo: PublicInfo;
  secretInfo: Omit<SecretInfo, 'isUnlocked'>;
}

export interface UpdateCharacterInput {
  name?: string;
  avatar?: string;
  hasPinLock?: boolean;
  pin?: string;
  publicInfo?: Partial<PublicInfo>;
  secretInfo?: Partial<SecretInfo>;
  tasks?: Task[];
  items?: Item[];
  stats?: Stat[];
  skills?: Skill[];
}

/**
 * Phase 4.5: 任務建立輸入
 */
export interface CreateTaskInput {
  title: string;
  description: string;
  isHidden?: boolean;
  gmNotes?: string;
  revealCondition?: string;
}

/**
 * Phase 4.5: 道具建立輸入
 * Phase 8: 添加檢定系統
 */
export interface CreateItemInput {
  name: string;
  description: string;
  imageUrl?: string;
  type: 'consumable' | 'equipment';
  quantity?: number;
  effects?: ItemEffect[];
  /** @deprecated 使用 effects 陣列代替 */
  effect?: ItemEffect;
  checkType?: 'none' | 'contest' | 'random' | 'random_contest';
  contestConfig?: ContestConfig;
  randomConfig?: RandomConfig;
  usageLimit?: number;
  cooldown?: number;
  isTransferable?: boolean;
}

/**
 * Phase 5: 技能建立輸入
 */
export interface CreateSkillInput {
  name: string;
  description: string;
  iconUrl?: string;
  checkType: 'none' | 'stat' | 'random';
  checkThreshold?: number;
  relatedStat?: string;
  usageLimit?: number;
  cooldown?: number;
  effects?: SkillEffect[];
}

