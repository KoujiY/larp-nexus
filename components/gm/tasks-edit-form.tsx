'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { getGameItems } from '@/app/actions/games';
import { useFormGuard } from '@/hooks/use-form-guard';
import type { GameItemInfo } from '@/app/actions/games';
import { AutoRevealConditionEditor } from '@/components/gm/auto-reveal-condition-editor';
import type { SecretOption } from '@/components/gm/auto-reveal-condition-editor';
import { cleanTaskConditions } from '@/lib/reveal/condition-cleaner';
import { DashedAddButton } from '@/components/gm/dashed-add-button';
import { GmEmptyState } from '@/components/gm/gm-empty-state';
import { IconActionButton } from '@/components/gm/icon-action-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  GM_SECTION_TITLE_CLASS,
  GM_SCROLLBAR_CLASS,
  GM_STATUS_BADGE_BASE,
  GM_ATTR_BADGE_BASE,
  GM_BADGE_VARIANTS,
  GM_DETAIL_HEADER_CLASS,
  GM_ACCENT_CARD_CLASS,
} from '@/lib/styles/gm-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pencil, Trash2, Undo2, ChevronDown, Lock, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from '@/types/character';
import type { RegisterSaveHandler, RegisterDiscardHandler, SaveHandlerOptions } from '@/types/gm-edit';

type TaskStatus = 'unchanged' | 'new' | 'modified' | 'deleted';

interface TasksEditFormProps {
  characterId: string;
  gameId: string;
  initialTasks: Task[];
  secrets: SecretOption[];
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: RegisterSaveHandler;
  onRegisterDiscard?: RegisterDiscardHandler;
}

/**
 * 任務管理 — 雙欄佈局（一般任務 | 隱藏任務）
 *
 * 各欄為獨立卡片容器，header 固定 + body 可捲動。
 * 任務卡片支援點擊展開/收合、軟刪除（可復原）、狀態 badge。
 */
