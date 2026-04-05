'use client';

/**
 * 預設事件卡片 — 展開/收合式
 *
 * 收合時：動作類型 badges + 事件名稱 + 描述 line-clamp-1 + footer（動作數 + chevron）
 * 展開時：完整描述 + 動作列表（左側邊線卡片風格，對齊 AbilityCard EffectCard）
 *
 * Runtime 模式額外顯示：執行按鈕、執行次數、runtimeOnly badge
 */

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ChevronDown,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconActionButton } from '@/components/gm/icon-action-button';
import { GmInfoLine } from '@/components/gm/gm-info-line';
import {
  GM_ATTR_BADGE_BASE,
  GM_BADGE_VARIANTS,
  GM_DETAIL_HEADER_CLASS,
  GM_ACCENT_CARD_CLASS,
  GM_DIALOG_CONTENT_CLASS,
  GM_CANCEL_BUTTON_CLASS,
} from '@/lib/styles/gm-form';
import { validatePresetEventActions } from '@/lib/preset-event/validate-action';
import type { PresetEventAction, PresetEventRuntime } from '@/types/game';
import type { CharacterData } from '@/types/character';

import { PRESET_ACTION_TYPE_LABELS } from '@/lib/preset-event/constants';
import { formatDuration } from '@/lib/utils/format-duration';

interface PresetEventCardProps {
  event: PresetEventRuntime;
  characters: CharacterData[];
  /** Runtime 模式：顯示 runtimeOnly badge 等 */
  isRuntime?: boolean;
  onEdit: () => void;
  onRemove: () => void;
  disabled?: boolean;
}

