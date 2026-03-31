/**
 * 全局通知工具
 *
 * 統一管理玩家端的系統通知，封裝 sonner 的 toast API。
 * 所有元件應透過此模組發送通知，不應直接 import { toast } from 'sonner'。
 *
 * 用途限定：
 * - 系統/API 層級的錯誤訊息
 * - 前端驗證提示
 *
 * 遊戲機制結果（檢定成功/失敗、對抗結果等）由通知面板處理，不在此顯示。
 */

import { toast } from 'sonner';

/** 預設自動消失時間（毫秒） */
const DEFAULT_DURATION = 5000;

/**
 * 顯示錯誤通知
 * 用於 API 錯誤、系統異常等
 */
function error(message: string, options?: { description?: string; duration?: number }) {
  toast.error(message, {
    duration: options?.duration ?? DEFAULT_DURATION,
    description: options?.description,
  });
}

/**
 * 顯示警告通知
 * 用於前端驗證、操作限制等
 */
function warning(message: string, options?: { description?: string; duration?: number }) {
  toast.warning(message, {
    duration: options?.duration ?? DEFAULT_DURATION,
    description: options?.description,
  });
}

export const notify = { error, warning } as const;
