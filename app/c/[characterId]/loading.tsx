/** 玩家角色卡 skeleton — 對應 CharacterCardView 結構 */
export default function CharacterCardLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[896px] mx-auto min-h-screen relative pb-32">
        {/* Sticky Header */}
        <header className="sticky top-0 z-50 px-6 py-3 bg-background/80 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.08)] flex justify-between items-center">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-full bg-muted/50" />
            <div className="h-4 w-24 bg-muted/40 rounded" />
          </div>
          <div className="flex items-center gap-1 animate-pulse">
            <div className="h-8 w-8 bg-muted/30 rounded" />
            <div className="h-8 w-8 bg-muted/30 rounded" />
          </div>
        </header>

        {/* Hero 區塊 400px */}
        <section className="relative w-full h-[400px] overflow-hidden -mt-16 animate-pulse">
          <div className="w-full h-full bg-muted/20" />
          {/* 漸層 scrim */}
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/40 to-background/85 pointer-events-none" />
          {/* 名稱 placeholder */}
          <div className="absolute bottom-12 left-0 w-full px-8 z-20">
            <div className="h-12 w-56 bg-muted/40 rounded-lg" />
            <div className="mt-6 h-4 w-80 bg-muted/20 rounded" />
          </div>
        </section>

        {/* Sticky Tab 導覽 */}
        <nav className="hidden md:block sticky top-16 z-40 px-6 py-4 bg-background">
          <div className="bg-card/90 backdrop-blur-md rounded-lg p-1.5 flex gap-1 shadow-2xl border border-border/10 animate-pulse">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-center py-3">
                <div className="h-5 w-5 bg-muted/40 rounded" />
                <div className="h-2.5 w-8 bg-muted/30 rounded mt-1" />
              </div>
            ))}
          </div>
        </nav>

        {/* 內容佔位 */}
        <div className="px-6 pb-6 space-y-4 animate-pulse">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-24 w-full bg-muted/15 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
