import { getGameById } from '@/app/actions/games';
import { getCharactersByGameId } from '@/app/actions/characters';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EditGameButton } from '@/components/gm/edit-game-button';
import { DeleteGameButton } from '@/components/gm/delete-game-button';
import { CreateCharacterButton } from '@/components/gm/create-character-button';
import { CharacterCard } from '@/components/gm/character-card';

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
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <Link href="/games">
              <Button variant="ghost" size="sm">
                ← 返回
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-3">
            <h1 className="text-4xl font-bold">{game.name}</h1>
            <Badge variant={game.isActive ? 'default' : 'secondary'}>
              {game.isActive ? '啟用中' : '已停用'}
            </Badge>
          </div>
          {game.description && (
            <p className="text-muted-foreground text-lg">{game.description}</p>
          )}
          <div className="text-sm text-muted-foreground">
            建立於 {new Date(game.createdAt).toLocaleDateString('zh-TW', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <EditGameButton game={game} />
          <DeleteGameButton gameId={game.id} gameName={game.name} />
        </div>
      </div>

      {/* Characters Section */}
      <div className="space-y-4">
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
      </div>
    </div>
  );
}

