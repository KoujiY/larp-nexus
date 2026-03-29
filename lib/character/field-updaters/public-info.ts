/**
 * 角色公開資訊（PublicInfo）欄位更新器
 */

import type { CharacterDocument } from '@/lib/db/models';
import type { BackgroundBlock } from '@/types/character';
import { normalizeBackground } from '@/lib/character/normalize-background';

/**
 * 更新角色 PublicInfo
 *
 * @param publicInfo PublicInfo 資料
 * @param currentPublicInfo 當前 PublicInfo 資料
 * @returns 更新後的 PublicInfo 資料
 */
export function updateCharacterPublicInfo(
  publicInfo: {
    background?: BackgroundBlock[];
    personality?: string;
    relationships?: Array<{
      targetName: string;
      description: string;
    }>;
  },
  currentPublicInfo?: CharacterDocument['publicInfo']
): Record<string, unknown> {
  return {
    background: publicInfo.background ?? normalizeBackground(currentPublicInfo?.background) ?? [],
    personality: publicInfo.personality ?? currentPublicInfo?.personality ?? '',
    relationships: publicInfo.relationships ?? currentPublicInfo?.relationships ?? [],
  };
}
