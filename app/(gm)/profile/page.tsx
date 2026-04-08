import { getCurrentGMUser } from '@/app/actions/auth';
import { PageLayout } from '@/components/gm/page-layout';
import { AvatarUpload } from '@/components/gm/avatar-upload';
import { redirect } from 'next/navigation';
import { User, Mail, CalendarDays, Clock, Info, BookOpen } from 'lucide-react';

// 此頁面完全是使用者私有資料（依登入 session 讀取 GM user），
// 必須 opt out of static prerender。詳見 app/(gm)/games/page.tsx 的註解。
export const dynamic = 'force-dynamic';

/** 資訊列資料定義 */
const INFO_ROWS = [
  { key: 'displayName', label: '顯示名稱', icon: User },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'createdAt', label: '註冊時間', icon: CalendarDays },
  { key: 'lastLoginAt', label: '最後登入', icon: Clock },
] as const;

export default async function ProfilePage() {
  const gmUser = await getCurrentGMUser();

  if (!gmUser) {
    redirect('/auth/login');
  }

  const formatDate = (date: Date | undefined) => {
    if (!date) return '未知';
    return new Date(date).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /** 取得資訊列的值 */
  const getRowValue = (key: string): string => {
    switch (key) {
      case 'displayName':
        return gmUser.displayName;
      case 'email':
        return gmUser.email;
      case 'createdAt':
        return formatDate(gmUser.createdAt);
      case 'lastLoginAt':
        return formatDate(gmUser.lastLoginAt);
      default:
        return '';
    }
  };

  return (
    <PageLayout
      header={
        <div>
          <h1 className="text-3xl font-bold mb-1">個人設定</h1>
          <p className="text-muted-foreground text-sm">查看與管理您的帳號資訊</p>
        </div>
      }
      maxWidth="xl"
      contentMaxWidth="md"
    >
      <div className="space-y-10 py-4">
        {/* Header：頭貼 + 名稱 */}
        <header className="flex items-center gap-6">
          <AvatarUpload
            displayName={gmUser.displayName}
            avatarUrl={gmUser.avatarUrl}
          />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{gmUser.displayName}</h1>
            <p className="text-sm text-muted-foreground font-medium">{gmUser.email}</p>
          </div>
        </header>

        {/* 帳號資訊卡片 */}
        <section className="bg-card rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="divide-y divide-border/30">
            {INFO_ROWS.map((row) => {
              const Icon = row.icon;
              return (
                <div
                  key={row.key}
                  className="flex items-center justify-between p-5 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Icon className="h-5 w-5 text-muted-foreground/60" />
                    <span className="text-muted-foreground text-sm font-medium">{row.label}</span>
                  </div>
                  <span className="font-semibold">{getRowValue(row.key)}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* 提示卡片 */}
        <div className="bg-primary/10 border-l-[3px] border-primary px-5 py-4 rounded-r-lg flex items-start gap-3">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-muted-foreground text-sm font-medium leading-relaxed">
            點擊頭像即可上傳新的個人頭像。如需修改其他資訊，請聯繫系統管理員。
          </p>
        </div>

        {/* 底部裝飾 */}
        <div className="mt-8 flex justify-center opacity-10">
          <BookOpen className="h-12 w-12" />
        </div>
      </div>
    </PageLayout>
  );
}
