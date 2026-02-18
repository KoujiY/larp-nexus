import { getGameById } from '@/app/actions/games';
import { getCharactersByGameId } from '@/app/actions/characters';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageLayout } from '@/components/gm/page-layout';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DeleteGameButton } from '@/components/gm/delete-game-button';
import { CreateCharacterButton } from '@/components/gm/create-character-button';
import { CharacterCard } from '@/components/gm/character-card';
import { GameEditForm } from '@/components/gm/game-edit-form';
import { GenerateGamePublicQRCodeButton } from '@/components/gm/generate-game-public-qrcode-button';
import { GameBroadcastPanel } from '@/components/gm/game-broadcast-panel';
import { GameCodeSection } from '@/components/gm/game-code-section'; // Phase 10
import { GameLifecycleControls } from '@/components/gm/game-lifecycle-controls'; // Phase 10.3.4

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
        <div className="text-center text-red-600">
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

  // 取得角色列表
  const charactersResult = await getCharactersByGameId(gameId);
  const characters = charactersResult.success ? charactersResult.data || [] : [];

  return (
    <PageLayout
      header={
        <div className="flex items-center justify-between w-full">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
              <Link href="/games" className="hover:text-foreground transition-colors">
                劇本列表
              </Link>
              <span>/</span>
              <span className="text-foreground font-medium truncate">{game.name}</span>
            </div>
            <div className="flex items-center space-x-3">
              <h1 className="text-3xl font-bold truncate">{game.name}</h1>
              {/* Phase 10.3.4: 改進狀態顯示 */}
              <Badge
                variant={game.isActive ? 'default' : 'secondary'}
                className={`shrink-0 ${game.isActive ? 'bg-green-600' : ''}`}
              >
                {game.isActive ? '🟢 進行中' : '⚪ 待機中'}
              </Badge>
            </div>
            {game.description && (
              <p className="text-muted-foreground text-sm line-clamp-1 mt-1">{game.description}</p>
            )}
            {/* Phase 10: Game Code 顯示和編輯 */}
            <div className="mt-3 flex items-center gap-3">
              <GameCodeSection gameId={game.id} gameCode={game.gameCode} />
              {/* Phase 10.3.4: 遊戲生命週期控制 */}
              <GameLifecycleControls gameId={game.id} isActive={game.isActive} />
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0 ml-4">
            <GenerateGamePublicQRCodeButton gameId={game.id} />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/g/${game.id}`} target="_blank">
                預覽公開頁面
              </Link>
            </Button>
            <DeleteGameButton gameId={game.id} gameName={game.name} />
          </div>
        </div>
      }
      maxWidth="lg"
    >
      {/* Tabs */}
      <Tabs defaultValue="info" className="space-y-6">
        <TabsList className="w-auto">
          <TabsTrigger value="info">📋 劇本資訊</TabsTrigger>
          <TabsTrigger value="characters">👥 角色列表</TabsTrigger>
        </TabsList>

          {/* 劇本資訊 Tab */}
          <TabsContent value="info" className="space-y-6">
            <GameEditForm game={game} />
            <GameBroadcastPanel
              gameId={game.id}
              characters={characters.map((c) => ({ id: c.id, name: c.name }))}
            />
          </TabsContent>

          {/* 角色列表 Tab */}
          <TabsContent value="characters" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">角色列表</h2>
                <p className="text-muted-foreground">
                  管理此劇本的角色卡（共 {characters.length} 個角色）
                </p>
              </div>
              <CreateCharacterButton gameId={game.id} />
            </div>

            {characters.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
                  <div className="text-6xl">👥</div>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-semibold">尚無角色</h3>
                    <p className="text-muted-foreground">
                      新增角色開始設定角色卡資訊
                    </p>
                  </div>
                  <CreateCharacterButton gameId={game.id} />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {characters.map((character) => (
                  <CharacterCard
                    key={character.id}
                    character={character}
                    gameId={game.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
    </PageLayout>
  );
}

