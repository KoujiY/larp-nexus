import { format, formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';

/**
 * 格式化日期為 yyyy-MM-dd HH:mm:ss
 */
export function formatDate(date: Date | string): string {
  return format(new Date(date), 'yyyy-MM-dd HH:mm:ss', { locale: zhTW });
}

/**
 * 格式化為相對時間（例：3 分鐘前）
 */
export function formatRelativeTime(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: zhTW });
}

/**
 * 格式化為簡短日期（yyyy-MM-dd）
 */
export function formatShortDate(date: Date | string): string {
  return format(new Date(date), 'yyyy-MM-dd');
}

