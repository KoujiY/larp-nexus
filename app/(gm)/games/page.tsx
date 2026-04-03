import { getGames } from '@/app/actions/games';
import { PageLayout } from '@/components/gm/page-layout';
import { GmEmptyState } from '@/components/gm/gm-empty-state';
import { CreateGameButton } from '@/components/gm/create-game-button';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen, Users } from 'lucide-react';

export default async function GamesPage() {
  const result = await getGames();

  if (!result.success) {
    if (result.error === 'UNAUTHORIZED') {
      redirect('/auth/login');
    }
    return (
      <PageLayout
        header={<GameListHeader />}
        maxWidth="xl"
      >
        <div className="text-center text-destructive">
          {result.message || '無法載入劇本'}
        </div>
      </PageLayout>
    );
  }

  const games = result.data || [];

  return (
    <PageLayout
      header={<GameListHeader />}
      maxWidth="xl"
    >
      {games.length === 0 ? (
        <GmEmptyState
          icon={<BookOpen className="h-10 w-10" />}
          title="尚無劇本"
          description="建立您的第一個劇本，開始編織冒險的篇章"
        >
          <CreateGameButton />
        </GmEmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {/* 新增劇本卡片（第一位） */}
          <CreateGameButton variant="card" />

          {/* 劇本卡片列表 */}
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </PageLayout>
  );
}

// ─────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────

function GameListHeader() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-1">劇本管理</h1>
      <p className="text-muted-foreground text-sm">
        管理您的 LARP 劇本
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Game Card
// ─────────────────────────────────────────────

type GameCardProps = {
  game: {
    id: string;
    name: string;
    description: string;
    isActive: boolean;
    characterCount?: number;
    createdAt: Date;
  };
};

function GameCard({ game }: GameCardProps) {
  return (
    <Link href={`/games/${game.id}`} className="block group">
      <div className="game-card relative bg-card border border-border/40 p-6 rounded-xl flex flex-col h-[280px] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_oklch(var(--primary)/0.15)]">
        {/* 頂部：標題 + 狀態 Badge */}
        <div className="flex justify-between items-start mb-6">
          <h3 className="text-2xl font-bold text-foreground truncate pr-4 group-hover:text-primary transition-colors">
            {game.name}
          </h3>
          <span
            className={
              game.isActive
                ? 'shrink-0 bg-primary text-primary-foreground text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest'
                : 'shrink-0 bg-muted text-muted-foreground text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest border border-border'
            }
          >
            {game.isActive ? '進行中' : '待機中'}
          </span>
        </div>

        {/* 描述 */}
        <p className="text-muted-foreground text-sm leading-relaxed mb-auto line-clamp-2 italic">
          {game.description || '尚無描述'}
        </p>

        {/* 底部：日期 + 角色數 */}
        <div className="mt-8 flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-tighter mb-1">
              建立日期
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {new Date(game.createdAt).toLocaleDateString('sv-SE')}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border/30">
            <Users className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-bold text-foreground">
              {game.characterCount ?? 0} 位角色
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
