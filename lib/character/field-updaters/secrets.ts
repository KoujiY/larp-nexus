/**
 * 角色秘密（Secrets）欄位更新器
 */

import type { MongoSecret } from '@/lib/db/types/mongo-helpers';
import type { AutoRevealConditionType } from '@/types/character';

/**
 * 更新角色 Secrets
 *
 * @param secrets Secrets 陣列
 * @param currentSecrets 當前 Secrets 陣列（用於保留時間戳）
 * @returns 更新後的 Secrets 資料
 */
export function updateCharacterSecrets(
  secrets: Array<{
    id: string;
    title: string;
    content: string | string[];
    isRevealed: boolean;
    revealCondition?: string;
    // Phase 7.7: 自動揭露條件
    autoRevealCondition?: {
      type: string;
      itemIds?: string[];
      secretIds?: string[];
      matchLogic?: string;
    };
    revealedAt?: Date;
  }>,
  currentSecrets: MongoSecret[] = []
): MongoSecret[] {
  return secrets.map((newSecret): MongoSecret => {
    const oldSecret = currentSecrets.find((s) => s.id === newSecret.id);

    // 計算 autoRevealCondition
    const autoRevealCondition: MongoSecret['autoRevealCondition'] =
      newSecret.autoRevealCondition && newSecret.autoRevealCondition.type !== 'none'
        ? {
            ...newSecret.autoRevealCondition,
            type: newSecret.autoRevealCondition.type as AutoRevealConditionType,
            matchLogic: newSecret.autoRevealCondition.matchLogic as 'and' | 'or' | undefined,
          }
        : (!newSecret.autoRevealCondition && oldSecret?.autoRevealCondition)
          ? oldSecret.autoRevealCondition
          : undefined;
    // 若 type 為 'none' 或 undefined，不設定 autoRevealCondition（清除）

    // 計算 revealedAt（從未揭露變為已揭露時設定）
    const revealedAt: Date | undefined =
      (newSecret.isRevealed && (!oldSecret || !oldSecret.isRevealed))
        ? new Date()
        : oldSecret?.revealedAt;

    const cleanSecret: MongoSecret = {
      id: newSecret.id,
      title: newSecret.title,
      content: newSecret.content,
      isRevealed: newSecret.isRevealed,
      revealCondition: newSecret.revealCondition || '',
      revealedAt,
      ...(autoRevealCondition !== undefined ? { autoRevealCondition } : {}),
    };

    return cleanSecret;
  });
}
