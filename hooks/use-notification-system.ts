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
  
  const [unreadCount, setUnreadCount] = useState(0);

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
      // 為每個通知生成唯一的 ID，避免重複
      // 使用 timestamp + 索引 + 微秒時間戳確保唯一性
      const notificationsWithTimestamp = newNotifications.map((f, idx) => {
        // 如果 ID 已經存在，添加索引和微秒時間戳確保唯一性
        const baseId = f.id || `evt-${now}`;
        // 使用 performance.now() 獲取高精度時間戳，確保唯一性
        const uniqueId = `${baseId}-${idx}-${now}-${performance.now()}`;
        return { ...f, id: uniqueId, timestamp: now };
      });
      
      // 過濾掉已經存在的通知（基於 ID，避免完全重複）
      const existingIds = new Set(prev.map(n => n.id));
      const filteredNotifications = notificationsWithTimestamp.filter(n => !existingIds.has(n.id));
      
      // 合併並去重：確保整個列表都沒有重複的 ID
      const combined = [...prev, ...filteredNotifications];
      const seenIds = new Set<string>();
      const deduplicated = combined.filter((n) => {
        if (seenIds.has(n.id)) {
          return false;
        }
        seenIds.add(n.id);
        return true;
      });
      
      return deduplicated.slice(-NOTIF_LIMIT);
    });
    
    setUnreadCount((n) => n + newNotifications.length);
  }, []);

  /**
   * 清除所有通知
   */
  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(notifStorageKey);
    }
  }, [notifStorageKey]);

  /**
   * 標記為已讀
   */
  const markAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    addNotification,
    clearNotifications,
    markAsRead,
  };
}

