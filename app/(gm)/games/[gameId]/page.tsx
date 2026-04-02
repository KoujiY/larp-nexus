import { getGameById } from '@/app/actions/games';
import { getCharactersByGameId } from '@/app/actions/characters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/gm/page-layout';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CreateCharacterButton } from '@/components/gm/create-character-button';
import { CharacterCard } from '@/components/gm/character-card';
import { GmEmptyState } from '@/components/gm/gm-empty-state';
import { Users } from 'lucide-react';
import { GameEditTabs } from '@/components/gm/game-edit-tabs';
import { GameCodeSection } from '@/components/gm/game-code-section';
import { GameLifecycleControls } from '@/components/gm/game-lifecycle-controls';
import { GameHeaderActions } from '@/components/gm/game-header-actions';
import { EnvironmentBanner } from '@/components/gm/environment-banner';
import { GmBreadcrumb } from '@/components/gm/gm-breadcrumb';
import { RuntimeConsole } from '@/components/gm/runtime-console';

interface GamePageProps {
  params: Promise<{ gameId: string }>;
}

export default async function GamePage({ params }: GamePageProps) {
  const { gameId } = await params;
  const result = await getGameById(gameId);

  if (!result.success || !result.data) {
    if (result.error === 'UNAUTHORIZED') {
      redirect('/auth/login');
    }
    return (
      <div className="p-8">
        <div className="text-center text-destructive">
          {result.message || '找不到此劇本'}
        </div>
        <div className="mt-4 text-center">
          <Link href="/games">
            <Button variant="outline">返回劇本列表</Button>
          </Link>
        </div>
      </div>
    );
  }

  const game = result.data;
  const charactersResult = await getCharactersByGameId(gameId);
  const characters = charactersResult.success ? charactersResult.data || [] : [];

  return (
    <PageLayout
      topSlot={<EnvironmentBanner isActive={game.isActive} gameName={game.name} />}
      header={
        <div className="w-full space-y-4">
          {/* 麵包屑 */}
          <GmBreadcrumb items={[
            { label: '劇本管理', href: '/games' },
            { label: game.name },
          ]} />

          {/* 標題行 */}
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-extrabold tracking-tight">{game.name}</h1>
            <Badge
              variant="secondary"
              className={`shrink-0 text-[10px] font-black rounded-full uppercase px-3 py-1 ${
                game.isActive ? 'bg-env-runtime text-env-runtime-fg' : ''
              }`}
            >
              {game.isActive ? '進行中' : '待機中'}
            </Badge>
          </div>

          {/* Game Code（左）+ 操作按鈕群（右）— 同一行、同高度 */}
          <div className="flex items-stretch justify-between gap-4">
            <GameCodeSection gameId={game.id} gameCode={game.gameCode} />

            <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-xl border border-border/10 shadow-sm">
              <GameLifecycleControls gameId={game.id} isActive={game.isActive} />
              <div className="flex items-center px-2">
                <GameHeaderActions gameId={game.id} gameName={game.name} />
              </div>
            </div>
          </div>
        </div>
      }
      maxWidth="lg"
    >
      <GameEditTabs
        game={game}
        consoleTab={
          game.isActive ? (
            <RuntimeConsole gameId={game.id} characters={characters} />
          ) : undefined
        }
        charactersTab={
          characters.length === 0 ? (
            <GmEmptyState
              icon={<Users className="h-10 w-10" />}
              title="尚未建立任何角色"
              description="開始為你的劇本建立角色吧，每個角色都可以擁有獨立的背景故事、道具與技能。"
            >
              <CreateCharacterButton gameId={game.id} variant="card" />
            </GmEmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <CreateCharacterButton gameId={game.id} variant="card" />
              {characters.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  gameId={game.id}
                />
              ))}
            </div>
          )
        }
      />
    </PageLayout>
  );
}