export function PresetEventCard({
  event,
  characters,
  isRuntime = false,
  onEdit,
  onRemove,
  disabled,
}: PresetEventCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const validationMap = validatePresetEventActions(event.actions, characters);
  const invalidCount = Array.from(validationMap.values()).filter((r) => !r.valid).length;
  const wasExecuted = isRuntime && event.executionCount > 0;
  return (
    <>
    <div
      className={cn(
        'group relative bg-card rounded-xl shadow-sm overflow-hidden',
        'transition-all border border-border/10',
        'hover:shadow-md cursor-pointer',
      )}
      onClick={toggleExpand}
    >
      <div className="relative z-10 p-5 flex flex-col min-h-[180px]">

        {/* ── 頂部：badges + 操作按鈕 ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {invalidCount > 0 && (
              <span
                className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                title={`${invalidCount} 個動作引用無效`}
              >
                <AlertTriangle className="h-3 w-3" />
                {invalidCount}
              </span>
            )}
            {isRuntime && event.runtimeOnly && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                僅本場次
              </span>
            )}
            {wasExecuted && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                已執行{event.executionCount > 1 ? ` ×${event.executionCount}` : ''}
              </span>
            )}
          </div>

          {/* 操作按鈕 */}
          <div className="flex items-center gap-1 shrink-0">
            <IconActionButton
              icon={<Pencil className="h-4 w-4" />}
              label="編輯"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              disabled={disabled}
            />
            <IconActionButton
              icon={<Trash2 className="h-4 w-4" />}
              label="刪除"
              variant="destructive"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setDeleteOpen(true); }}
              disabled={disabled}
            />
          </div>
        </div>

        {/* ── 名稱 + 描述 ── */}
        <div className="mt-2">
          <h3 className="text-xl font-black text-foreground">
            {event.name || '未命名事件'}
          </h3>
          {!expanded && event.description && (
            <p className="text-sm mt-1 text-muted-foreground line-clamp-1">
              {event.description}
            </p>
          )}
        </div>

        {/* ── 展開內容 ── */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/10 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* 描述 */}
            {event.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {event.description}
              </p>
            )}

            {/* 動作列表 — 左側邊線卡片風格 */}
            <div className="space-y-2">
              <h4 className={GM_DETAIL_HEADER_CLASS}>
                事件動作
              </h4>
              <div className="space-y-2">
                {event.actions.map((action) => {
                  const validation = validationMap.get(action.id);
                  return (
                    <ActionDetailCard
                      key={action.id}
                      action={action}
                      characters={characters}
                      validation={validation}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer：動作數 + chevron ── */}
        <div className={cn(
          'flex items-center justify-between gap-2',
          !expanded && 'mt-auto pt-4 border-t border-border/10',
          expanded && 'pt-3 border-t border-border/10',
        )}>
          <div className="flex items-center gap-2">
            <span className={cn(GM_ATTR_BADGE_BASE, GM_BADGE_VARIANTS.muted)}>
              {event.actions.length} 個動作
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
          >
            <ChevronDown
              className={cn(
                'h-5 w-5 transition-transform duration-200',
                expanded && 'rotate-180',
              )}
            />
          </button>
        </div>
      </div>
    </div>

    {/* 刪除確認 Dialog */}
    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DialogContent
        className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[400px] p-0 gap-0')}
        showCloseButton={false}
      >
        <div className="p-8 space-y-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/15 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <DialogTitle className="text-2xl font-bold tracking-tight">確認刪除事件</DialogTitle>
          </div>

          <div className="bg-muted/50 border border-border/20 rounded-xl p-5 shadow-sm space-y-2">
            <p className="font-bold text-foreground">{event.name}</p>
            <p className="text-sm text-muted-foreground">
              刪除後將移除此事件及其所有動作設定，此操作無法復原。
            </p>
          </div>
        </div>

        <div className="px-8 pb-8 pt-0 flex gap-3">
          <button
            type="button"
            onClick={() => setDeleteOpen(false)}
            className={cn(GM_CANCEL_BUTTON_CLASS, 'flex-1 py-3')}
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => { setDeleteOpen(false); onRemove(); }}
            className="flex-1 py-3 px-4 rounded-lg text-sm font-bold cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/10 transition-all active:scale-[0.98]"
          >
            確認刪除
          </button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── 內部子元件 ─────────────────────────────────

/** 單一動作詳情卡片 — 左側邊線卡片 */
function ActionDetailCard({
  action,
  characters,
  validation,
}: {
  action: PresetEventAction;
  characters: CharacterData[];
  validation?: { valid: boolean; reason?: string };
}) {
  const typeLabel = PRESET_ACTION_TYPE_LABELS[action.type] ?? action.type;
  const charMap = new Map(characters.map((c) => [c.id, c]));

  return (
    <div className={cn(GM_ACCENT_CARD_CLASS, 'space-y-1.5')}>
      {/* 類型 + 摘要 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          <span className="text-muted-foreground">{typeLabel}：</span>
          {getActionSummary(action, charMap)}
        </p>
        {validation && !validation.valid && (
          <span className="flex items-center gap-1 text-[9px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="h-3 w-3" />
            {validation.reason}
          </span>
        )}
      </div>

      {/* 目標資訊 */}
      {action.type === 'broadcast' && action.broadcastTargets && (
        <GmInfoLine
          label="目標"
          value={action.broadcastTargets === 'all'
            ? '全體角色'
            : `${(action.broadcastTargets as string[]).map((id) => charMap.get(id)?.name ?? id).join('、')}`}
        />
      )}
      {action.type === 'stat_change' && (
        <>
          <GmInfoLine
            label="目標"
            value={action.statTargets === 'all'
              ? '全體角色'
              : `${((action.statTargets as string[]) || []).map((id) => charMap.get(id)?.name ?? id).join('、')}`}
          />
          <GmInfoLine
            label="變更"
            value={formatStatChangeDetail(action)}
          />
          {(action.duration ?? 0) > 0 && (
            <GmInfoLine label="持續" value={formatDuration(action.duration!, 'short')} />
          )}
        </>
      )}
      {(action.type === 'reveal_secret' || action.type === 'reveal_task') && action.revealCharacterId && (
        <GmInfoLine
          label="角色"
          value={charMap.get(action.revealCharacterId)?.name ?? action.revealCharacterId}
        />
      )}

    </div>
  );
}


/** 格式化 stat_change 詳情 */
function formatStatChangeDetail(action: PresetEventAction): string {
  const target = action.statChangeTarget === 'maxValue' ? '最大值' : '當前值';
  const sign = (action.statChangeValue ?? 0) >= 0 ? '+' : '';
  const base = `${action.statName} ${target} ${sign}${action.statChangeValue ?? 0}`;
  const sync = action.statChangeTarget === 'maxValue' && action.syncValue ? '（同步當前值）' : '';
  return `${base}${sync}`;
}

/** 產生動作摘要文字 */
function getActionSummary(action: PresetEventAction, charMap: Map<string, CharacterData>): string {
  switch (action.type) {
    case 'broadcast':
      return action.broadcastTitle || '(無標題)';
    case 'stat_change': {
      const target = action.statChangeTarget === 'maxValue' ? '最大值' : '';
      const sign = (action.statChangeValue ?? 0) >= 0 ? '+' : '';
      const timedSuffix = (action.duration ?? 0) > 0 ? ` (${formatDuration(action.duration!, 'short')})` : '';
      return `${action.statName}${target} ${sign}${action.statChangeValue ?? 0}${timedSuffix}`;
    }
    case 'reveal_secret': {
      const char = action.revealCharacterId ? charMap.get(action.revealCharacterId) : undefined;
      const secret = char?.secretInfo?.secrets?.find((s) => s.id === action.revealTargetId);
      return secret?.title ?? '揭露隱藏資訊';
    }
    case 'reveal_task': {
      const char = action.revealCharacterId ? charMap.get(action.revealCharacterId) : undefined;
      const task = char?.tasks?.find((t) => t.id === action.revealTargetId);
      return task?.title ?? '揭露隱藏任務';
    }
    default:
      return action.type;
  }
}
