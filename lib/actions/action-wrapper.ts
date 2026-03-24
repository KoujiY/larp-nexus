/**
 * Server Action 共用包裝器
 *
 * 消除四個 Server Action（item-use, skill-use, contest-respond, character-update）
 * 頂層重複的 dbConnect + try/catch + error 格式化樣板。
 *
 * 使用方式：
 *   export async function useItem(...): Promise<ApiResponse<UseItemResult>> {
 *     return withAction<UseItemResult>(async () => {
 *       // 業務邏輯...
 *       return { success: true, data: ... };
 *     });
 *   }
 *
 * 注意：呼叫方須在外層函數宣告明確的回傳型別（Promise<ApiResponse<T>>），
 * 並在 withAction 呼叫處提供型別參數（withAction<T>），以確保型別安全。
 */

import dbConnect from '@/lib/db/mongodb';
import type { ApiResponse } from '@/types/api';

/**
 * 執行 Server Action 的通用包裝器
 *
 * @param handler 業務邏輯函式，負責回傳 ApiResponse<T>
 * @returns handler 的結果，或捕獲例外後的 INTERNAL_ERROR 回應
 */
export async function withAction<T>(
  // handler 型別使用 ApiResponse<unknown> 而非 ApiResponse<T>：
  // 當 handler 有多個分支且各分支回傳不同 literal 型別時（如 checkPassed: false / true），
  // TypeScript 會從第一個 branch 推斷 T 導致衝突。
  // 型別安全由外層函數的宣告回傳型別（Promise<ApiResponse<T>>）提供。
  handler: () => Promise<ApiResponse<unknown>>
): Promise<ApiResponse<T>> {
  try {
    await dbConnect();
    return await handler() as ApiResponse<T>;
  } catch (error) {
    // M-4: 只記錄錯誤訊息，避免洩漏可能含有使用者資料的完整錯誤物件
    const message = error instanceof Error ? error.message : String(error);
    console.error('[withAction] Unhandled error:', message);
    return {
      success: false,
      error: 'INTERNAL_ERROR',
      message: '伺服器發生錯誤，請稍後再試',
    };
  }
}
