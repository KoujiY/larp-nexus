import { PageLayout } from '@/components/gm/page-layout';

/** 角色卡片 skeleton — 與 CharacterCard 結構對應 */
function SkeletonCharacterCard() {
  return (
    <div className="bg-card rounded-xl overflow-hidden border border-border/40 animate-pulse">
      {/* 圖片區 */}
      <div className="aspect-16/10 w-full bg-muted/30" />
      {/* 資訊區 */}
      <div className="px-4 py-3 space-y-2">
        <div className="h-5 w-32 bg-muted/50 rounded" />
        <div className="h-3 w-24 bg-muted/30 rounded" />
        <div className="flex gap-1 pt-1">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-8 w-8 bg-muted/30 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function GameDetailLoading() {
  return (
    <PageLayout
      header={
        <div className="w-full space-y-4 animate-pulse">
          {/* 麵包屑 */}
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-16 bg-muted/40 rounded" />
            <div className="h-3 w-3 bg-muted/20 rounded" />
            <div className="h-3 w-24 bg-muted/50 rounded" />
          </div>

          {/* 標題 + Badge */}
          <div className="flex items-center gap-4">
            <div className="h-10 w-56 bg-muted/50 rounded-lg" />
            <div className="h-6 w-16 bg-muted/40 rounded-full" />
          </div>

          {/* Game Code + 操作按鈕 */}
          <div className="flex items-stretch justify-between gap-4">
            <div className="h-10 w-48 bg-muted/30 rounded-xl" />
            <div className="flex items-center gap-2 bg-muted/20 p-1.5 rounded-xl">
              <div className="h-8 w-20 bg-muted/30 rounded-lg" />
              <div className="h-8 w-8 bg-muted/30 rounded-lg" />
            </div>
          </div>
        </div>
      }
      maxWidth="lg"
    >
      {/* Tab 列 */}
      <div className="border-b border-border/10 mb-6">
        <div className="flex gap-6 animate-pulse">
          <div className="h-4 w-16 bg-muted/40 rounded mb-3" />
          <div className="h-4 w-16 bg-muted/30 rounded mb-3" />
        </div>
      </div>

      {/* 角色卡片 grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonCharacterCard key={i} />
        ))}
      </div>
    </PageLayout>
  );
}
