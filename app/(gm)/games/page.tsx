import { getGames } from '@/app/actions/games';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/gm/page-layout';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CreateGameButton } from '@/components/gm/create-game-button';

export default async function GamesPage() {
  const result = await getGames();

  if (!result.success) {
    if (result.error === 'UNAUTHORIZED') {
      redirect('/auth/login');
    }
    return (
      <PageLayout
        header={
          <div>
            <h1 className="text-3xl font-bold">劇本管理</h1>
          </div>
        }
        maxWidth="lg"
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
      header={
        <div className="flex items-center justify-between w-full">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold mb-1">劇本管理</h1>
            <p className="text-muted-foreground text-sm">管理您的 LARP 劇本</p>
          </div>
          <div className="shrink-0 ml-4">
            <CreateGameButton />
          </div>
        </div>
      }
      maxWidth="lg"
    >
      <div className="space-y-8">

      {/* Games List */}
      {games.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="text-6xl">📚</div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold">尚無劇本</h3>
              <p className="text-muted-foreground">
                建立您的第一個劇本開始使用
              </p>
            </div>
            <CreateGameButton />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <Card
              key={game.id}
              className="hover:shadow-lg transition-shadow group"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-1">
                    <CardTitle className="line-clamp-1">{game.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {game.description || '無描述'}
                    </CardDescription>
                  </div>
                  <Badge variant={game.isActive ? 'default' : 'secondary'}>
                    {game.isActive ? '啟用中' : '已停用'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  建立於 {new Date(game.createdAt).toLocaleDateString('zh-TW')}
                </div>
                <Link href={`/games/${game.id}`}>
                  <Button className="w-full" variant="outline">
                    管理劇本
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </PageLayout>
  );
}

