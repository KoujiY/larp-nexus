/**
 * 對抗檢定 ID（contestId）生成和解析工具
 * 統一管理 contestId 的生成和解析，避免代碼重複
 */

export interface ParsedContestId {
  attackerId: string;
  sourceId: string;
  timestamp: number;
}

/**
 * 生成對抗檢定 ID
 * 格式：attackerId::sourceId::timestamp
 * 
 * @param attackerId 攻擊方角色 ID
 * @param sourceId 來源 ID（技能 ID 或道具 ID）
 * @param timestamp 時間戳（可選，預設為當前時間）
 * @returns 對抗檢定 ID
 */
export function generateContestId(
  attackerId: string,
  sourceId: string,
  timestamp?: number
): string {
  return `${attackerId}::${sourceId}::${timestamp || Date.now()}`;
}

/**
 * 解析對抗檢定 ID
 * 
 * @param contestId 對抗檢定 ID
 * @returns 解析結果，如果格式無效則返回 null
 */
export function parseContestId(contestId: string): ParsedContestId | null {
  const parts = contestId.split('::');
  if (parts.length !== 3) {
    return null;
  }
  
  const [attackerId, sourceId, timestampStr] = parts;
  
  if (!attackerId || !sourceId || !timestampStr) {
    return null;
  }
  
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return null;
  }
  
  return {
    attackerId,
    sourceId,
    timestamp,
  };
}

/**
 * 驗證對抗檢定 ID 格式是否有效
 * 
 * @param contestId 對抗檢定 ID
 * @returns 是否有效
 */
export function isValidContestId(contestId: string): boolean {
  return parseContestId(contestId) !== null;
}

