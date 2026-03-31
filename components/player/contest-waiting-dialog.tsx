'use client';

/**
 * 攻擊方等待 Dialog
 *
 * 居中固定 Dialog（非 Bottom Sheet），不可關閉。
 * 攻擊方在此查看自己的數值，等待防守方回應。
 *
 * 視覺語言對齊 Ethereal Manuscript 風格，
 * 與防守方 ContestResponseDialog 形成系列感。
 */

import { useEffect } from 'react';
import { Shield, Loader2, Hourglass } from 'lucide-react';
import type { AttackerWaitingDisplayData } from '@/hooks/use-contest-dialog-state';

interface ContestWaitingDialogProps {
  open: boolean;
  displayData: AttackerWaitingDisplayData | undefined;
}

export function ContestWaitingDialog({
  open,
  displayData,
}: ContestWaitingDialogProps) {
  // 鎖定背景滾動
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open || !displayData) return null;

  const { attackerValue, defenderName, sourceName, checkType, relatedStat, randomContestMaxValue } = displayData;

  // 檢定類型文案
  const checkTypeLabel = (() => {
    if (checkType === 'random_contest') {
      return `隨機對抗 D${randomContestMaxValue || 100}`;
    }
    if (checkType === 'contest' && relatedStat) {
      return `${relatedStat} 對抗`;
    }
    return '對抗檢定';
  })();

  // 副標題
  const subtitle = `你對 ${defenderName} 使用了 ${sourceName}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      {/* Dialog 容器 */}
      <div
        className="relative w-full max-w-lg rounded-2xl border border-border/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden bg-background/94 backdrop-blur-[28px]"
        style={{ boxShadow: '0 0 30px rgba(254,197,106,0.12)' }}
        role="dialog"
        aria-modal="true"
        aria-label="對抗檢定等待中"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <header className="px-6 pt-6 pb-4 flex flex-col gap-1 shrink-0">
          <div className="flex items-center gap-3">
            <Shield className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              對抗檢定
            </h1>
          </div>
          <p className="text-primary/60 text-sm font-medium">
            {subtitle}
          </p>
        </header>

        {/* ── 主內容 ──────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto px-6 pb-28 flex flex-col [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/40 [&::-webkit-scrollbar-thumb]:rounded-full">
          {/* ── 數值對比 Grid ────────────────────────────────── */}
          <section className="space-y-3 mb-8 shrink-0">
            <div className="grid grid-cols-2 gap-4">
              {/* 你的數值（攻擊方視角：左欄高亮） */}
              <div
                className="rounded-xl p-4 flex flex-col items-center justify-center bg-card/30 border border-primary/20"
                style={{ boxShadow: '0 0 25px rgba(254,197,106,0.15)' }}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
                  {checkType === 'random_contest' ? '骰子上限' : '你的數值'}
                </span>
                <span className="text-4xl font-extrabold tracking-tighter text-primary">
                  {checkType === 'random_contest' ? `D${randomContestMaxValue || 100}` : attackerValue}
                </span>
              </div>
              {/* 防守方數值（右欄低調） */}
              <div className="rounded-xl p-4 flex flex-col items-center justify-center bg-card/20 border border-white/5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  防守方
                </span>
                <span className="text-4xl font-extrabold tracking-tighter text-muted-foreground/40">
                  ???
                </span>
              </div>
            </div>
            {/* 檢定類型 chip */}
            <div className="text-center">
              <span className="inline-block text-xs font-semibold text-primary/50 py-1 px-3 bg-white/5 rounded-full">
                檢定類型：{checkTypeLabel}
              </span>
            </div>
          </section>

          {/* ── 等待區域 ──────────────────────────────────────── */}
          <section className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="rounded-xl bg-card/20 border border-white/5 p-8 w-full">
              <div className="flex flex-col items-center gap-4">
                {/* 脈衝光暈 + 旋轉 icon */}
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                  <Loader2
                    className="w-12 h-12 text-primary animate-spin relative z-10"
                    style={{ animationDuration: '3s' }}
                  />
                </div>
                <h2 className="text-xl font-bold text-foreground">
                  等待防守方回應中
                </h2>
                <p className="text-sm text-muted-foreground max-w-[240px]">
                  對方正在決定是否使用道具或技能回應
                </p>
              </div>
            </div>
          </section>
        </main>

        {/* ── Footer（固定底部） ───────────────────────────────── */}
        <footer className="absolute bottom-0 left-0 right-0 p-6 bg-background/90 backdrop-blur-[20px] border-t border-border/10 shrink-0 z-10">
          <button
            type="button"
            className="w-full h-14 rounded-xl font-extrabold text-base tracking-wide flex items-center justify-center gap-2 bg-linear-to-br from-primary/50 to-primary/30 text-primary-foreground/60 cursor-not-allowed"
            disabled
          >
            <Hourglass className="w-5 h-5" />
            等待回應中...
          </button>
        </footer>
      </div>
    </div>
  );
}
