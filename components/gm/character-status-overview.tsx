'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getHealthStatus } from '@/lib/styles/health-status';
import { GM_SCROLLBAR_CLASS } from '@/lib/styles/gm-form';
import { GM_DIALOG_CONTENT_CLASS } from '@/lib/styles/gm-form';
import { computeEffectiveStats } from '@/lib/utils/compute-effective-stats';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { CharacterData } from '@/types/character';
import type { Stat } from '@/types/character';

interface CharacterStatusOverviewProps {
  characters: CharacterData[];
}

/**
 * Runtime 控制台 — 角色狀態總覽
 *
 * 水平捲動的角色卡片，預設顯示頭像、名稱、第一個 stat。
 * 點擊整張卡片開啟 Dialog 顯示完整數值（觸控與桌面一致體驗）。
 */
export function CharacterStatusOverview({ characters }: CharacterStatusOverviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterData | null>(null);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState, characters.length]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.7;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }, []);

  if (characters.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        尚無角色
      </div>
    );
  }

  return (
    <div className="relative">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll('left')}
          className="cursor-pointer absolute -left-1 sm:-left-2.5 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10 min-w-[44px] min-h-[44px] w-8 h-10 rounded-lg bg-background/80 backdrop-blur-sm border border-border/20 shadow-sm flex items-center justify-center text-muted-foreground/60 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        ref={scrollRef}
        className={`flex gap-4 overflow-x-auto pb-2 ${GM_SCROLLBAR_CLASS}`}
      >
        {characters.map((character) => (
          <CharacterStatusCard
            key={character.id}
            character={character}
            onClick={() => setSelectedCharacter(character)}
          />
        ))}
      </div>

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll('right')}
          className="cursor-pointer absolute -right-1 sm:-right-2.5 translate-x-1/2 top-1/2 -translate-y-1/2 z-10 min-w-[44px] min-h-[44px] w-8 h-10 rounded-lg bg-background/80 backdrop-blur-sm border border-border/20 shadow-sm flex items-center justify-center text-muted-foreground/60 transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      <CharacterStatusDetailDialog
        character={selectedCharacter}
        onClose={() => setSelectedCharacter(null)}
      />
    </div>
  );
}

// ─── Character Status Card ────────────────────────────────

interface CharacterStatusCardProps {
  character: CharacterData;
  onClick: () => void;
}

function CharacterStatusCard({ character, onClick }: CharacterStatusCardProps) {
  const rawStats = character.stats ?? [];
  const items = character.items ?? [];
  const stats = items.length > 0 ? computeEffectiveStats(rawStats, items) : rawStats;
  const primaryStat = stats[0] ?? null;

  const critical = primaryStat ? isCritical(primaryStat) : false;
  const borderClass = critical
    ? 'bg-destructive/5 border-2 border-destructive/20'
    : 'bg-card border border-border/40';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-[160px] sm:w-[200px] shrink-0 p-4 rounded-xl shadow-sm transition-colors cursor-pointer text-left',
        borderClass,
      )}
    >
      {/* 頭像 + 名稱 */}
      <div className="flex items-center gap-3 mb-3 h-10">
        <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-muted">
          {character.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={character.imageUrl}
              alt={character.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm font-bold">
              {character.name.charAt(0)}
            </div>
          )}
        </div>
        <h4 className="text-sm font-bold text-foreground truncate">{character.name}</h4>
      </div>

      {/* 第一個 stat（摘要） */}
      {primaryStat ? (
        <StatRow stat={primaryStat} />
      ) : (
        <p className="text-[10px] text-muted-foreground opacity-50">無數值資料</p>
      )}
    </button>
  );
}

// ─── Character Status Detail Dialog ───────────────────────

interface CharacterStatusDetailDialogProps {
  character: CharacterData | null;
  onClose: () => void;
}

