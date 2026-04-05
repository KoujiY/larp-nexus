'use client';

/**
 * 控制台用預設事件快速執行面板
 *
 * 使用 Select 下拉選單選取事件 + 執行按鈕的緊湊設計。
 * 無論事件數量多寡，面板高度固定，不擠壓下方空間。
 * 視覺風格對齊 GameBroadcastPanel（card + header）。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Zap, Play, RotateCcw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  GM_LABEL_CLASS,
  GM_DIALOG_CONTENT_CLASS,
  GM_CANCEL_BUTTON_CLASS,
} from '@/lib/styles/gm-form';
import { validatePresetEventActions } from '@/lib/preset-event/validate-action';
import { PRESET_ACTION_TYPE_LABELS } from '@/lib/preset-event/constants';
import { getRuntimePresetEvents, runPresetEvent } from '@/app/actions/preset-events';
import type { PresetEventRuntime } from '@/types/game';
import type { CharacterData } from '@/types/character';

interface PresetEventQuickPanelProps {
  gameId: string;
  characters: CharacterData[];
  onExecuted?: () => void;
}

export function PresetEventQuickPanel({ gameId, characters, onExecuted }: PresetEventQuickPanelProps) {
  const [events, setEvents] = useState<PresetEventRuntime[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadEvents = useCallback(async () => {
    const result = await getRuntimePresetEvents(gameId);
    if (result.success && result.data) {
      setEvents(result.data);
    }
    setIsLoading(false);
  }, [gameId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedId),
    [events, selectedId],
  );

  const handleExecuteClick = useCallback(() => {
    if (!selectedEvent) return;
    setConfirmOpen(true);
  }, [selectedEvent]);

  const handleConfirmExecute = useCallback(async () => {
    if (!selectedEvent) return;
    setConfirmOpen(false);
    setIsExecuting(true);
    try {
      const result = await runPresetEvent(gameId, selectedEvent.id);
      if (result.success && result.data) {
        setEvents((prev) =>
          prev.map((e) =>
            e.id === selectedEvent.id
              ? { ...e, executedAt: result.data!.executedAt, executionCount: e.executionCount + 1 }
              : e,
          ),
        );

        const { results: actionResults } = result.data;
        const succeeded = actionResults.filter((r) => r.status === 'success').length;
        const skipped = actionResults.filter((r) => r.status === 'skipped').length;
        const failed = actionResults.filter((r) => r.status === 'failed').length;

        // 顯示失敗/跳過原因（自然語言）
        const skippedItems = actionResults.filter((r) => r.status === 'skipped');
        const failedItems = actionResults.filter((r) => r.status === 'failed');
        const lines: string[] = [];
        if (skippedItems.length > 0) {
          lines.push(`跳過動作：${skippedItems.map((r) => PRESET_ACTION_TYPE_LABELS[r.type] ?? r.type).join('、')}`)
          for (const r of skippedItems) {
            if (r.reason) lines.push(`  → ${r.reason}`);
          }
        }
        if (failedItems.length > 0) {
          lines.push(`失敗動作：${failedItems.map((r) => PRESET_ACTION_TYPE_LABELS[r.type] ?? r.type).join('、')}`);
          for (const r of failedItems) {
            if (r.reason) lines.push(`  → ${r.reason}`);
          }
        }

        if (failed > 0 || skipped > 0) {
          toast.warning(
            `「${selectedEvent.name}」：${succeeded} 成功${skipped > 0 ? `、${skipped} 跳過` : ''}${failed > 0 ? `、${failed} 失敗` : ''}`,
            { description: lines.length > 0 ? lines.join('\n') : undefined },
          );
        } else {
          toast.success(`「${selectedEvent.name}」已執行：全部 ${succeeded} 個動作成功`);
        }
        onExecuted?.();
      } else {
        toast.error(result.message || '執行失敗');
      }
    } catch {
      toast.error('執行發生錯誤');
    } finally {
      setIsExecuting(false);
    }
  }, [gameId, selectedEvent, onExecuted]);

  /** 產生 Select 選項的標籤（含執行次數提示） */
  const getEventLabel = (event: PresetEventRuntime): string => {
    const parts = [event.name || '未命名事件'];
    if (event.runtimeOnly) parts.push('（僅本場次）');
    if (event.executionCount > 0) parts.push(`— 已執行 ×${event.executionCount}`);
    return parts.join(' ');
  };

  return (
    <div className="bg-card p-6 rounded-xl border border-border/40 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          事件選單
        </h3>
        <button
          type="button"
          onClick={loadEvents}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
          title="重新載入"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">載入中...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚未建立預設事件</p>
      ) : (
        <div className="space-y-4">
          {/* Select + Execute */}
          <div>
            <label className={GM_LABEL_CLASS}>選擇事件</label>
            <div className="flex items-center gap-2">
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="min-w-0 flex-1 w-auto overflow-hidden bg-muted border-none rounded-lg h-10 text-sm font-semibold focus:ring-1 focus:ring-primary *:data-[slot=select-value]:truncate *:data-[slot=select-value]:block *:data-[slot=select-value]:line-clamp-none">
                  <SelectValue placeholder="選擇要執行的事件" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {getEventLabel(event)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={handleExecuteClick}
                disabled={!selectedId || isExecuting}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/80 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer shrink-0"
              >
                {isExecuting ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                    執行中
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    執行
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Selected event detail */}
          {selectedEvent && (
            <EventDetailBadges event={selectedEvent} characters={characters} />
          )}
        </div>
      )}

      {/* 執行確認 Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[400px] p-0 gap-0')}
          showCloseButton={false}
        >
          <div className="p-8 space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center">
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <DialogTitle className="text-2xl font-bold tracking-tight">確認執行事件</DialogTitle>
            </div>
            <div className="bg-muted/50 border border-border/20 rounded-xl p-5 shadow-sm space-y-2">
              <p className="font-bold text-foreground">{selectedEvent?.name}</p>
              <p className="text-sm text-muted-foreground">
                將依序執行此事件中的 {selectedEvent?.actions.length ?? 0} 個動作，執行後無法撤銷。
              </p>
            </div>
          </div>
          <div className="px-8 pb-8 pt-0 flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className={cn(GM_CANCEL_BUTTON_CLASS, 'flex-1 py-3')}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirmExecute}
              className="flex-1 py-3 px-4 rounded-lg text-sm font-bold cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/10 transition-all active:scale-[0.98]"
            >
              確認執行
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────

/** 選取事件後顯示的資訊 badges */
function EventDetailBadges({
  event,
  characters,
}: {
  event: PresetEventRuntime;
  characters: CharacterData[];
}) {
  const validationMap = validatePresetEventActions(event.actions, characters);
  const invalidCount = Array.from(validationMap.values()).filter((r) => !r.valid).length;
  const wasExecuted = event.executionCount > 0;

  return (
    <div className="flex items-center gap-1.5 flex-wrap px-1">
      {/* 動作數 */}
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/20">
        {event.actions.length} 個動作
      </span>
      {/* 無效引用警告 */}
      {invalidCount > 0 && (
        <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <AlertTriangle className="h-3 w-3" />
          {invalidCount}
        </span>
      )}
      {/* 僅本場次 */}
      {event.runtimeOnly && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          僅本場次
        </span>
      )}
      {/* 已執行 */}
      {wasExecuted && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
          已執行{event.executionCount > 1 ? ` ×${event.executionCount}` : ''}
        </span>
      )}
    </div>
  );
}
