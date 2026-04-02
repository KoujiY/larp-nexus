import { redirect } from 'next/navigation';

/**
 * Dashboard 頁面已移除，重導向至劇本管理頁。
 * 保留此檔案以處理舊書籤和快取連結。
 */
export default function DashboardPage() {
  redirect('/games');
}
