'use client';

/**
 * 通知按鈕 + 通知記錄對話框
 *
 * 配置於角色卡標題列的通知按鈕。
 * 顯示未讀徽章，點擊後開啟通知記錄對話框。
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Bell } from 'lucide-react';
import type { NotificationWithTimestamp } from '@/hooks/use-notification-system';

export interface NotificationButtonProps {
  /** 通知對話框的開啟狀態 */
  isOpen: boolean;
  /** 開啟狀態變更回呼 */
  onOpenChange: (open: boolean) => void;
  /** 未讀通知數 */
  unreadCount: number;
  /** 通知列表 */
  notifications: NotificationWithTimestamp[];
  /** 開啟對話框時的已讀處理 */
  onMarkAsRead: () => void;
}

export function NotificationButton({
  isOpen,
  onOpenChange,
  unreadCount,
  notifications,
  onMarkAsRead,
}: NotificationButtonProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (open) onMarkAsRead();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={unreadCount > 0 ? 'secondary' : 'ghost'}
          size="icon"
          className="relative shrink-0"
          aria-label={unreadCount > 0 ? `${unreadCount} 則未讀通知` : '通知紀錄'}
        >
          <Bell className={`h-5 w-5 ${unreadCount > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>通知紀錄</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="text-sm text-muted-foreground">目前沒有通知</p>
          )}
          {notifications
            .slice()
            .reverse()
            .map((n, idx) => (
              <div key={`${n.id}-${idx}`} className="p-3 rounded-lg border bg-muted/40">
                <div className="text-sm font-semibold">{n.title}</div>
                <div className="text-sm text-muted-foreground">{n.message}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(n.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
