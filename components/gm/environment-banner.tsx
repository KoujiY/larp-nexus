/**
 * GM 環境橫幅 — 顯示當前環境狀態（Baseline / Runtime）
 * 固定於內容區頂部，讓 GM 在任何子頁面都能感知當前環境。
 * 共用於劇本管理頁和角色編輯頁。
 */
interface EnvironmentBannerProps {
  isActive: boolean;
  gameName: string;
}

export function EnvironmentBanner({ isActive, gameName }: EnvironmentBannerProps) {
  if (isActive) {
    return (
      <div className="sticky top-0 z-40 w-full border-b border-env-runtime/30 bg-env-runtime/10 px-6 py-2.5 text-sm font-bold tracking-wider text-env-runtime flex justify-center items-center gap-2.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-env-runtime animate-pulse" />
        <span>遊戲進行中（Runtime）— {gameName}</span>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-40 w-full border-b border-border bg-muted/50 px-6 py-2.5 text-sm text-muted-foreground flex justify-center items-center gap-2.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full border border-muted-foreground/50" />
      <span>設定模式（Baseline）— {gameName}</span>
    </div>
  );
}
