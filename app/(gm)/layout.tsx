import { Navigation } from '@/components/gm/navigation';
import { MobileHeader } from '@/components/gm/navigation';

export default function GMLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* 桌面側邊欄（lg 以上可見） */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 border-r bg-card shrink-0">
        <Navigation />
      </aside>

      {/* 右側內容區（含行動版標題列） */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <MobileHeader />
        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
