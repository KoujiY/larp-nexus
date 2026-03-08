// Phase 10: Runtime 相關類型定義

import type { GameData } from './game';
import type { CharacterData } from './character';

/**
 * Runtime 類型標記
 * - runtime: 遊戲進行中的即時狀態
 * - snapshot: 遊戲結束後的歷史快照
 */
export type RuntimeType = 'runtime' | 'snapshot';

/**
 * Game Runtime 資料（用於 API 回傳）
 * 繼承所有 GameData 欄位，並新增 Runtime 專屬欄位
 */
export interface GameRuntimeData extends GameData {
  refId: string; // 指向 Baseline Game._id
  type: RuntimeType; // 類型標記
  snapshotName?: string; // 快照名稱（僅 snapshot 使用）
  snapshotCreatedAt?: Date; // 快照建立時間（僅 snapshot 使用）
}

/**
 * Character Runtime 資料（用於 API 回傳）
 * 繼承所有 CharacterData 欄位，並新增 Runtime 專屬欄位
 */
export interface CharacterRuntimeData extends CharacterData {
  refId: string; // 指向 Baseline Character._id
  type: RuntimeType; // 類型標記
  snapshotGameRuntimeId?: string; // 所屬快照的 GameRuntime ID（僅 snapshot 使用）
}

/**
 * 建立 Game Runtime 的輸入
 */
export interface CreateGameRuntimeInput {
  refId: string; // Baseline Game ID
  type?: RuntimeType; // 預設為 'runtime'
}

/**
 * 建立 Character Runtime 的輸入
 */
export interface CreateCharacterRuntimeInput {
  refId: string; // Baseline Character ID
  gameId: string; // Runtime Game ID
  type?: RuntimeType; // 預設為 'runtime'
}

/**
 * 建立 Snapshot 的輸入
 */
export interface CreateSnapshotInput {
  gameRuntimeId: string; // 要快照的 GameRuntime ID
  snapshotName: string; // 快照名稱（例如：「第一章結束」）
}
