'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * useFormGuard Hook 的參數
 */
interface UseFormGuardOptions<T> {
  /** 表單初始資料（從 props 或 Server 取得的原始值） */
  initialData: T;
  /** 表單當前資料（使用者修改後的值） */
  currentData: T;
  /** 自訂比較函數（選用，預設使用 JSON.stringify 深比較） */
  compareFn?: (initial: T, current: T) => boolean;
  /** 是否啟用保護（預設 true，儲存中可暫時關閉） */
  enabled?: boolean;
}

/**
 * useFormGuard Hook 的回傳值
 */
interface UseFormGuardReturn {
  /** 表單是否有未儲存的變更 */
  isDirty: boolean;
  /** 手動重置 dirty 狀態（儲存成功後呼叫） */
  resetDirty: () => void;
  /** 手動設定 dirty 狀態（二層儲存場景：Dialog 確認後手動標記） */
  markDirty: () => void;
}

/**
 * 預設深比較函數
 *
 * 使用 JSON.stringify 進行比較，足以應對本專案的表單資料結構
 * （plain objects/arrays，屬性順序由 useState 初始化決定，保持一致）
 */
function defaultCompare<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 表單未儲存變更保護 Hook
 *
 * 追蹤表單的 dirty state，並在有未儲存變更時：
 * 1. 註冊 `beforeunload` 事件（攔截瀏覽器關閉/重新整理）
 * 2. 回傳 `isDirty` 供視覺提示使用
 *
 * @example
 * ```tsx
 * // 單層表單
 * const { isDirty, resetDirty } = useFormGuard({
 *   initialData: game,
 *   currentData: formData,
 * });
 *
 * // 二層表單（Skills/Tasks/Items）
 * const { isDirty, resetDirty, markDirty } = useFormGuard({
 *   initialData: initialSkills,
 *   currentData: skills,
 * });
 * ```
 */
export function useFormGuard<T>({
  initialData,
  currentData,
  compareFn = defaultCompare,
  enabled = true,
}: UseFormGuardOptions<T>): UseFormGuardReturn {
  const [manualDirty, setManualDirty] = useState(false);
  const [prevInitialData, setPrevInitialData] = useState(initialData);

  // initialData 從 server 更新時（router.refresh() 後 props 變化），自動重置 dirty
  if (!compareFn(initialData, prevInitialData)) {
    setPrevInitialData(initialData);
    setManualDirty(false);
  }

  // 計算 isDirty：資料比較 OR 手動標記
  const isDirty = useMemo(() => {
    if (!enabled) return false;
    return manualDirty || !compareFn(initialData, currentData);
  }, [enabled, manualDirty, initialData, currentData, compareFn]);

  // L1: beforeunload 攔截（瀏覽器關閉、重新整理、手動輸入 URL）
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 現代瀏覽器忽略自訂訊息，但仍需設定 returnValue
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  /** 重置 dirty 狀態（儲存成功後呼叫） */
  const resetDirty = useCallback(() => {
    setManualDirty(false);
  }, []);

  /** 手動標記為 dirty（二層儲存場景的安全閥） */
  const markDirty = useCallback(() => {
    setManualDirty(true);
  }, []);

  return { isDirty, resetDirty, markDirty };
}