export function TasksEditForm({ characterId, gameId, initialTasks, secrets, onDirtyChange, onRegisterSave, onRegisterDiscard }: TasksEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [prevInitialTasks, setPrevInitialTasks] = useState(initialTasks);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [availableItems, setAvailableItems] = useState<GameItemInfo[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  if (initialTasks !== prevInitialTasks) {
    setPrevInitialTasks(initialTasks);
    setTasks(initialTasks);
    setDeletedIds(new Set());
  }

  /** 排除軟刪除的有效任務 */
  const effectiveTasks = useMemo(
    () => tasks.filter((t) => !deletedIds.has(t.id)),
    [tasks, deletedIds],
  );

  const { isDirty, resetDirty } = useFormGuard({
    initialData: initialTasks,
    currentData: effectiveTasks,
  });

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  /** 初始資料查找表 */
  const initialTasksMap = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of initialTasks) map.set(t.id, t);
    return map;
  }, [initialTasks]);

  /** 判斷狀態 */
  const getTaskStatus = useCallback(
    (task: Task): TaskStatus => {
      if (deletedIds.has(task.id)) return 'deleted';
      const original = initialTasksMap.get(task.id);
      if (!original) return 'new';
      if (JSON.stringify(original) !== JSON.stringify(task)) return 'modified';
      return 'unchanged';
    },
    [initialTasksMap, deletedIds],
  );

  // 載入劇本中所有道具（用於自動揭露條件設定）
  useEffect(() => {
    getGameItems(gameId).then((result) => {
      if (result.success && result.data) {
        setAvailableItems(result.data);
      }
    }).catch((error) => {
      console.error('Failed to load game items:', error);
    });
  }, [gameId]);

  // 道具載入後清理失效條件
  useEffect(() => {
    if (availableItems.length === 0) return;
    const existingItemIds = availableItems.map((item) => item.itemId);
    const existingSecretIds = secrets.map((s) => s.id);
    const { tasks: cleanedTasks, result } = cleanTaskConditions(tasks, existingItemIds, existingSecretIds);
    if (result.cleaned) {
      setTasks(cleanedTasks);
      toast.info(`已自動清理 ${result.removedCount} 個失效的揭露條件引用`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableItems]);

  const handleAddTask = useCallback((isHidden: boolean) => {
    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: '',
      description: '',
      isHidden,
      isRevealed: false,
      status: 'pending',
      revealCondition: '',
      createdAt: new Date(),
    };
    setEditingTask(newTask);
    setIsDialogOpen(true);
  }, []);

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask({ ...task });
    setIsDialogOpen(true);
  }, []);

  const handleSaveTask = () => {
    if (!editingTask) return;
    if (!editingTask.title.trim()) {
      toast.error('任務標題不可為空');
      return;
    }
    const existingIndex = tasks.findIndex((t) => t.id === editingTask.id);
    if (existingIndex >= 0) {
      setTasks((prev) => {
        const updated = [...prev];
        updated[existingIndex] = editingTask;
        return updated;
      });
    } else {
      setTasks((prev) => [...prev, editingTask]);
    }
    setIsDialogOpen(false);
    setEditingTask(null);
  };

  const handleSoftDelete = useCallback((taskId: string) => {
    setDeletedIds((prev) => new Set(prev).add(taskId));
  }, []);

  const handleRestore = useCallback((taskId: string) => {
    setDeletedIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
  }, []);

  const save = useCallback(async (options?: SaveHandlerOptions) => {
    setIsLoading(true);
    try {
      const result = await updateCharacter(characterId, { tasks: effectiveTasks });
      if (result.success) {
        if (!options?.silent) toast.success('任務已儲存');
        resetDirty();
        router.refresh();
      } else {
        toast.error(result.message || '儲存失敗');
      }
    } catch {
      toast.error('儲存時發生錯誤');
    } finally {
      setIsLoading(false);
    }
  }, [characterId, effectiveTasks, resetDirty, router]);

  const discard = useCallback(() => {
    setTasks(initialTasks);
    setDeletedIds(new Set());
  }, [initialTasks]);

  useEffect(() => { onRegisterSave?.(save); }, [onRegisterSave, save]);
  useEffect(() => { onRegisterDiscard?.(discard); }, [onRegisterDiscard, discard]);

  const normalTasks = tasks.filter((t) => !t.isHidden);
  const hiddenTasks = tasks.filter((t) => t.isHidden);

  return (
    <>
      <div className="flex gap-6 h-full min-h-0">
        {/* ── 左欄：一般任務 ── */}
        <TaskColumn
          title="一般任務"
          tasks={normalTasks}
          onAdd={() => handleAddTask(false)}
          onEdit={handleEditTask}
          onRemove={handleSoftDelete}
          onRestore={handleRestore}
          getStatus={getTaskStatus}
          addLabel="新增一般任務"
          availableItems={availableItems}
          secrets={secrets}
          disabled={isLoading}
        />

        {/* ── 右欄：隱藏任務 ── */}
        <TaskColumn
          title="隱藏任務"
          tasks={hiddenTasks}
          onAdd={() => handleAddTask(true)}
          onEdit={handleEditTask}
          onRemove={handleSoftDelete}
          onRestore={handleRestore}
          getStatus={getTaskStatus}
          addLabel="新增隱藏任務"
          variant="muted"
          availableItems={availableItems}
          secrets={secrets}
          disabled={isLoading}
        />
      </div>

      {/* 編輯 Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTask && tasks.find((t) => t.id === editingTask.id) ? '編輯任務' : '新增任務'}
            </DialogTitle>
            <DialogDescription>
              設定任務內容與揭露條件
            </DialogDescription>
          </DialogHeader>

          {editingTask && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="task-title">任務標題 *</Label>
                <Input
                  id="task-title"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  placeholder="例：找到失蹤的信件"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-description">任務描述</Label>
                <Textarea
                  id="task-description"
                  value={editingTask.description}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  placeholder="詳細描述任務內容..."
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>隱藏目標</Label>
                  <p className="text-sm text-muted-foreground">
                    設為隱藏目標後，需手動或自動揭露才會顯示給玩家
                  </p>
                </div>
                <Switch
                  checked={editingTask.isHidden}
                  onCheckedChange={(checked) => setEditingTask({
                    ...editingTask,
                    isHidden: checked,
                    isRevealed: checked ? editingTask.isRevealed : false,
                  })}
                />
              </div>

              {editingTask.isHidden && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>已揭露</Label>
                      <p className="text-sm text-muted-foreground">
                        揭露後玩家可以看到此目標
                      </p>
                    </div>
                    <Switch
                      checked={editingTask.isRevealed}
                      onCheckedChange={(checked) => setEditingTask({
                        ...editingTask,
                        isRevealed: checked,
                        revealedAt: checked ? new Date() : undefined,
                      })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reveal-condition">GM 備註（揭露條件）</Label>
                    <Input
                      id="reveal-condition"
                      value={editingTask.revealCondition || ''}
                      onChange={(e) => setEditingTask({ ...editingTask, revealCondition: e.target.value })}
                      placeholder="例：當玩家發現密室後揭露"
                    />
                  </div>

                  <AutoRevealConditionEditor
                    condition={editingTask.autoRevealCondition}
                    onChange={(newCondition) => setEditingTask({
                      ...editingTask,
                      autoRevealCondition: newCondition,
                    })}
                    availableItems={availableItems}
                    availableSecrets={secrets}
                    allowSecretsCondition={true}
                  />
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveTask}>
              確認
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── 欄位容器 ──────────────────────────────────

interface TaskColumnProps {
  title: string;
  tasks: Task[];
  onAdd: () => void;
  onEdit: (task: Task) => void;
  onRemove: (taskId: string) => void;
  onRestore: (taskId: string) => void;
  getStatus: (task: Task) => TaskStatus;
  addLabel: string;
  variant?: 'default' | 'muted';
  availableItems: GameItemInfo[];
  secrets: SecretOption[];
  disabled?: boolean;
}

function TaskColumn({
  title,
  tasks,
  onAdd,
  onEdit,
  onRemove,
  onRestore,
  getStatus,
  addLabel,
  variant = 'default',
  availableItems,
  secrets,
  disabled,
}: TaskColumnProps) {
  return (
    <section
      className={cn(
        'flex-1 flex flex-col rounded-2xl border shadow-sm overflow-hidden',
        variant === 'muted'
          ? 'bg-muted/20 border-border/20'
          : 'bg-card border-border/10',
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border/10 shrink-0">
        <h2 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          {title}
        </h2>
      </div>

      {/* Body */}
      <div className={cn('flex-1 overflow-y-auto p-4 space-y-3', GM_SCROLLBAR_CLASS)}>
        {tasks.length === 0 ? (
          <GmEmptyState
            icon={<ListChecks className="h-10 w-10" />}
            title={variant === 'muted' ? '尚無隱藏任務' : '尚無一般任務'}
            actionLabel={addLabel}
            onAction={onAdd}
            disabled={disabled}
          />
        ) : (
          <>
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                status={getStatus(task)}
                onEdit={() => onEdit(task)}
                onRemove={() => onRemove(task.id)}
                onRestore={() => onRestore(task.id)}
                availableItems={availableItems}
                secrets={secrets}
                disabled={disabled}
              />
            ))}

            {/* 新增按鈕 */}
            <DashedAddButton
              label={addLabel}
              onClick={onAdd}
              disabled={disabled}
              className="py-4 mt-3"
            />
          </>
        )}
      </div>
    </section>
  );
}

