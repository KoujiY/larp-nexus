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
        ? 'bg-success/10 border-success/30'
        : 'bg-destructive/10 border-destructive/20'
    }`}>
      <div className="flex items-center gap-2">
        {result.success ? (
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
        ) : (
          <XCircle className="h-5 w-5 text-destructive shrink-0" />
        )}
        <p className="font-medium">{result.message}</p>
      </div>
    </div>
  );
}

