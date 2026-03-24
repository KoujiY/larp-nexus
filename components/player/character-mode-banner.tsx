'use client';

/**
 * 角色卡模式橫幅
 *
 * - 唯讀模式（Amber）：預覽 Baseline 資料時顯示，提供重新解鎖按鈕
 * - 遊戲進行中（Emerald）：完整互動模式，顯示遊戲代碼並提供重新解鎖按鈕
 * - isReadOnly=false 且 hasPinLock=false 時不顯示橫幅
 */

import { Button } from '@/components/ui/button';
import { Eye, Gamepad2, KeyRound } from 'lucide-react';

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
      <div className="mb-6 p-4 rounded-lg border border-env-baseline bg-env-baseline-bg text-env-baseline-fg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium mb-1 flex items-center gap-1.5">
              <Eye className="h-4 w-4" />
              預覽模式{hasBaselineData ? '（Baseline）' : ''}
            </p>
            <p className="text-sm opacity-80">
              {hasBaselineData
                ? '您正在查看角色的原始設定（Baseline）。遊戲進行中的修改不會顯示在此預覽中。'
                : '您正在以預覽模式查看此角色。所有互動功能（使用道具、技能、對抗檢定）均已禁用。'}
            </p>
          </div>
          {hasPinLock && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-env-baseline text-env-baseline-fg hover:bg-env-baseline/10"
              onClick={onRelock}
            >
              <KeyRound className="h-4 w-4 mr-1.5" />
              重新解鎖
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (hasPinLock) {
    return (
      <div className="mb-6 p-4 rounded-lg border border-env-runtime bg-env-runtime-bg text-env-runtime-fg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium mb-1 flex items-center gap-1.5">
              <Gamepad2 className="h-4 w-4" />
              遊戲進行中
            </p>
            <p className="text-sm opacity-80">
              {gameCode
                ? <>遊戲代碼：<span className="font-mono font-bold tracking-widest">{gameCode}</span></>
                : '所有互動功能已啟用。'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-env-runtime text-env-runtime-fg hover:bg-env-runtime/10"
            onClick={onRelock}
          >
            <KeyRound className="h-4 w-4 mr-1.5" />
            重新解鎖
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
