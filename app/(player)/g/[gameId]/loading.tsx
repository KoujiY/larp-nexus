/** 玩家世界觀頁 skeleton — 對應 WorldInfoView 結構 */
export default function GameInfoLoading() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Hero 區塊 */}
      <div className="relative w-full h-svh lg:h-auto lg:max-w-[1280px] lg:mx-auto lg:aspect-video lg:max-h-[720px] overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-primary/10 via-background to-background" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, var(--color-background) 0%, var(--color-background) 15%, color-mix(in oklch, var(--color-background) 80%, transparent) 40%, color-mix(in oklch, var(--color-background) 40%, transparent) 100%)',
          }}
        />
        {/* Hero 文字 placeholder */}
        <div className="absolute bottom-12 left-0 w-full px-6 md:px-12 lg:px-24 lg:max-w-[1280px] lg:left-1/2 lg:-translate-x-1/2 animate-pulse">
          <div className="h-14 w-72 bg-muted/40 rounded-lg mb-4" />
          <div className="h-5 w-96 max-w-full bg-muted/20 rounded" />
        </div>
      </div>

      {/* 主要內容 — 雙欄 grid */}
      <main className="relative z-10 max-w-[1280px] mx-auto px-6 md:px-12 lg:px-24 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          {/* 世界觀內容欄 */}
          <div className="lg:col-span-7 space-y-8 animate-pulse">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-3">
                <div className="h-6 w-40 bg-muted/40 rounded" />
                <div className="h-4 w-full bg-muted/20 rounded" />
                <div className="h-4 w-5/6 bg-muted/15 rounded" />
                <div className="h-4 w-3/4 bg-muted/15 rounded" />
              </div>
            ))}
          </div>

          {/* 角色列表側欄 */}
          <div className="lg:col-span-5 animate-pulse">
            <div className="h-5 w-20 bg-muted/40 rounded mb-4" />
            {/* 角色頭像列 */}
            <div className="flex gap-3 mb-6">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="w-12 h-12 rounded-full bg-muted/30" />
              ))}
            </div>
            {/* 角色詳情卡 */}
            <div className="h-48 w-full bg-muted/15 rounded-xl" />
          </div>
        </div>
      </main>
    </div>
  );
}
