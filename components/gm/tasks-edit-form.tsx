'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/characters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Eye, EyeOff, CheckCircle, XCircle, Clock, Pencil } from 'lucide-react';
import type { Task } from '@/types/character';

interface TasksEditFormProps {
  characterId: string;
  initialTasks: Task[];
}

type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

const statusConfig: Record<TaskStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: React.ReactNode }> = {
  pending: { label: '待處理', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  'in-progress': { label: '進行中', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
  completed: { label: '已完成', variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
  failed: { label: '失敗', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
};

export function TasksEditForm({ characterId, initialTasks }: TasksEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // 新增任務
  const handleAddTask = () => {
    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: '',
      description: '',
      isHidden: false,
      isRevealed: false,
      status: 'pending',
      gmNotes: '',
      revealCondition: '',
      createdAt: new Date(),
    };
    setEditingTask(newTask);
    setIsDialogOpen(true);
  };

  // 編輯任務
  const handleEditTask = (task: Task) => {
    setEditingTask({ ...task });
    setIsDialogOpen(true);
  };

  // 儲存任務（新增或編輯）
  const handleSaveTask = () => {
    if (!editingTask) return;
    
    if (!editingTask.title.trim()) {
      toast.error('任務標題不可為空');
      return;
    }

    const existingIndex = tasks.findIndex((t) => t.id === editingTask.id);
    if (existingIndex >= 0) {
      // 編輯現有任務
      const updatedTasks = [...tasks];
      updatedTasks[existingIndex] = editingTask;
      setTasks(updatedTasks);
    } else {
      // 新增任務
      setTasks([...tasks, editingTask]);
    }
    
    setIsDialogOpen(false);
    setEditingTask(null);
  };

  // 刪除任務
  const handleRemoveTask = (taskId: string) => {
    setTasks(tasks.filter((t) => t.id !== taskId));
  };

  // 快速切換揭露狀態
  const handleToggleReveal = (taskId: string) => {
    setTasks(tasks.map((t) => {
      if (t.id !== taskId) return t;
      return {
        ...t,
        isRevealed: !t.isRevealed,
        revealedAt: !t.isRevealed ? new Date() : t.revealedAt,
      };
    }));
  };

  // 快速更新狀態
  const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
    setTasks(tasks.map((t) => {
      if (t.id !== taskId) return t;
      return {
        ...t,
        status: newStatus,
        completedAt: (newStatus === 'completed' || newStatus === 'failed') ? new Date() : undefined,
      };
    }));
  };

  // 儲存所有變更
  const handleSave = async () => {
    setIsLoading(true);
    try {
      const result = await updateCharacter(characterId, { tasks });

      if (result.success) {
        toast.success('任務已儲存');
        router.refresh();
      } else {
        toast.error(result.message || '儲存失敗');
      }
    } catch {
      toast.error('儲存時發生錯誤');
    } finally {
      setIsLoading(false);
    }
  };

  // 分類任務
  const normalTasks = tasks.filter((t) => !t.isHidden);
  const hiddenTasks = tasks.filter((t) => t.isHidden);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>✅ 任務管理</CardTitle>
            <CardDescription>
              管理角色的目標任務，支援隱藏目標機制
            </CardDescription>
          </div>
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="mr-2 h-4 w-4" />
            {isLoading ? '儲存中...' : '儲存變更'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 一般任務 */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Eye className="h-4 w-4" />
            一般任務 ({normalTasks.length})
          </h4>
          {normalTasks.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed rounded-lg text-muted-foreground">
              尚無一般任務
            </div>
          ) : (
            <div className="space-y-2">
              {normalTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={() => handleEditTask(task)}
                  onRemove={() => handleRemoveTask(task.id)}
                  onStatusChange={(status) => handleStatusChange(task.id, status)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 隱藏任務 */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <EyeOff className="h-4 w-4" />
            隱藏目標 ({hiddenTasks.length})
          </h4>
          {hiddenTasks.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed rounded-lg text-muted-foreground">
              尚無隱藏目標
            </div>
          ) : (
            <div className="space-y-2">
              {hiddenTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={() => handleEditTask(task)}
                  onRemove={() => handleRemoveTask(task.id)}
                  onToggleReveal={() => handleToggleReveal(task.id)}
                  onStatusChange={(status) => handleStatusChange(task.id, status)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 新增任務按鈕 */}
        <Button onClick={handleAddTask} variant="outline" className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          新增任務
        </Button>

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
                      設為隱藏目標後，需手動揭露才會顯示給玩家
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
                      <Label htmlFor="reveal-condition">揭露條件（GM 備註）</Label>
                      <Input
                        id="reveal-condition"
                        value={editingTask.revealCondition || ''}
                        onChange={(e) => setEditingTask({ ...editingTask, revealCondition: e.target.value })}
                        placeholder="例：當玩家發現密室後揭露"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="gm-notes">GM 筆記</Label>
                  <Textarea
                    id="gm-notes"
                    value={editingTask.gmNotes || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, gmNotes: e.target.value })}
                    placeholder="僅 GM 可見的備註..."
                    rows={2}
                  />
                </div>
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

        {/* 使用說明 */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
          <h4 className="font-medium mb-2">💡 使用說明</h4>
          <ul className="list-disc list-inside space-y-1 text-blue-700">
            <li><strong>一般任務</strong>：玩家可直接看到</li>
            <li><strong>隱藏目標</strong>：需 GM 手動揭露後玩家才能看到</li>
            <li>點擊「👁️」按鈕可快速切換隱藏目標的揭露狀態</li>
            <li>使用下拉選單可快速更新任務狀態</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// 任務卡片元件
interface TaskCardProps {
  task: Task;
  onEdit: () => void;
  onRemove: () => void;
  onToggleReveal?: () => void;
  onStatusChange: (status: TaskStatus) => void;
}

function TaskCard({ task, onEdit, onRemove, onToggleReveal, onStatusChange }: TaskCardProps) {
  const config = statusConfig[task.status];

  return (
    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate">{task.title || '未命名任務'}</span>
          {task.isHidden && (
            <Badge variant={task.isRevealed ? 'secondary' : 'outline'} className="text-xs">
              {task.isRevealed ? '已揭露' : '未揭露'}
            </Badge>
          )}
        </div>
        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-1">{task.description}</p>
        )}
      </div>

      <Select value={task.status} onValueChange={(value) => onStatusChange(value as TaskStatus)}>
        <SelectTrigger className="w-[120px]">
          <SelectValue>
            <Badge variant={config.variant} className="flex items-center gap-1">
              {config.icon}
              {config.label}
            </Badge>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(statusConfig).map(([status, cfg]) => (
            <SelectItem key={status} value={status}>
              <div className="flex items-center gap-2">
                {cfg.icon}
                {cfg.label}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {task.isHidden && onToggleReveal && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleReveal}
          title={task.isRevealed ? '隱藏' : '揭露'}
        >
          {task.isRevealed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
      )}

      <Button variant="ghost" size="icon" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

