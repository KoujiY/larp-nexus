// Phase 10: Log 相關類型定義

/**
 * 操作者類型
 * - gm: GM 手動操作
 * - system: 系統自動操作
 * - character: 角色操作（玩家）
 */
export type ActorType = 'gm' | 'system' | 'character';

/**
 * Log 資料（用於 API 回傳）
 */
export interface LogData {
  id: string;
  timestamp: Date; // 操作時間
  gameId: string; // 所屬遊戲
  characterId?: string; // 相關角色（可選）
  actorType: ActorType; // 操作者類型
  actorId: string; // 操作者 ID（GM User ID / 'system' / Character ID）
  action: string; // 操作類型
  details: Record<string, unknown>; // 操作詳細資訊（彈性結構）
}

/**
 * 建立 Log 的輸入
 */
export interface CreateLogInput {
  gameId: string;
  characterId?: string;
  actorType: ActorType;
  actorId: string;
  action: string;
  details?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────
// 常見 action 類型的 details 介面（提供型別提示，可選使用）
// ─────────────────────────────────────────────────────────────────

/**
 * 遊戲開始
 */
export interface GameStartDetails {
  gameName: string;
  characterCount: number;
}

/**
 * 遊戲結束
 */
export interface GameEndDetails {
  gameName: string;
  duration: number; // 遊戲時長（秒）
}

/**
 * 數值變更
 */
export interface StatChangeDetails {
  statName: string; // 數值名稱
  oldValue: number; // 舊值
  newValue: number; // 新值
  changeValue: number; // 變化量（正負）
  reason: string; // 變更原因
}

/**
 * 使用道具
 */
export interface ItemUseDetails {
  itemId: string;
  itemName: string;
  targetCharacterId?: string; // 目標角色（如適用）
  effects: unknown[]; // 道具效果列表
}

/**
 * 使用技能
 */
export interface SkillUseDetails {
  skillId: string;
  skillName: string;
  targetCharacterId?: string; // 目標角色（如適用）
  effects: unknown[]; // 技能效果列表
}

/**
 * 對抗檢定結果
 */
export interface ContestResultDetails {
  contestType: string; // 對抗類型（例如：'random', 'stat'）
  initiatorCharacterId: string;
  initiatorCharacterName: string;
  initiatorValue: number; // 發起者數值
  targetCharacterId?: string;
  targetCharacterName?: string;
  targetValue?: number; // 目標數值（如適用）
  result: 'success' | 'failure'; // 結果
  resultEffects?: unknown[]; // 結果效果
}

/**
 * 秘密揭露
 */
export interface SecretRevealDetails {
  secretId: string;
  secretTitle: string;
  revealedToCharacterId?: string; // 揭露給誰（可選）
}

/**
 * 任務完成
 */
export interface TaskCompleteDetails {
  taskId: string;
  taskTitle: string;
  rewards?: unknown[]; // 獎勵列表
}

/**
 * GM 手動修改
 */
export interface GmUpdateDetails {
  targetType: string; // 修改目標類型（例如：'character', 'game'）
  targetId: string; // 目標 ID
  field: string; // 修改欄位
  oldValue: unknown; // 舊值
  newValue: unknown; // 新值
  reason?: string; // 修改原因（可選）
}

/**
 * Log Details 聯合類型（可選使用，提供型別提示）
 */
export type LogDetails =
  | GameStartDetails
  | GameEndDetails
  | StatChangeDetails
  | ItemUseDetails
  | SkillUseDetails
  | ContestResultDetails
  | SecretRevealDetails
  | TaskCompleteDetails
  | GmUpdateDetails
  | Record<string, unknown>; // 保留彈性，允許未定義的 details 結構
