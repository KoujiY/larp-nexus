/**
 * Server Action 共用包裝器
 *
 * 統一所有 Server Action 的頂層樣板（BACKLOG：perf 包裝統一）：
 * - dbConnect（置於 perf 計時窗內，各 action 的計時邊界從此一致）
 * - runWithPerf：PERF_LOG=1 時輸出 [perf] 行（未啟用時直通零開銷）
 * - try/catch + INTERNAL_ERROR 格式化（Next.js 控制流錯誤原樣重拋）
 *
 * 使用方式：
 *   export async function useItem(...): Promise<ApiResponse<UseItemResult>> {
 *     return withAction<UseItemResult>('item-use', async () => {
 *       // 業務邏輯...
 *       return { success: true, data: ... };
 *     });
 *   }
 *
 * 注意：呼叫方須在外層函數宣告明確的回傳型別（Promise<ApiResponse<T>>），
 * 並在 withAction 呼叫處提供型別參數（withAction<T>），以確保型別安全。
 */

import dbConnect from '@/lib/db/mongodb';
import { runWithPerf } from '@/lib/perf/perf-context';
import type { ApiResponse } from '@/types/api';

/**
 * 是否為 Next.js 的控制流錯誤——redirect() / notFound() 以 throw 特殊
 * error（digest 帶 NEXT_ 前綴）實現，吞掉會破壞導航，必須原樣重拋
 */
function isNextControlFlowError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    String((error as { digest: unknown }).digest).startsWith('NEXT_')
  );
}

/**
 * 執行 Server Action 的通用包裝器
 *
 * @param name perf 量測名稱（kebab-case，如 'contest-respond'）
 * @param handler 業務邏輯函式，負責回傳 ApiResponse<T>
 * @returns handler 的結果，或捕獲例外後的 INTERNAL_ERROR 回應
 */
export async function withAction<T>(
  name: string,
  // handler 型別使用 ApiResponse<unknown> 而非 ApiResponse<T>：
  // 當 handler 有多個分支且各分支回傳不同 literal 型別時（如 checkPassed: false / true），
  // TypeScript 會從第一個 branch 推斷 T 導致衝突。
  // 型別安全由外層函數的宣告回傳型別（Promise<ApiResponse<T>>）提供。
  handler: () => Promise<ApiResponse<unknown>>
): Promise<ApiResponse<T>> {
  try {
    return await runWithPerf(name, async () => {
      await dbConnect();
      return await handler() as ApiResponse<T>;
    });
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    // M-4: 只記錄錯誤訊息，避免洩漏可能含有使用者資料的完整錯誤物件
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[withAction] Unhandled error in ${name}:`, message);
    return {
      success: false,
      error: 'INTERNAL_ERROR',
      message: '伺服器發生錯誤，請稍後再試',
    };
  }
}
