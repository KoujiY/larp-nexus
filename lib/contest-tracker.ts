/**
 * Phase 8: 全局對抗檢定追蹤系統
 * 用於追蹤哪些角色正在進行對抗檢定，以便阻止第三方對他們使用道具或技能
 */

interface ContestInfo {
  attackerId: string;
  defenderId: string;
  contestId: string;
  timestamp: number;
  sourceType: 'skill' | 'item';
  sourceId: string;
  attackerRandomValue?: number; // Phase 7.6: 攻擊方的隨機數（僅用於 random_contest）
  checkType?: 'contest' | 'random_contest'; // Phase 7.6: 檢定類型
}

// 內存中的對抗檢定追蹤 Map
// Key: contestId, Value: ContestInfo
const activeContests = new Map<string, ContestInfo>();

// 清理過期對抗檢定（超過 3 分鐘）
const CONTEST_TIMEOUT = 180000; // 3 分鐘（180000 ms）
const CLEANUP_INTERVAL = 60000; // 1 分鐘清理一次
setInterval(() => {
  const now = Date.now();
  for (const [contestId, contest] of activeContests.entries()) {
    if (now - contest.timestamp > CONTEST_TIMEOUT) {
      activeContests.delete(contestId);
    }
  }
}, CLEANUP_INTERVAL);

/**
 * 添加正在進行的對抗檢定
 */
export function addActiveContest(
  contestId: string,
  attackerId: string,
  defenderId: string,
  sourceType: 'skill' | 'item',
  sourceId: string,
  attackerRandomValue?: number, // Phase 7.6: 攻擊方的隨機數（僅用於 random_contest）
  checkType?: 'contest' | 'random_contest' // Phase 7.6: 檢定類型
): void {
  // 確保 ID 都是字符串格式，避免類型不匹配問題
  activeContests.set(contestId, {
    attackerId: String(attackerId),
    defenderId: String(defenderId),
    contestId,
    timestamp: Date.now(),
    sourceType,
    sourceId,
    attackerRandomValue,
    checkType,
  });
}

/**
 * 移除正在進行的對抗檢定
 */
export function removeActiveContest(contestId: string): void {
  activeContests.delete(contestId);
}

/**
 * 檢查角色是否正在進行對抗檢定（作為攻擊方或防守方）
 */
export function isCharacterInContest(characterId: string): {
  inContest: boolean;
  contestInfo?: ContestInfo;
} {
  // 確保 characterId 是字符串格式
  const characterIdStr = String(characterId);
  
  for (const contest of activeContests.values()) {
    // 確保比較時都轉換為字符串，避免類型不匹配問題
    const attackerIdStr = String(contest.attackerId);
    const defenderIdStr = String(contest.defenderId);
    
    if (attackerIdStr === characterIdStr || defenderIdStr === characterIdStr) {
      return {
        inContest: true,
        contestInfo: contest,
      };
    }
  }
  return { inContest: false };
}

/**
 * 根據角色 ID 清除所有相關的對抗檢定（用於對抗結束後清除狀態）
 */
export function removeContestsByCharacterId(characterId: string): void {
  const characterIdStr = String(characterId);
  const contestsToRemove: string[] = [];
  
  for (const [contestId, contest] of activeContests.entries()) {
    const attackerIdStr = String(contest.attackerId);
    const defenderIdStr = String(contest.defenderId);
    
    if (attackerIdStr === characterIdStr || defenderIdStr === characterIdStr) {
      contestsToRemove.push(contestId);
    }
  }
  
  // 移除所有相關的對抗檢定
  for (const contestId of contestsToRemove) {
    activeContests.delete(contestId);
  }
}

/**
 * 獲取所有正在進行的對抗檢定
 */
export function getAllActiveContests(): ContestInfo[] {
  return Array.from(activeContests.values());
}

/**
 * 根據 contestId 獲取對抗檢定信息
 */
export function getContestInfo(contestId: string): ContestInfo | undefined {
  return activeContests.get(contestId);
}

