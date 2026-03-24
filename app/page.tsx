import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Drama, LockKeyhole, QrCode, Bell, Smartphone } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-8">
        <div className="space-y-4">
          <div className="mb-6 flex justify-center">
            <Drama className="h-20 w-20 text-primary" />
          </div>
          <h1 className="text-6xl font-bold tracking-tight text-foreground">LARP Nexus</h1>
          <p className="text-2xl text-muted-foreground">GM/玩家輔助系統</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
          <Link href="/auth/login">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              <LockKeyhole className="mr-2 h-4 w-4" />
              GM 登入
            </Button>
          </Link>
        </div>

        <div className="pt-8 text-muted-foreground text-sm">
          <p>玩家請使用 GM 提供的 QR Code 或連結查看角色卡</p>
        </div>

        <div className="pt-12 text-muted-foreground text-sm space-y-2">
          <p className="flex items-center justify-center gap-4">
            <span className="flex items-center gap-1.5"><QrCode className="h-3 w-3" />劇本管理 | 角色卡生成 | QR Code 分享</span>
          </p>
          <p className="flex items-center justify-center gap-4">
            <span className="flex items-center gap-1.5"><Bell className="h-3 w-3" />即時推送</span>
            <span className="flex items-center gap-1.5"><LockKeyhole className="h-3 w-3" />PIN 解鎖</span>
            <span className="flex items-center gap-1.5"><Smartphone className="h-3 w-3" />響應式設計</span>
          </p>
        </div>
      </div>
    </div>
  );
}
