/**
 * GM 角色編輯頁 — dirty state 管理型別
 *
 * 三層儲存架構：
 * - Dialog 層：Wizard / Dialog 編輯完 → 寫入父 Tab 記憶體
 * - Tab 層：Sticky Save Bar 統一處理 → 寫入伺服器
 * - 頁面層：劇本管理頁的獨立 SaveButton → 寫入伺服器
 */

/** 角色編輯頁 7 個 Tab 的識別鍵 */
export type CharacterTabKey =
  | 'basic'
  | 'background'
  | 'secrets'
  | 'stats'
  | 'tasks'
  | 'items'
  | 'skills';

/** 單一 Tab 的 dirty 資訊 */
export type TabDirtyInfo = {
  readonly isDirty: boolean;
  readonly added: number;
  readonly modified: number;
  readonly deleted: number;
};

/** 所有 Tab 的 dirty 狀態集合 */
export type CharacterDirtyState = Readonly<Record<CharacterTabKey, TabDirtyInfo>>;

/** Tab 顯示設定（用於 Tab 導航列渲染） */
export type CharacterTabConfig = {
  readonly key: CharacterTabKey;
  readonly label: string;
  readonly icon: string;
  readonly group: 'narrative' | 'mechanic';
};

/** dirty 狀態的初始值（全乾淨） */
export const EMPTY_DIRTY_INFO: TabDirtyInfo = {
  isDirty: false,
  added: 0,
  modified: 0,
  deleted: 0,
} as const;
