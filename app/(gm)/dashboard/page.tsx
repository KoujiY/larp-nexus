import { getCurrentGMUser } from '@/app/actions/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const gmUser = await getCurrentGMUser();

  if (!gmUser) {
    redirect('/auth/login');
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold">歡迎回來，{gmUser.displayName}！</h1>
        <p className="text-muted-foreground">
          從這裡開始管理您的 LARP 劇本與角色
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="text-4xl mb-2">📚</div>
            <CardTitle>劇本管理</CardTitle>
            <CardDescription>
              建立和管理您的 LARP 劇本
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/games">
              <Button className="w-full">前往劇本管理</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="text-4xl mb-2">👥</div>
            <CardTitle>角色卡</CardTitle>
            <CardDescription>
              管理角色卡與生成 QR Code
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/games">
              <Button className="w-full" variant="outline">
                選擇劇本開始
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="text-4xl mb-2">⚙️</div>
            <CardTitle>個人設定</CardTitle>
            <CardDescription>
              管理您的 GM 帳號設定
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/profile">
              <Button className="w-full" variant="outline">
                前往設定
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Info Section */}
      <Card>
        <CardHeader>
          <CardTitle>快速指南</CardTitle>
          <CardDescription>開始使用 LARP Nexus</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start space-x-3">
            <span className="text-2xl">1️⃣</span>
            <div>
              <h3 className="font-medium">建立劇本</h3>
              <p className="text-sm text-muted-foreground">
                前往「劇本管理」建立您的第一個劇本
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <span className="text-2xl">2️⃣</span>
            <div>
              <h3 className="font-medium">新增角色</h3>
              <p className="text-sm text-muted-foreground">
                在劇本中新增角色，設定角色資訊與圖片
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <span className="text-2xl">3️⃣</span>
            <div>
              <h3 className="font-medium">生成 QR Code</h3>
              <p className="text-sm text-muted-foreground">
                為角色生成 QR Code，分享給玩家掃描查看
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <span className="text-2xl">4️⃣</span>
            <div>
              <h3 className="font-medium">即時推送事件</h3>
              <p className="text-sm text-muted-foreground">
                在遊戲中即時推送訊息給特定角色（Phase 4 功能）
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

