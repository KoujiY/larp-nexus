/**
 * 角色欄位更新器 — Barrel export
 *
 * 將各 domain 模組的公開函式集中匯出，
 * 讓消費者（character-update.ts, field-updaters.test.ts）維持原有的匯入路徑。
 */

export { updateCharacterStats } from './stats';
export { updateCharacterSkills } from './skills';
export { updateCharacterItems } from './items';
export type { InventoryDiff } from './items';
export { updateCharacterTasks } from './tasks';
export { updateCharacterSecrets } from './secrets';
export { updateCharacterPublicInfo } from './public-info';
