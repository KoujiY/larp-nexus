/**
 * Skill List 組件相關類型定義
 * 
 * Phase 9: 統一類型定義
 */

import type { Skill } from './character';

/**
 * SkillList 組件 Props
 */
export interface SkillListProps {
  skills?: Skill[];
  characterId: string;
  gameId: string;
  characterName: string;
  stats?: Array<{ name: string; value: number }>;
  randomContestMaxValue?: number; // Phase 7.6: 隨機對抗檢定上限值
}

