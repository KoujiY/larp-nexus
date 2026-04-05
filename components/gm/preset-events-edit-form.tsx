'use client';

/**
 * 預設事件管理 — 卡片 grid 佈局（統一 Baseline + Runtime）
 *
 * Baseline 模式：CRUD 事件定義，無執行功能
 * Runtime 模式：CRUD + 執行功能 + runtimeOnly 標記 + 執行結果顯示
 *
 * 與技能/道具分頁結構對齊：grid 卡片 + 新增按鈕在第一位 + EmptyState
 */

import { useState, useEffect, useCallback } from 'react';
import { Zap } from 'lucide-react';
import { toast } from 'sonner';
import { PresetEventCard } from '@/components/gm/preset-event-card';
import { PresetEventEditor } from '@/components/gm/preset-event-editor';
import { DashedAddButton } from '@/components/gm/dashed-add-button';
import { GmEmptyState } from '@/components/gm/gm-empty-state';
import { GM_SECTION_TITLE_CLASS } from '@/lib/styles/gm-form';
import {
  createPresetEvent,
  updatePresetEvent,
  deletePresetEvent,
  createRuntimePresetEvent,
  updateRuntimePresetEvent,
  deleteRuntimePresetEvent,
  getRuntimePresetEvents,
} from '@/app/actions/preset-events';
import type { PresetEvent, PresetEventInput, PresetEventRuntime } from '@/types/game';
import type { CharacterData } from '@/types/character';


interface PresetEventsEditFormProps {
  gameId: string;
  /** Baseline 事件定義（非 Runtime 模式時使用） */
  initialEvents: PresetEvent[];
  characters: CharacterData[];
  /** 是否 Runtime 模式 */
  isRuntime?: boolean;
}

export function PresetEventsEditForm({
  gameId,
  initialEvents,
  characters,
  isRuntime = false,
}: PresetEventsEditFormProps) {
  // Baseline: use initialEvents directly; Runtime: fetch from GameRuntime
  const [events, setEvents] = useState<PresetEventRuntime[]>(
    initialEvents.map(toRuntimeShape),
  );
  const [isLoading, setIsLoading] = useState(isRuntime);

  // Editor state
  const [editingEvent, setEditingEvent] = useState<PresetEvent | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);


  // Runtime: fetch events on mount
  useEffect(() => {
    if (!isRuntime) return;
    getRuntimePresetEvents(gameId).then((result) => {
      if (result.success && result.data) {
        setEvents(result.data);
      }
      setIsLoading(false);
    });
  }, [gameId, isRuntime]);

  // ─── CRUD ──────────────────────────────────────

  const handleCreate = useCallback(() => {
    setEditingEvent(null);
    setIsEditorOpen(true);
  }, []);

  const handleEdit = useCallback((event: PresetEventRuntime) => {
    setEditingEvent(event);
    setIsEditorOpen(true);
  }, []);

  const handleDelete = useCallback(async (eventId: string) => {
    const result = isRuntime
      ? await deleteRuntimePresetEvent(gameId, eventId)
      : await deletePresetEvent(gameId, eventId);

    if (result.success) {
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      toast.success('預設事件已刪除');
    } else {
      toast.error(result.message || '刪除失敗');
    }
  }, [gameId, isRuntime]);

  const handleSave = useCallback(async (data: PresetEventInput) => {
    setIsSubmitting(true);
    try {
      if (editingEvent) {
        // Update
        const result = isRuntime
          ? await updateRuntimePresetEvent(gameId, editingEvent.id, data)
          : await updatePresetEvent(gameId, editingEvent.id, data);

        if (result.success && result.data) {
          setEvents((prev) =>
            prev.map((e) =>
              e.id === editingEvent.id ? toRuntimeShape(result.data!) : e,
            ),
          );
          toast.success('預設事件已更新');
          setIsEditorOpen(false);
        } else {
          toast.error(result.message || '更新失敗');
        }
      } else {
        // Create
        const result = isRuntime
          ? await createRuntimePresetEvent(gameId, data)
          : await createPresetEvent(gameId, data);

        if (result.success && result.data) {
          setEvents((prev) => [...prev, toRuntimeShape(result.data!)]);
          toast.success(isRuntime ? '預設事件已建立（僅本場次）' : '預設事件已建立');
          setIsEditorOpen(false);
        } else {
          toast.error(result.message || '建立失敗');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [gameId, editingEvent, isRuntime]);


  // ─── Render ────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          預設事件
        </h2>
        <div className="text-sm text-muted-foreground">載入中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className={GM_SECTION_TITLE_CLASS}>
        <span className="w-1 h-5 bg-primary rounded-full" />
        預設事件
      </h2>

      {events.length === 0 ? (
        <GmEmptyState
          icon={<Zap className="h-10 w-10" />}
          title="尚未建立預設事件"
          description="預先編排劇情事件，遊戲中一鍵觸發廣播、數值變更、資訊揭露等操作。"
          actionLabel="建立預設事件"
          onAction={handleCreate}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          <DashedAddButton
            label="新增事件"
            onClick={handleCreate}
            variant="card"
            className="min-h-[180px]"
          />

          {events.map((event) => (
            <PresetEventCard
              key={event.id}
              event={event}
              characters={characters}
              isRuntime={isRuntime}
              onEdit={() => handleEdit(event)}
              onRemove={() => handleDelete(event.id)}
            />
          ))}
        </div>
      )}

      <PresetEventEditor
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        event={editingEvent}
        characters={characters}
        onSave={handleSave}
        isSubmitting={isSubmitting}
      />

    </div>
  );
}

/** Baseline PresetEvent → PresetEventRuntime shape（補充 Runtime 欄位預設值） */
function toRuntimeShape(event: PresetEvent | PresetEventRuntime): PresetEventRuntime {
  return {
    executionCount: 0,
    ...event,
  };
}
