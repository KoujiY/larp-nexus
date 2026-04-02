'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getHealthStatus } from '@/lib/styles/health-status';
import { GM_SCROLLBAR_CLASS } from '@/lib/styles/gm-form';
import type { CharacterData } from '@/types/character';
import type { Stat } from '@/types/character';

interface CharacterStatusOverviewProps {
  characters: CharacterData[];
}

/**
 * Runtime 控制台 — 角色狀態總覽
 *
 * 水平捲動的角色卡片，預設顯示頭像、名稱、第一個 stat。
 * Hover（桌面）或 Click（觸控）展開顯示全部 stats。
 * 展開區域透過 Portal 渲染至 body，避免被 overflow 裁切。
 */
export function CharacterStatusOverview({ characters }: CharacterStatusOverviewProps) {
  if (characters.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        尚無角色
      </div>
    );
  }

  return (
    <div className={`flex gap-4 overflow-x-auto pb-2 ${GM_SCROLLBAR_CLASS}`}>
      {characters.map((character) => (
        <CharacterStatusCard key={character.id} character={character} />
      ))}
    </div>
  );
}

// ─── Character Status Card ────────────────────────────────

function CharacterStatusCard({ character }: { character: CharacterData }) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const stats = character.stats ?? [];
  const primaryStat = stats[0] ?? null;
  const extraStats = stats.slice(1);
  const hasExtra = extraStats.length > 0;

  /** 根據卡片位置計算 portal overlay 的定位 */
  const updatePosition = useCallback(() => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setPopoverStyle({
      position: 'fixed',
      top: rect.bottom,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  // 展開時計算位置，並在捲動/resize 時更新
  useEffect(() => {
    if (!expanded) return;
    updatePosition();

    // 監聽捲動容器與 window resize
    const scrollParent = cardRef.current?.closest('.overflow-x-auto');
    scrollParent?.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);
    return () => {
      scrollParent?.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [expanded, updatePosition]);

  // 點擊外部收合（portal 內容也納入判斷）
  useEffect(() => {
    if (!expanded) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      // 檢查是否點在卡片內或 portal overlay 內
      if (cardRef.current?.contains(target)) return;
      const overlay = document.getElementById(`card-overlay-${character.id}`);
      if (overlay?.contains(target)) return;
      setExpanded(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded, character.id]);

  const handleClick = useCallback(() => {
    if (hasExtra) setExpanded((prev) => !prev);
  }, [hasExtra]);

  const critical = primaryStat ? isCritical(primaryStat) : false;
  const borderClass = critical
    ? 'bg-destructive/5 border-2 border-destructive/20'
    : 'bg-card border border-border/40';

  return (
    <div
      ref={cardRef}
      className="w-[200px] shrink-0"
      onMouseEnter={hasExtra ? () => setExpanded(true) : undefined}
      onMouseLeave={hasExtra ? () => setExpanded(false) : undefined}
    >
      {/* 主卡片：永遠可見 */}
      <div
        onClick={handleClick}
        className={`p-4 rounded-xl shadow-sm transition-colors ${
          hasExtra ? 'cursor-pointer' : ''
        } ${borderClass} ${expanded ? 'rounded-b-none border-b-0' : ''}`}
      >
        {/* 頭像 + 名稱 */}
        <div className="flex items-center gap-3 mb-3 h-10">
          <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-muted">
            {character.imageUrl ? (
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
      </div>

      {/* 展開區域（Portal → body） */}
      {expanded && extraStats.length > 0 &&
        createPortal(
          <div
            id={`card-overlay-${character.id}`}
            style={popoverStyle}
            className={`z-50 rounded-b-xl shadow-lg border border-t-0 px-4 pt-3 pb-4 space-y-2 ${
              critical
                ? 'bg-destructive/5 border-destructive/20'
                : 'bg-card border-border/40'
            }`}
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
          >
            {extraStats.map((stat) => (
              <StatRow key={stat.id} stat={stat} />
            ))}
          </div>,
          document.body,
        )}
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
