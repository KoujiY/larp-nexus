'use client';

import { useState, useMemo, useSyncExternalStore, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ClipboardList, Eye } from 'lucide-react';
import type { Task } from '@/types/character';
import { formatDate } from '@/lib/utils/date';

interface TaskListProps {
  tasks?: Task[];
  characterId: string;
}

/**
 * Hook 用於安全地讀取 localStorage 中的已讀任務（避免 SSR/CSR hydration 問題）
 * 比照 SecretInfoSection 的 useReadSecrets 實作
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
      const readIds = JSON.parse(storedValue) as string[];
      return new Set(readIds);
    } catch {
      return new Set<string>();
    }
  }, [storedValue]);
}

export function TaskList({ tasks, characterId }: TaskListProps) {
  const readTasksFromStorage = useReadTasks(characterId);
  const [localReadTasks, setLocalReadTasks] = useState<Set<string>>(new Set());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // 合併 localStorage 和本地狀態
  const readTasks = useMemo(() => {
    const combined = new Set(readTasksFromStorage);
    localReadTasks.forEach(id => combined.add(id));
    return combined;
  }, [readTasksFromStorage, localReadTasks]);

  // 過濾出可見的任務（一般任務 + 已揭露的隱藏目標）
  const visibleTasks = tasks?.filter((task) => {
    if (!task.isHidden) return true; // 一般任務總是可見
    return task.isRevealed; // 隱藏目標只有在已揭露時才可見
  }) || [];

  if (visibleTasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="space-y-4">
            <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">目前沒有任務</h3>
              <p className="text-sm text-muted-foreground mt-2">
                GM 會在適當時機分配任務給你
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  /** 點擊隱藏任務時標記為已讀（比照 SecretInfoSection） */
  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    if (task.isHidden) {
      setLocalReadTasks(prev => {
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

  // 分類任務
  const normalTasks = visibleTasks.filter((t) => !t.isHidden);
  const revealedHiddenTasks = visibleTasks.filter((t) => t.isHidden && t.isRevealed);

  return (
    <>
      <div className="space-y-6">
        {/* 一般任務 */}
        {normalTasks.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              任務目標
            </h4>
            <div className="grid grid-cols-1 gap-3">
              {normalTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => handleTaskClick(task)}
                />
              ))}
            </div>
          </div>
        )}

        {/* 已揭露的隱藏目標 */}
        {revealedHiddenTasks.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Eye className="h-4 w-4" />
              隱藏目標
              <Badge variant="secondary" className="text-xs">已揭露</Badge>
            </h4>
            <div className="grid grid-cols-1 gap-3">
              {revealedHiddenTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isHidden
                  isRead={readTasks.has(task.id)}
                  onClick={() => handleTaskClick(task)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 任務詳情 Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent>
          {selectedTask && (
            <>
              <DialogHeader>
                {selectedTask.isHidden && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      <Eye className="h-3 w-3 mr-1" />
                      隱藏目標
                    </Badge>
                  </div>
                )}
                <DialogTitle className="text-xl mt-2">
                  {selectedTask.title}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-4 mt-4">
                    {selectedTask.description && (
                      <div className="text-foreground whitespace-pre-wrap">
                        {selectedTask.description}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-4 border-t">
                      <div>
                        建立時間：{formatDate(selectedTask.createdAt)}
                      </div>
                      {selectedTask.isHidden && selectedTask.revealedAt && (
                        <div>
                          揭露時間：{formatDate(selectedTask.revealedAt)}
                        </div>
                      )}
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 任務卡片元件（統一樣式）
 * 隱藏目標比照 SecretInfoSection 的卡片設計：未讀 badge、揭露時間、視覺差異
 */
interface TaskCardProps {
  task: Task;
  isHidden?: boolean;
  isRead?: boolean;
  onClick: () => void;
}

function TaskCard({ task, isHidden, isRead, onClick }: TaskCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isHidden
          ? isRead
            ? 'opacity-75'
            : 'border-warning/50 bg-warning/10'
          : 'hover:bg-muted/50'
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold">
              {task.title}
            </h4>
            {isHidden && (
              <Eye className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          {isHidden && !isRead && (
            <Badge variant="secondary">
              <Eye className="h-3 w-3 mr-1" />
              未讀
            </Badge>
          )}
        </div>
        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}
        {/* 隱藏目標額外資訊：揭露條件、揭露時間 */}
        {isHidden && (
          <div className="mt-2 space-y-0.5">
            {task.revealCondition && (
              <p className="text-xs text-muted-foreground">
                揭露條件：{task.revealCondition}
              </p>
            )}
            {task.revealedAt && (
              <p className="text-xs text-muted-foreground">
                揭露於：{formatDate(task.revealedAt)}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