// ─── 任務卡片 ──────────────────────────────────

/** 自動揭露條件類型標籤 */
const CONDITION_TYPE_LABELS: Record<string, string> = {
  items_viewed: '檢視道具',
  items_acquired: '取得道具',
  secrets_revealed: '隱藏資訊揭露',
};

interface TaskCardProps {
  task: Task;
  status: TaskStatus;
  onEdit: () => void;
  onRemove: () => void;
  onRestore: () => void;
  availableItems: GameItemInfo[];
  secrets: SecretOption[];
  disabled?: boolean;
}

function TaskCard({ task, status, onEdit, onRemove, onRestore, availableItems, secrets, disabled }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isDeleted = status === 'deleted';

  const hasAutoCondition = task.autoRevealCondition && task.autoRevealCondition.type !== 'none';
  const conditionTypeLabel = hasAutoCondition
    ? CONDITION_TYPE_LABELS[task.autoRevealCondition!.type] ?? task.autoRevealCondition!.type
    : null;

  return (
    <div
      className={cn(
        'bg-card rounded-xl border border-border/10 shadow-sm transition-all cursor-pointer',
        // 狀態樣式（對齊 AbilityCard / StatCard）
        isDeleted && 'opacity-60 bg-muted/30',
        !isDeleted && 'hover:shadow-md',
        status === 'new' && !isDeleted && 'border-primary/20',
        status === 'modified' && !isDeleted && 'bg-primary/5 border-primary/20',
      )}
      onClick={isDeleted ? undefined : () => setExpanded((prev) => !prev)}
    >
      {/* ── Header ── */}
      <div className="p-4 flex items-center justify-between gap-2">
        {/* 左側：狀態 badge + 展開 icon + 標題 + 揭露狀態 */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* 狀態 badge（NEW / MODIFIED） */}
          {(status === 'new' || status === 'modified') && !isDeleted && (
            <span className={cn(
              GM_STATUS_BADGE_BASE,
              'shrink-0',
              status === 'new' ? GM_BADGE_VARIANTS['primary-solid'] : GM_BADGE_VARIANTS.primary,
            )}>
              {status === 'new' ? 'NEW' : 'MODIFIED'}
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
          <h3 className={cn(
            'text-lg font-black truncate',
            isDeleted ? 'text-muted-foreground/50 line-through' : 'text-foreground',
          )}>
            {task.title || '未命名任務'}
          </h3>
          {task.isHidden && !isDeleted && (
            <span className={cn(
              GM_STATUS_BADGE_BASE,
              'shrink-0',
              GM_BADGE_VARIANTS[task.isRevealed ? 'success' : 'secondary'],
            )}>
              {task.isRevealed ? '已揭露' : '未揭露'}
            </span>
          )}
        </div>

        {/* 右側：操作按鈕（常時可見） */}
        <div className="flex items-center gap-1 shrink-0">
          {isDeleted ? (
            <IconActionButton
              icon={<Undo2 className="h-3.5 w-3.5" />}
              label="復原"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onRestore(); }}
              disabled={disabled}
            />
          ) : (
            <>
              <IconActionButton
                icon={<Pencil className="h-3.5 w-3.5" />}
                label="編輯"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                disabled={disabled}
              />
              <IconActionButton
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label="刪除"
                variant="destructive"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                disabled={disabled}
              />
            </>
          )}
        </div>
      </div>

      {/* ── 展開內容 ── */}
      {expanded && !isDeleted && (
        <div className="mx-4 pb-4 pt-3 border-t border-border/10 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* 描述 */}
          {task.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {task.description}
            </p>
          )}

          {/* GM 備註（隱藏任務才顯示） */}
          {task.isHidden && task.revealCondition && (
            <div className="space-y-2">
              <h4 className={GM_DETAIL_HEADER_CLASS}>
                GM 備註
              </h4>
              <div className={GM_ACCENT_CARD_CLASS}>
                <p className="text-xs text-foreground/90">{task.revealCondition}</p>
              </div>
            </div>
          )}

          {/* 揭露條件（隱藏任務 + 有自動條件才顯示） */}
          {task.isHidden && hasAutoCondition && (
            <div className="space-y-2">
              <h4 className={GM_DETAIL_HEADER_CLASS}>
                揭露條件
              </h4>
              <div className={cn(GM_ACCENT_CARD_CLASS, 'space-y-1.5')}>
                <p className="text-xs font-medium text-foreground">
                  <span className="text-muted-foreground">自動揭露：</span>
                  {conditionTypeLabel}
                </p>

                {task.autoRevealCondition!.matchLogic && (
                  <p className="text-xs text-foreground/90">
                    <span className="text-muted-foreground">邏輯：</span>
                    {task.autoRevealCondition!.matchLogic === 'and' ? '全部符合' : '任一符合'}
                  </p>
                )}

                {task.autoRevealCondition!.itemIds && task.autoRevealCondition!.itemIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {task.autoRevealCondition!.itemIds.map((itemId) => {
                      const item = availableItems.find((i) => i.itemId === itemId);
                      return (
                        <span key={itemId} className={cn(GM_ATTR_BADGE_BASE, GM_BADGE_VARIANTS.muted)}>
                          {item ? `${item.characterName}：${item.itemName}` : itemId}
                        </span>
                      );
                    })}
                  </div>
                )}

                {task.autoRevealCondition!.secretIds && task.autoRevealCondition!.secretIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {task.autoRevealCondition!.secretIds.map((secretId) => {
                      const target = secrets.find((s) => s.id === secretId);
                      return (
                        <span key={secretId} className={cn(GM_ATTR_BADGE_BASE, GM_BADGE_VARIANTS.muted)}>
                          {target ? target.title : secretId}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 隱藏任務但無 GM 備註也無揭露條件 */}
          {task.isHidden && !task.revealCondition && !hasAutoCondition && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground/40">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span className="italic">尚未設定揭露條件</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
