import { Loader2 } from 'lucide-react';

/**
 * 通用頁面級 loading spinner
 *
 * 用於 Next.js loading.tsx，在 async Server Component 等待資料時顯示。
 * 填滿父容器高度並居中。
 */
export function PageLoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center py-32">
      <Loader2 className="h-8 w-8 text-muted-foreground/40 animate-spin" />
    </div>
  );
}
