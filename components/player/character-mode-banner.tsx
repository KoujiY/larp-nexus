'use client';

/**
 * 角色卡模式橫幅（Fixed Top Banner）
 *
 * - 遊戲準備中（預覽模式）：hasPinLock + isReadOnly，提供重新解鎖按鈕
 * - 遊戲進行中（Runtime 模式）：hasPinLock + !isReadOnly，提供重新鎖定按鈕
 * - 無 PIN 時不顯示橫幅
 *
 * 佈局注意：此元件使用 fixed 定位（top-0 z-[60]），父層需加 pt-10 為其保留空間。
 */

import { LockKeyhole } from 'lucide-react';

export interface CharacterModeBannerProps {
  isReadOnly: boolean;
  hasPinLock: boolean;
  gameCode?: string;
  onRelock: () => void;
}

export function CharacterModeBanner({
  isReadOnly,
  hasPinLock,
  gameCode,
  onRelock,
}: CharacterModeBannerProps) {
  // 預覽模式橫幅（靜態圓點）
  if (isReadOnly) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[60] bg-primary/15 backdrop-blur-md border-b border-primary/10">
        <div className="max-w-[896px] mx-auto px-6 py-2 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary/50 shrink-0" />
            <span className="text-primary text-xs tracking-wider uppercase font-bold">
              遊戲準備中 — 預覽模式
            </span>
          </div>
          {hasPinLock && (
            <button
              className="bg-primary/20 hover:bg-primary/30 transition-colors px-3 py-1 rounded text-[10px] font-bold text-primary border border-primary/20 flex items-center gap-1"
              onClick={onRelock}
            >
              <LockKeyhole className="h-3 w-3" />
              重新解鎖
            </button>
          )}
        </div>
      </div>
    );
  }

  // 遊戲進行中（Runtime）模式橫幅（脈衝圓點）
  if (hasPinLock) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[60] bg-primary/15 backdrop-blur-md border-b border-primary/10">
        <div className="max-w-[896px] mx-auto px-6 py-2 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
            <span className="text-primary text-xs tracking-wider uppercase font-bold">
              遊戲進行中 — Runtime 模式
            </span>
            {gameCode && (
              <span className="hidden sm:inline text-primary/60 text-xs font-mono ml-2">
                [{gameCode}]
              </span>
            )}
          </div>
          <button
            className="bg-primary/20 hover:bg-primary/30 transition-colors px-3 py-1 rounded text-[10px] font-bold text-primary border border-primary/20 flex items-center gap-1"
            onClick={onRelock}
          >
            <LockKeyhole className="h-3 w-3" />
            重新鎖定
          </button>
        </div>
      </div>
    );
  }

  return null;
}
