import { DesktopSidebar, MobileHeader } from '@/components/gm/navigation';
import { PlayerThemeWrapper } from '@/components/player/player-theme-wrapper';

export default function GMLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerThemeWrapper>
      <div className="flex h-screen overflow-hidden">
        {/* 桌面側邊欄（lg 以上可見，寬度由 DesktopSidebar 內部控制） */}
        <DesktopSidebar />

        {/* 右側內容區（含行動版標題列） */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <MobileHeader />
          <main className="flex-1 flex flex-col overflow-hidden bg-background">
            {children}
          </main>
        </div>
      </div>
    </PlayerThemeWrapper>
  );
}
