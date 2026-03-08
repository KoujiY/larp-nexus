import { getCurrentGMUser } from '@/app/actions/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLayout } from '@/components/gm/page-layout';
import { redirect } from 'next/navigation';

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

  return (
    <PageLayout
      header={
        <div>
          <h1 className="text-3xl font-bold mb-1">個人設定</h1>
          <p className="text-muted-foreground text-sm">管理您的 GM 帳號資訊</p>
        </div>
      }
      maxWidth="lg"
    >
      <div className="space-y-8">

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle>帳號資訊</CardTitle>
          <CardDescription>您的 GM 帳號詳細資訊</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="flex items-center justify-between py-3 border-b">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">顯示名稱</p>
                <p className="text-lg font-medium">{gmUser.displayName}</p>
              </div>
              <span className="text-2xl">👤</span>
            </div>

            <div className="flex items-center justify-between py-3 border-b">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p className="text-lg font-medium">{gmUser.email}</p>
              </div>
              <span className="text-2xl">📧</span>
            </div>

            <div className="flex items-center justify-between py-3 border-b">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">註冊時間</p>
                <p className="text-lg font-medium">{formatDate(gmUser.createdAt)}</p>
              </div>
              <span className="text-2xl">📅</span>
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">最後登入</p>
                <p className="text-lg font-medium">{formatDate(gmUser.lastLoginAt)}</p>
              </div>
              <span className="text-2xl">🕐</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="text-blue-900">💡 提示</CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800">
          <p className="text-sm">
            目前僅支援查看帳號資訊。編輯個人資料功能將在後續版本中推出。
          </p>
        </CardContent>
      </Card>
      </div>
    </PageLayout>
  );
}

