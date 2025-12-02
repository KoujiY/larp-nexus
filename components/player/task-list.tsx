'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ClipboardList } from 'lucide-react';
import type { Task } from '@/types/character';

interface TaskListProps {
  tasks?: Task[];
}

function getStatusVariant(status: Task['status']) {
  switch (status) {
    case 'completed':
      return 'default';
    case 'in-progress':
      return 'secondary';
    case 'pending':
      return 'outline';
    default:
      return 'outline';
  }
}

function getStatusLabel(status: Task['status']) {
  switch (status) {
    case 'completed':
      return '已完成';
    case 'in-progress':
      return '進行中';
    case 'pending':
      return '待處理';
    default:
      return '未知';
  }
}

export function TaskList({ tasks }: TaskListProps) {
  if (!tasks || tasks.length === 0) {
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

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <Card key={task.id} className="hover:bg-accent/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Checkbox
                checked={task.status === 'completed'}
                disabled
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold mb-1">{task.title}</h4>
                {task.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-2">
                    {task.description}
                  </p>
                )}
                <Badge variant={getStatusVariant(task.status)}>
                  {getStatusLabel(task.status)}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