function CharacterStatusDetailDialog({
  character,
  onClose,
}: CharacterStatusDetailDialogProps) {
  const open = character !== null;
  const rawStats = character?.stats ?? [];
  const items = character?.items ?? [];
  const stats = items.length > 0 ? computeEffectiveStats(rawStats, items) : rawStats;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[520px] p-0 gap-0')}
        showCloseButton={false}
      >
        {character && (
          <div className="p-8 space-y-6">
            {/* 頭像 + 名稱 */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 bg-muted">
                {character.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={character.imageUrl}
                    alt={character.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-lg font-bold">
                    {character.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-xl font-bold tracking-tight truncate">
                  {character.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  角色狀態詳情
                </DialogDescription>
              </div>
            </div>

            {/* Stats 卡片 grid（每個狀態一張卡片，依有無 maxValue 切換樣式） */}
            {stats.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stats.map((stat) =>
                  stat.maxValue !== undefined && stat.maxValue !== null ? (
                    <StatCardWithMax key={stat.id} stat={stat} />
                  ) : (
                    <StatCardNoMax key={stat.id} stat={stat} />
                  ),
                )}
              </div>
            ) : (
              <div className="bg-muted/30 border border-border/20 rounded-xl p-5 shadow-sm">
                <p className="text-sm text-muted-foreground opacity-50 text-center py-2">
                  無數值資料
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Stat Cards (Dialog 內使用) ───────────────────────────

/** 有上限的數值卡片：當前值 / 上限 + 進度條 + 健康狀態標籤 */
function StatCardWithMax({ stat }: { stat: Stat }) {
  const percent = Math.min(100, Math.max(0, (stat.value / stat.maxValue!) * 100));
  const health = getHealthStatus(percent);
  const isCrit = health.level === 'critical';

  return (
    <div
      className={cn(
        'rounded-xl border p-4 shadow-sm transition-colors',
        isCrit
          ? 'bg-destructive/5 border-destructive/30'
          : 'bg-card border-border/40',
      )}
    >
      {/* Header：名稱 + 健康狀態 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-muted-foreground tracking-wide">
          {stat.name}
        </span>
        <span
          className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full',
            health.textColor,
            isCrit ? 'bg-destructive/10 font-extrabold' : 'bg-muted/60',
          )}
        >
          {health.label}
        </span>
      </div>

      {/* 大數值：current / max */}
      <div className="flex items-baseline justify-center gap-1 mb-3">
        <span className="text-2xl font-extrabold tabular-nums text-foreground">
          {stat.value}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          / {stat.maxValue}
        </span>
      </div>

      {/* 進度條 */}
      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
        <div
          className={cn(health.barColor, 'h-full transition-all duration-500')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** 無上限的數值卡片：純數字顯示，適用於屬性點、計分等 */
function StatCardNoMax({ stat }: { stat: Stat }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
      <div className="text-xs font-bold text-muted-foreground tracking-wide mb-2">
        {stat.name}
      </div>
      <div className="text-2xl font-extrabold tabular-nums text-primary text-center">
        {stat.value}
      </div>
    </div>
  );
}

// ─── Stat Row ─────────────────────────────────────────────

function StatRow({ stat }: { stat: Stat }) {
  const hasMax = stat.maxValue !== undefined && stat.maxValue !== null;

  if (hasMax) {
    const percent = Math.min(100, Math.max(0, (stat.value / stat.maxValue!) * 100));
    const health = getHealthStatus(percent);
    const isCrit = health.level === 'critical';

    return (
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-bold">
          <span className="text-muted-foreground">
            {stat.name} {stat.value}/{stat.maxValue}
          </span>
          <span className={`${health.textColor} ${isCrit ? 'font-extrabold' : ''}`}>
            {health.label}
          </span>
        </div>
        <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
          <div
            className={`${health.barColor} h-full transition-all duration-500`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  // 無 maxValue：純數值顯示
  return (
    <div className="flex justify-between text-[10px] font-bold">
      <span className="text-muted-foreground">{stat.name}</span>
      <span className="text-primary font-extrabold">{stat.value}</span>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────

/** 判斷 stat 是否處於 critical 狀態 */
function isCritical(stat: Stat): boolean {
  if (stat.maxValue === undefined || stat.maxValue === null) return false;
  const percent = (stat.value / stat.maxValue) * 100;
  return getHealthStatus(percent).level === 'critical';
}
