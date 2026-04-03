import { PageLayout } from '@/components/gm/page-layout';

function SkeletonCard() {
  return (
    <div className="bg-card border border-border/40 p-6 rounded-xl flex flex-col h-[280px] animate-pulse">
      {/* 頂部：標題 + Badge */}
      <div className="flex justify-between items-start mb-6">
        <div className="h-7 w-40 bg-muted/50 rounded-lg" />
        <div className="h-5 w-16 bg-muted/50 rounded-full" />
      </div>

      {/* 描述 */}
      <div className="space-y-2 mb-auto">
        <div className="h-4 w-full bg-muted/30 rounded" />
        <div className="h-4 w-3/4 bg-muted/30 rounded" />
      </div>

      {/* 底部：日期 + 角色數 */}
      <div className="mt-8 flex justify-between items-end">
        <div className="space-y-1">
          <div className="h-3 w-12 bg-muted/30 rounded" />
          <div className="h-3 w-20 bg-muted/30 rounded" />
        </div>
        <div className="h-8 w-24 bg-muted/30 rounded-lg" />
      </div>
    </div>
  );
}

export default function GamesLoading() {
  return (
    <PageLayout
      header={
        <div>
          <h1 className="text-3xl font-bold mb-1">劇本管理</h1>
          <p className="text-muted-foreground text-sm">管理您的 LARP 劇本</p>
        </div>
      }
      maxWidth="xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </PageLayout>
  );
}
