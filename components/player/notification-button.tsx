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
import { Bell, Heart, Package, Swords, Eye, Settings, Info, ScrollText } from 'lucide-react';
import type { NotificationWithTimestamp } from '@/hooks/use-notification-system';
import type { LucideIcon } from 'lucide-react';

// ─── 通知類別映射 ──────────────────────────────────────────────────────────────

type NotificationCategory = 'stats' | 'items' | 'combat' | 'reveal' | 'system' | 'default';

interface CategoryStyle {
  icon: LucideIcon;
  label: string;
  /** 卡片背景 */
  cardBg: string;
  /** 卡片邊框 */
  cardBorder: string;
  /** 圓形圖標背景 */
  iconBg: string;
  /** 圓形圖標文字色 */
  iconColor: string;
  /** 標題文字色 */
  titleColor: string;
}

const CATEGORY_STYLES: Record<NotificationCategory, CategoryStyle> = {
  stats: {
    icon: Heart,
    label: '數值變更',
    cardBg: 'bg-destructive/5',
    cardBorder: 'border-destructive/10',
    iconBg: 'bg-destructive/20',
    iconColor: 'text-destructive',
    titleColor: 'text-destructive/80',
  },
  items: {
    icon: Package,
    label: '物品',
    cardBg: 'bg-primary/5',
    cardBorder: 'border-primary/10',
    iconBg: 'bg-primary/20',
    iconColor: 'text-primary',
    titleColor: 'text-primary/80',
  },
  combat: {
    icon: Swords,
    label: '受到影響',
    cardBg: 'bg-destructive/5',
    cardBorder: 'border-destructive/30',
    iconBg: 'bg-destructive/20',
    iconColor: 'text-destructive',
    titleColor: 'text-destructive',
  },
  reveal: {
    icon: Eye,
    label: '揭露',
    cardBg: 'bg-info/5',
    cardBorder: 'border-info/10',
    iconBg: 'bg-info/20',
    iconColor: 'text-info',
    titleColor: 'text-info',
  },
  system: {
    icon: Settings,
    label: '系統',
    cardBg: 'bg-foreground/5',
    cardBorder: 'border-foreground/5',
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    titleColor: 'text-muted-foreground',
  },
  default: {
    icon: Info,
    label: '通知',
    cardBg: 'bg-muted-foreground/5',
    cardBorder: 'border-muted-foreground/10',
    iconBg: 'bg-muted-foreground/20',
    iconColor: 'text-muted-foreground',
    titleColor: 'text-muted-foreground',
  },
};

/** event.type → 視覺類別 */
function getNotificationCategory(type: string): NotificationCategory {
  switch (type) {
    case 'role.updated':
      return 'stats';
    case 'item.transferred':
    case 'role.inventoryUpdated':
    case 'item.showcased':
      return 'items';
    case 'character.affected':
    case 'skill.contest':
    case 'skill.used':
    case 'item.used':
      return 'combat';
    case 'secret.revealed':
    case 'task.revealed':
      return 'reveal';
    case 'effect.expired':
      return 'system';
    default:
      return 'default';
  }
}

// ─── 相對時間 ────────────────────────────────────────────────────────────────

function getRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '剛才';
  if (minutes < 60) return `${minutes} 分鐘前`;
  if (hours < 24) return `${hours} 小時前`;
  if (days === 1) return '昨日';
  return `${days} 天前`;
}

// ─── 元件 ────────────────────────────────────────────────────────────────────

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
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md bg-card/75 backdrop-blur-2xl border border-primary/10 rounded-2xl p-0 gap-0">
        <DialogHeader className="px-6 py-5 border-b border-foreground/5">
          <DialogTitle className="flex items-center gap-3">
            <ScrollText className="h-5 w-5 text-primary" />
            <span className="text-xl font-extrabold tracking-tight uppercase">
              通知紀錄
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col p-5 gap-3 max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-primary/60">
          {notifications.length === 0 && (
            <p className="text-sm text-muted-foreground/60 text-center py-8">
              目前沒有通知
            </p>
          )}
          {notifications
            .slice()
            .reverse()
            .map((n, idx) => {
              const category = getNotificationCategory(n.type);
              const style = CATEGORY_STYLES[category];
              const Icon = style.icon;

              return (
                <div
                  key={`${n.id}-${idx}`}
                  className={`rounded-xl p-4 border flex gap-4 items-start ${style.cardBg} ${style.cardBorder}`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${style.iconBg} ${style.iconColor}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span
                        className={`text-xs font-bold uppercase tracking-widest ${style.titleColor}`}
                      >
                        {n.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-2">
                        {getRelativeTime(n.timestamp)}
                      </span>
                    </div>
                    <p className="text-foreground text-sm">{n.message}</p>
                  </div>
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
