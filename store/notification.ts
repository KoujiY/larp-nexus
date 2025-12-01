import { atom } from 'jotai';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
  read: boolean;
}

// 通知列表
export const notificationsAtom = atom<Notification[]>([]);

// 未讀通知數量
export const unreadCountAtom = atom((get) => {
  const notifications = get(notificationsAtom);
  return notifications.filter(n => !n.read).length;
});

// 新增通知
export const addNotificationAtom = atom(
  null,
  (get, set, notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      read: false,
    };
    
    set(notificationsAtom, [...get(notificationsAtom), newNotification]);
  }
);

// 標記為已讀
export const markAsReadAtom = atom(
  null,
  (get, set, id: string) => {
    const notifications = get(notificationsAtom);
    set(
      notificationsAtom,
      notifications.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }
);

// 清除所有通知
export const clearNotificationsAtom = atom(
  null,
  (get, set) => {
    set(notificationsAtom, []);
  }
);

