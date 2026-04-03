import { PageLayout } from '@/components/gm/page-layout';

export default function CharacterEditLoading() {
  return (
    <PageLayout
      header={
        <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between animate-pulse">
          <div className="flex items-start gap-6">
            {/* 角色頭像 80×80 */}
            <div className="h-20 w-20 shrink-0 rounded-lg bg-muted/50" />

            <div className="space-y-3">
              {/* 麵包屑 */}
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-16 bg-muted/40 rounded" />
                <div className="h-3 w-3 bg-muted/20 rounded" />
                <div className="h-3 w-20 bg-muted/40 rounded" />
                <div className="h-3 w-3 bg-muted/20 rounded" />
                <div className="h-3 w-24 bg-muted/50 rounded" />
              </div>

              {/* 角色名稱 + Badge */}
              <div className="flex items-center gap-4">
                <div className="h-8 w-40 bg-muted/50 rounded-lg" />
                <div className="h-5 w-16 bg-muted/40 rounded-full" />
              </div>
            </div>
          </div>

          {/* 操作按鈕群 */}
          <div className="flex items-center gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-10 w-10 bg-muted/30 rounded-lg" />
            ))}
          </div>
        </header>
      }
      maxWidth="lg"
    >
      {/* Tab 列 */}
      <div className="border-b border-border/10 mb-6">
        <div className="flex gap-6 animate-pulse">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-4 w-14 bg-muted/30 rounded mb-3" />
          ))}
        </div>
      </div>

      {/* 表單 placeholder */}
      <div className="space-y-6 animate-pulse">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-20 bg-muted/40 rounded" />
            <div className="h-10 w-full bg-muted/20 rounded-lg" />
          </div>
        ))}
      </div>
    </PageLayout>
  );
}
