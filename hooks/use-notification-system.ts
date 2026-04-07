/**
 * 通知系統 Hook
 * 從 character-card-view.tsx 提取
 */

import { useState, useEffect, useCallback } from 'react';
import type { Notification } from '@/lib/utils/event-mappers';

const NOTIF_TTL = 24 * 60 * 60 * 1000; // 1 天
const NOTIF_LIMIT = 50;

export interface NotificationWithTimestamp extends Notification {
  timestamp: number;
}

export interface UseNotificationSystemReturn {
  notifications: NotificationWithTimestamp[];
  unreadCount: number;
  addNotification: (notifications: Notification[]) => void;
  clearNotifications: () => void;
  markAsRead: () => void;
}

/**
 * 通知系統 Hook
 * @param characterId 角色 ID
 */
export function useNotificationSystem(characterId: string): UseNotificationSystemReturn {
  const notifStorageKey = `character-${characterId}-notifs`;
  const lastReadKey = `character-${characterId}-lastRead`;

  // 載入歷史通知（保留 1 天內）- 使用 useState 初始化函數避免在 effect 中設置狀態
  const [notifications, setNotifications] = useState<NotificationWithTimestamp[]>(() => {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(notifStorageKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as NotificationWithTimestamp[];
      const now = Date.now();
      const filtered = parsed.filter((n) => now - n.timestamp < NOTIF_TTL);
      return filtered.slice(-NOTIF_LIMIT);
    } catch {
      // ignore parse error
      return [];
    }
  });

  // 從 localStorage 讀取上次已讀時間戳，用於衍生未讀計數
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(() => {
    if (typeof window === 'undefined') return Date.now();
    const stored = localStorage.getItem(lastReadKey);
    return stored ? Number(stored) : 0;
  });

  // 衍生未讀計數：比 lastReadTimestamp 新的通知即為未讀
  const unreadCount = notifications.filter((n) => n.timestamp > lastReadTimestamp).length;

  // 存儲通知
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    const filtered = notifications.filter((n) => now - n.timestamp < NOTIF_TTL).slice(-NOTIF_LIMIT);
    localStorage.setItem(notifStorageKey, JSON.stringify(filtered));
  }, [notifications, notifStorageKey]);

  // 注意：去重邏輯已經整合到 addNotification 函數中，不需要單獨的 useEffect

  /**
   * 添加通知
   */
  const addNotification = useCallback((newNotifications: Notification[]) => {
    if (newNotifications.length === 0) return;

    const now = Date.now();
    setNotifications((prev) => {
      const notificationsWithTimestamp = newNotifications.map((f, idx) => {
        // 伺服器端 _eventId 產生的穩定 ID（eid- 開頭）：保留原始 ID，確保去重有效
        // 其他 ID：附加時間戳確保唯一性（不同事件可能產生相同的 evt-${timestamp}）
        const id = f.id?.startsWith('eid-')
          ? f.id
          : `${f.id || 'evt'}-${idx}-${now}`;
        return { ...f, id, timestamp: now };
      });

      // 過濾掉已存在的通知（eid- 開頭的 ID 能跨 WebSocket/PendingEvents 去重）
      const existingIds = new Set(prev.map(n => n.id));
      const newOnly = notificationsWithTimestamp.filter(n => !existingIds.has(n.id));

      return [...prev, ...newOnly].slice(-NOTIF_LIMIT);
    });

  }, []);

  /**
   * 清除所有通知
   */
  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setLastReadTimestamp(Date.now());
    if (typeof window !== 'undefined') {
      localStorage.removeItem(notifStorageKey);
      localStorage.setItem(lastReadKey, String(Date.now()));
    }
  }, [notifStorageKey, lastReadKey]);

  /**
   * 標記為已讀
   */
  const markAsRead = useCallback(() => {
    const now = Date.now();
    setLastReadTimestamp(now);
    if (typeof window !== 'undefined') {
      localStorage.setItem(lastReadKey, String(now));
    }
  }, [lastReadKey]);

  return {
    notifications,
    unreadCount,
    addNotification,
    clearNotifications,
    markAsRead,
  };
}

