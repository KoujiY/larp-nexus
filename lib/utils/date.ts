import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';

/**
 * 格式化日期為 yyyy-MM-dd HH:mm:ss
 */
export function formatDate(date: Date | string): string {
  return format(new Date(date), 'yyyy-MM-dd HH:mm:ss', { locale: zhTW });
}
