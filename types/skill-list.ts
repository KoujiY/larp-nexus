/**
 * Skill List 組件相關類型定義
 * 
 * Phase 9: 統一類型定義
 */

import type { Skill, Item } from './character';

/**
 * SkillList 組件 Props
 */
export interface SkillListProps {
  skills?: Skill[];
  characterId: string;
  gameId: string;
  characterName: string;
  stats?: Array<{ name: string; value: number }>;
  /** Feature 3: 角色物品清單，用於「持有物品」類使用條件判斷 */
  items?: Item[];
  randomContestMaxValue?: number; // Phase 7.6: 隨機對抗檢定上限值
  isReadOnly?: boolean; // Phase 10.5.4: 預覽模式禁用互動
}

