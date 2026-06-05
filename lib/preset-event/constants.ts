import type { PresetEventActionType } from '@/types/game';

/**
 * 預設事件動作類型中文標籤
 *
 * 統一用於 preset-event-editor、preset-event-card、preset-event-quick-panel。
 * 型別為 Record<PresetEventActionType, string>：少一個動作類型的標籤會編譯期報錯。
 */
export const PRESET_ACTION_TYPE_LABELS: Record<PresetEventActionType, string> = {
  broadcast: '廣播',
  stat_change: '數值變更',
  reveal_secret: '揭露資訊',
  reveal_task: '揭露任務',
  reveal_skill: '揭露技能',
  hide_skill: '隱藏技能',
  reveal_item: '揭露物品',
  hide_item: '隱藏物品',
};
