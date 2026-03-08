/**
 * 使用結果顯示組件
 * 統一顯示技能/道具使用結果
 * 
 * Phase 7: 拆分 Dialog 組件
 */

'use client';

import { CheckCircle2, XCircle } from 'lucide-react';

export interface UseResultDisplayProps {
  result: { success: boolean; message: string } | null;
}

/**
 * 使用結果顯示組件
 * 顯示技能或道具使用的成功/失敗結果
 */
export function UseResultDisplay({ result }: UseResultDisplayProps) {
  if (!result) {
    return null;
  }

  return (
    <div className={`p-4 rounded-lg border-2 ${
      result.success 
        ? 'bg-green-50 border-green-200 text-green-800' 
        : 'bg-red-50 border-red-200 text-red-800'
    }`}>
      <div className="flex items-center gap-2">
        {result.success ? (
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
        ) : (
          <XCircle className="h-5 w-5 text-red-600 shrink-0" />
        )}
        <p className="font-medium">{result.message}</p>
      </div>
    </div>
  );
}

