'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * useFormGuard Hook 的參數
 */
type UseFormGuardOptions<T> = {
  /** 表單初始資料（從 props 或 Server 取得的原始值） */
  initialData: T;
  /** 表單當前資料（使用者修改後的值） */
  currentData: T;
  /** 自訂比較函數（選用，預設使用 JSON.stringify 深比較） */
  compareFn?: (initial: T, current: T) => boolean;
  /** 是否啟用保護（預設 true，儲存中可暫時關閉） */
  enabled?: boolean;
};

/**
 * useFormGuard Hook 的回傳值
 */
type UseFormGuardReturn = {
  /** 表單是否有未儲存的變更 */
  isDirty: boolean;
  /** 手動重置 dirty 狀態（儲存成功後呼叫） */
  resetDirty: () => void;
  /** 手動設定 dirty 狀態（二層儲存場景：Dialog 確認後手動標記） */
  markDirty: () => void;
};

/**
 * 預設深比較函數
 *
 * 使用 JSON.stringify 進行比較，足以應對本專案的表單資料結構
 * （plain objects/arrays，屬性順序由 useState 初始化決定，保持一致）
 */
function defaultCompare<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Module-level navigation guard：引用計數防止多 instance 重複攔截 pushState
//
// ⚠️ 已知限制（2026-04-03 評估）：
// - 使用 module-level 可變狀態 + history.pushState monkey-patch
// - 若未來引入會 patch pushState 的第三方 SDK（analytics、A/B testing 等），
//   可能產生互相覆蓋的衝突（後 patch 者的 deactivate 會吃掉先 patch 者）
// - Next.js App Router 不提供 routeChangeStart 事件，monkey-patch 是目前唯一手段
// - 瀏覽器 Navigation API 可取代此做法，但 Firefox 尚未支持（截至 2026-04）
// - 當前專案無衝突 SDK（Pusher 為 WebSocket，不碰 pushState），暫不重寫
// ---------------------------------------------------------------------------
let guardRefCount = 0;
let originalPushState: typeof history.pushState | null = null;

function activateNavigationGuard() {
  guardRefCount++;
  if (guardRefCount > 1) return; // 已由其他 instance 啟動

  originalPushState = history.pushState.bind(history);
  const saved = originalPushState;

  // 攔截 Next.js App Router 的 client-side 導航
  history.pushState = function (
    state: unknown,
    title: string,
    url?: string | URL | null,
  ) {
    if (window.confirm('你有未儲存的變更，確定要離開嗎？')) {
      saved(state, title, url);
    }
  };
}

function deactivateNavigationGuard() {
  guardRefCount--;
  if (guardRefCount > 0) return; // 還有其他 instance 在使用
  if (originalPushState) {
    history.pushState = originalPushState;
    originalPushState = null;
  }
}

/**
 * 表單未儲存變更保護 Hook
 *
 * 追蹤表單的 dirty state，並在有未儲存變更時：
 * 1. 註冊 `beforeunload` 事件（攔截瀏覽器關閉/重新整理）
 * 2. 攔截 `history.pushState`（攔截 Next.js client-side 導航）
 * 3. 監聽 `popstate`（攔截瀏覽器上一頁/下一頁）
 * 4. 回傳 `isDirty` 供視覺提示使用
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

  // 離開保護：pushState 攔截 + popstate 監聽
  // 注意：beforeunload 由 useCharacterEditState 統一管理，此處不重複註冊
  useEffect(() => {
    if (!isDirty) return;

    // L1: Next.js client-side 導航（pushState）
    activateNavigationGuard();

    // L2: 瀏覽器上一頁/下一頁
    const onPopState = () => {
      const confirmed = window.confirm('你有未儲存的變更，確定要離開嗎？');
      if (!confirmed) {
        // 取消返回：暫時恢復原始 pushState 再推回當前路徑
        const saved = originalPushState ?? history.pushState.bind(history);
        saved(null, '', window.location.href);
      }
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      deactivateNavigationGuard();
    };
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
