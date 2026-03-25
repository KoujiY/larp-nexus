'use client';

/**
 * 通知按鈕 + 通知記錄對話框
 *
 * 配置於角色卡標題列的通知按鈕，設計對齊 Stitch 圓形鈴鐺風格。
 * 顯示未讀徽章，點擊後開啟通知記錄對話框。
 */

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
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  unreadCount: number;
  notifications: NotificationWithTimestamp[];
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
        <button
          className={`relative p-2 rounded-full transition-colors active:scale-95 duration-200 ${
            unreadCount > 0
              ? 'text-primary hover:bg-primary/10 filter-[drop-shadow(0_0_8px_rgba(254,197,106,0.4))]'
              : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
          }`}
          aria-label={unreadCount > 0 ? `${unreadCount} 則未讀通知` : '通知紀錄'}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center font-bold border-2 border-background shadow-[0_0_8px_rgba(254,197,106,0.5)]">
              {unreadCount}
            </span>
          )}
        </button>
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
