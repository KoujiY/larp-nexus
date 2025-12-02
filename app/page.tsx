import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 p-4">
      <div className="text-center space-y-8 text-white">
        <div className="space-y-4">
          <div className="text-8xl mb-6">🎭</div>
          <h1 className="text-6xl font-bold tracking-tight">LARP Nexus</h1>
          <p className="text-2xl text-purple-100">GM/玩家輔助系統</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
          <Link href="/auth/login">
            <Button size="lg" variant="secondary" className="w-full sm:w-auto">
              🔐 GM 登入
            </Button>
          </Link>
        </div>

        <div className="pt-8 text-purple-200 text-sm">
          <p>💡 玩家請使用 GM 提供的 QR Code 或連結查看角色卡</p>
        </div>

        <div className="pt-12 text-purple-200 text-sm space-y-2">
          <p>✨ 劇本管理 | 角色卡生成 | QR Code 分享</p>
          <p>📱 即時推送 | PIN 解鎖 | 響應式設計</p>
        </div>
      </div>
    </div>
  );
}
