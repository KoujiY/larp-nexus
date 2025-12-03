'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ClipboardList, CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
import type { Task } from '@/types/character';
import { formatDate } from '@/lib/utils/date';

interface TaskListProps {
  tasks?: Task[];
}

type TaskStatus = Task['status'];

const statusConfig: Record<TaskStatus, { 
  label: string; 
  variant: 'default' | 'secondary' | 'outline' | 'destructive'; 
  icon: React.ReactNode;
  bgColor: string;
}> = {
  pending: { 
    label: '待處理', 
    variant: 'outline', 
    icon: <Clock className="h-4 w-4" />,
    bgColor: 'bg-gray-50 hover:bg-gray-100',
  },
  'in-progress': { 
    label: '進行中', 
    variant: 'secondary', 
    icon: <Clock className="h-4 w-4 text-blue-500" />,
    bgColor: 'bg-blue-50 hover:bg-blue-100',
  },
  completed: { 
    label: '已完成', 
    variant: 'default', 
    icon: <CheckCircle className="h-4 w-4 text-green-500" />,
    bgColor: 'bg-green-50 hover:bg-green-100',
  },
  failed: { 
    label: '失敗', 
    variant: 'destructive', 
    icon: <XCircle className="h-4 w-4 text-red-500" />,
    bgColor: 'bg-red-50 hover:bg-red-100',
  },
};

export function TaskList({ tasks }: TaskListProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

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
                  onClick={() => setSelectedTask(task)}
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
                  onClick={() => setSelectedTask(task)}
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
                <div className="flex items-center gap-2">
                  {selectedTask.isHidden && (
                    <Badge variant="outline" className="text-xs">
                      <Eye className="h-3 w-3 mr-1" />
                      隱藏目標
                    </Badge>
                  )}
                  <Badge variant={statusConfig[selectedTask.status].variant}>
                    {statusConfig[selectedTask.status].icon}
                    <span className="ml-1">{statusConfig[selectedTask.status].label}</span>
                  </Badge>
                </div>
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
                      {selectedTask.completedAt && (
                        <div>
                          完成時間：{formatDate(selectedTask.completedAt)}
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

// 任務卡片元件
interface TaskCardProps {
  task: Task;
  isHidden?: boolean;
  onClick: () => void;
}

function TaskCard({ task, isHidden, onClick }: TaskCardProps) {
  const config = statusConfig[task.status];
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed';

  return (
    <Card 
      className={`cursor-pointer transition-all ${config.bgColor} ${
        isCompleted ? 'opacity-75' : ''
      } ${isFailed ? 'opacity-60' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-semibold ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                {task.title}
              </h4>
              {isHidden && (
                <Eye className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
            {task.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {task.description}
              </p>
            )}
          </div>
          <Badge variant={config.variant} className="shrink-0">
            {config.label}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
