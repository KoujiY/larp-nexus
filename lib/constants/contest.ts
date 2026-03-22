/**
 * 對抗檢定相關常量
 */

/** 對抗檢定狀態過期時間（3 分鐘，毫秒） */
export const CONTEST_TIMEOUT = 180000;

/** 對抗檢定查詢延遲時間（10 秒，毫秒） */
export const CONTEST_QUERY_DELAY = 10000;

/** Dialog 狀態過期時間（3 分鐘，毫秒） */
export const DIALOG_TIMEOUT = 180000;

/**
 * localStorage 鍵名生成函數
 */
export const STORAGE_KEYS = {
  /** 對抗檢定待處理狀態 */
  CONTEST_PENDING: (characterId: string) => `contest-pending-${characterId}`,
  
  /** 防守方對抗檢定狀態 */
  CONTEST_DEFENDER: (characterId: string) => `contest-defender-${characterId}`,
  
  /** Dialog 狀態 */
  CONTEST_DIALOG: (characterId: string) => `contest-dialog-${characterId}`,
  
  /** 技能目標選擇狀態 */
  SKILL_TARGET: (characterId: string, skillId: string) => `skill-${characterId}-${skillId}-target`,
  
  /** 道具目標選擇狀態 */
  ITEM_TARGET: (characterId: string, itemId: string) => `item-${characterId}-${itemId}-target`,
} as const;

