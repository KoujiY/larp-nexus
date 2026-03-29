'use client';

/**
 * 任務列表元件（玩家側）
 *
 * 列表式卡片顯示任務（一般任務 + 已揭露的隱藏目標），
 * 點擊後以 Bottom Sheet 展示完整內容。
 * 保留原有的 localStorage 已讀追蹤邏輯。
 */

import { useState, useMemo, useSyncExternalStore, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import { BottomSheet } from './bottom-sheet';
import { Button } from '@/components/ui/button';
import type { Task } from '@/types/character';
import { formatDate } from '@/lib/utils/date';

interface TaskListProps {
  tasks?: Task[];
  characterId: string;
}

/**
 * Hook 用於安全地讀取 localStorage 中的已讀任務（避免 SSR/CSR hydration 問題）
 * 比照 InfoSecretsTab 的 useReadSecrets 實作
 */
function useReadTasks(characterId: string) {
  const storageKey = `character-${characterId}-read-tasks`;

  const subscribe = useCallback(
    (callback: () => void) => {
      window.addEventListener('storage', callback);
      return () => window.removeEventListener('storage', callback);
    },
    []
  );

  const getSnapshot = useCallback(() => {
    const stored = localStorage.getItem(storageKey);
    return stored || '[]';
  }, [storageKey]);

  const getServerSnapshot = useCallback(() => '[]', []);

  const storedValue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    try {
      return new Set(JSON.parse(storedValue) as string[]);
    } catch {
      return new Set<string>();
    }
  }, [storedValue]);
}

export function TaskList({ tasks, characterId }: TaskListProps) {
  const readTasksFromStorage = useReadTasks(characterId);
  const [localReadTasks, setLocalReadTasks] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const readTasks = useMemo(() => {
    const combined = new Set(readTasksFromStorage);
    localReadTasks.forEach((id) => combined.add(id));
    return combined;
  }, [readTasksFromStorage, localReadTasks]);

  // 過濾出可見的任務（一般任務 + 已揭露的隱藏目標）
  const visibleTasks = useMemo(
    () =>
      tasks?.filter((task) => {
        if (!task.isHidden) return true;
        return task.isRevealed;
      }) || [],
    [tasks]
  );

  const normalTasks = useMemo(
    () => visibleTasks.filter((t) => !t.isHidden),
    [visibleTasks]
  );
  const revealedHiddenTasks = useMemo(
    () => visibleTasks.filter((t) => t.isHidden && t.isRevealed),
    [visibleTasks]
  );

  const selectedTask = visibleTasks.find((t) => t.id === selectedTaskId);

  /** 點擊隱藏任務時標記為已讀 */
  const handleTaskClick = (task: Task) => {
    setSelectedTaskId(task.id);
    if (task.isHidden) {
      setLocalReadTasks((prev) => {
        const newSet = new Set(prev);
        newSet.add(task.id);
        return newSet;
      });
      if (typeof window !== 'undefined') {
        const newReadTasks = new Set(readTasks);
        newReadTasks.add(task.id);
        localStorage.setItem(
          `character-${characterId}-read-tasks`,
          JSON.stringify(Array.from(newReadTasks))
        );
      }
    }
  };

  if (visibleTasks.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground/60">
        <p className="text-sm">目前沒有任務</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* 一般任務 */}
        {normalTasks.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">
                一般任務
              </h4>
              <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-bold">
                {normalTasks.length}
              </span>
            </div>
            <div className="space-y-3">
              {normalTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleTaskClick(task)}
                  className="group w-full text-left bg-surface-base hover:bg-popover px-6 py-5 rounded-xl transition-all duration-300 cursor-pointer border border-border/5"
                >
                  <div className="flex justify-between items-center">
                    <div className="min-w-0 flex-1">
                      <h6 className="font-bold text-foreground text-base tracking-wide group-hover:text-primary transition-colors truncate">
                        {task.title}
                      </h6>
                      {task.description && (
                        <p className="text-xs text-muted-foreground/70 mt-1 truncate">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 已揭露的額外目標 */}
        {revealedHiddenTasks.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">
                額外目標
              </h4>
              <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-bold">
                {revealedHiddenTasks.length}
              </span>
            </div>
            <div className="space-y-3">
              {revealedHiddenTasks.map((task) => {
                const isRead = readTasks.has(task.id);
                return (
                  <button
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    className="group w-full text-left bg-surface-base hover:bg-popover px-6 py-5 rounded-xl transition-all duration-300 cursor-pointer border border-border/5"
                  >
                    <div className="flex justify-between items-center">
                      <div className="min-w-0 flex-1">
                        <h6 className="font-bold text-foreground text-base tracking-wide group-hover:text-primary transition-colors truncate">
                          {task.title}
                        </h6>
                        {task.revealedAt && (
                          <p className="text-[10px] text-muted-foreground/70 uppercase mt-1 tracking-[0.15em]">
                            {formatDate(task.revealedAt)}
                          </p>
                        )}
                      </div>
                      {!isRead && (
                        <span className="px-2 py-0.5 bg-primary/20 text-primary text-[9px] font-bold rounded-full shrink-0">
                          NEW
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 任務詳情 Bottom Sheet */}
      <BottomSheet
        open={selectedTaskId !== null}
        onClose={() => setSelectedTaskId(null)}
        ariaLabel={selectedTask?.title}
        contentClassName="px-8 pt-2 pb-8"
        footer={
          <Button
            onClick={() => setSelectedTaskId(null)}
            className="w-full py-4 bg-linear-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm uppercase tracking-widest"
          >
            確認
          </Button>
        }
      >
        {selectedTask && (
          <div className="space-y-6">
            {/* Header */}
            <div className="space-y-1 pt-4">
              <span className="text-primary text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">
                {selectedTask.isHidden ? 'Hidden Objective' : 'Mission Briefing'}
              </span>
              <h2 className="text-3xl font-extrabold text-primary tracking-tight">
                {selectedTask.title}
              </h2>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground/60 pt-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {selectedTask.isHidden && selectedTask.revealedAt
                    ? `Revealed: ${formatDate(selectedTask.revealedAt)}`
                    : `Assigned: ${formatDate(selectedTask.createdAt)}`}
                </span>
              </div>
            </div>

            {/* 任務描述 */}
            {selectedTask.description && (
              <div className="text-muted-foreground leading-relaxed font-light">
                <p className="text-lg whitespace-pre-wrap">
                  {selectedTask.description}
                </p>
              </div>
            )}

            {/* 隱藏目標額外資訊 */}
            {selectedTask.isHidden && selectedTask.revealCondition && (
              <div className="pt-4 border-t border-border/10">
                <p className="text-xs text-muted-foreground/60 uppercase tracking-widest mb-1">
                  揭露條件
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedTask.revealCondition}
                </p>
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
