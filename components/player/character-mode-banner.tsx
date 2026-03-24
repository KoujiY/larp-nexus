'use client';

/**
 * 角色卡模式橫幅
 *
 * - 唯讀模式（Amber）：預覽 Baseline 資料時顯示，提供重新解鎖按鈕
 * - 遊戲進行中（Emerald）：完整互動模式，顯示遊戲代碼並提供重新解鎖按鈕
 * - isReadOnly=false 且 hasPinLock=false 時不顯示橫幅
 */

import { Button } from '@/components/ui/button';

export interface CharacterModeBannerProps {
  /** 唯讀（預覽）模式 */
  isReadOnly: boolean;
  /** 是否有 PIN 鎖 */
  hasPinLock: boolean;
  /** Baseline 資料是否存在（唯讀時使用） */
  hasBaselineData: boolean;
  /** 遊戲代碼（遊戲進行中模式顯示） */
  gameCode?: string;
  /** 重新解鎖按鈕的回呼 */
  onRelock: () => void;
}

export function CharacterModeBanner({
  isReadOnly,
  hasPinLock,
  hasBaselineData,
  gameCode,
  onRelock,
}: CharacterModeBannerProps) {
  if (isReadOnly) {
    return (
      <div className="mb-6 p-4 rounded-lg border border-amber-500 bg-amber-50 text-amber-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium mb-1">
              👁 預覽模式{hasBaselineData ? '（Baseline）' : ''}
            </p>
            <p className="text-sm text-amber-800">
              {hasBaselineData
                ? '您正在查看角色的原始設定（Baseline）。遊戲進行中的修改不會顯示在此預覽中。'
                : '您正在以預覽模式查看此角色。所有互動功能（使用道具、技能、對抗檢定）均已禁用。'}
            </p>
          </div>
          {hasPinLock && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-amber-500 text-amber-900 hover:bg-amber-100"
              onClick={onRelock}
            >
              🔑 重新解鎖
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (hasPinLock) {
    return (
      <div className="mb-6 p-4 rounded-lg border border-emerald-500 bg-emerald-50 text-emerald-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium mb-1">🎮 遊戲進行中</p>
            <p className="text-sm text-emerald-800">
              {gameCode
                ? <>遊戲代碼：<span className="font-mono font-bold tracking-widest">{gameCode}</span></>
                : '所有互動功能已啟用。'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-emerald-500 text-emerald-900 hover:bg-emerald-100"
            onClick={onRelock}
          >
            🔑 重新解鎖
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
