import { getCharacterById } from '@/app/actions/characters';
import { getGameById } from '@/app/actions/games';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { PageLayout } from '@/components/gm/page-layout';
import { CharacterEditForm } from '@/components/gm/character-edit-form';
import { StatsEditForm } from '@/components/gm/stats-edit-form';
import { TemporaryEffectsCard } from '@/components/gm/temporary-effects-card';
import { TasksEditForm } from '@/components/gm/tasks-edit-form';
import { ItemsEditForm } from '@/components/gm/items-edit-form';
import { SkillsEditForm } from '@/components/gm/skills-edit-form';
import { UploadCharacterImageButton } from '@/components/gm/upload-character-image-button';
import { GenerateQRCodeButton } from '@/components/gm/generate-qrcode-button';
import { ViewPinButton } from '@/components/gm/view-pin-button';
import { DeleteCharacterButton } from '@/components/gm/delete-character-button';
import { CharacterWebSocketListener } from '@/components/gm/character-websocket-listener';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Image from 'next/image';

interface CharacterEditPageProps {
  params: Promise<{
    gameId: string;
    characterId: string;
  }>;
}

export default async function CharacterEditPage({ params }: CharacterEditPageProps) {
  const { gameId, characterId } = await params;

  // 取得角色資料
  const characterResult = await getCharacterById(characterId);
  if (!characterResult.success || !characterResult.data) {
    if (characterResult.error === 'UNAUTHORIZED') {
      redirect('/auth/login');
    }
    redirect(`/games/${gameId}`);
  }

  // 取得劇本資料（用於顯示麵包屑）
  const gameResult = await getGameById(gameId);
  if (!gameResult.success || !gameResult.data) {
    redirect('/games');
  }

  const character = characterResult.data;
  const game = gameResult.data;

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
              <Link
                href={`/games/${gameId}`}
                className="hover:text-foreground transition-colors"
              >
                {game.name}
              </Link>
              <span>/</span>
              <span className="text-foreground font-medium truncate">{character.name}</span>
            </div>
            <div className="flex items-center space-x-3">
              <h1 className="text-3xl font-bold truncate">{character.name}</h1>
              {character.hasPinLock && (
                <Badge variant="secondary" className="shrink-0">🔒 PIN 保護</Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm line-clamp-1 mt-1">
              編輯角色資訊、管理道具與技能
            </p>
          </div>
          <div className="shrink-0 ml-4">
            <Link href={`/games/${gameId}`}>
              <Button variant="outline" size="sm">
                ← 返回劇本
              </Button>
            </Link>
          </div>
        </div>
      }
      maxWidth="lg"
    >
      {/* WebSocket 事件監聽器：統一處理角色更新事件，確保無論在哪個分頁都能收到更新 */}
      <CharacterWebSocketListener characterId={character.id} />
      
      <div className="space-y-6">

        {/* Character Preview Card */}
        <Card className="bg-linear-to-br from-purple-50 to-blue-50">
          <CardContent className="p-6">
            <div className="flex items-start space-x-6">
              {/* Character Image */}
              <div className="shrink-0">
                {character.imageUrl ? (
                  <div className="relative h-32 w-32 rounded-lg overflow-hidden border-2 border-white shadow-lg">
                    <Image
                      src={character.imageUrl}
                      alt={character.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-32 w-32 rounded-lg bg-linear-to-br from-purple-200 to-blue-200 flex items-center justify-center border-2 border-white shadow-lg">
                    <span className="text-5xl">👤</span>
                  </div>
                )}
              </div>

              {/* Character Info & Actions */}
              <div className="flex-1 space-y-4">
                <div>
                  <h3 className="text-xl font-semibold">{character.name}</h3>
                  <p className="text-muted-foreground line-clamp-2 mt-1">
                    {character.description || '尚無描述'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <UploadCharacterImageButton characterId={character.id} />
                  <GenerateQRCodeButton characterId={character.id} />
                  {character.hasPinLock && (
                    <ViewPinButton
                      characterId={character.id}
                      characterName={character.name}
                    />
                  )}
                  <DeleteCharacterButton
                    characterId={character.id}
                    characterName={character.name}
                    gameId={gameId}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Different Sections */}
        <Tabs defaultValue="basic" className="space-y-6">
          <TabsList className="w-auto">
            <TabsTrigger value="basic">📝 基本資訊</TabsTrigger>
            <TabsTrigger value="stats">📊 角色數值</TabsTrigger>
            <TabsTrigger value="tasks">✅ 任務管理</TabsTrigger>
            <TabsTrigger value="items">🎒 道具管理</TabsTrigger>
            <TabsTrigger value="skills">
              ⚡ 技能管理
            </TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="space-y-6">
            <CharacterEditForm character={character} gameId={gameId} />
          </TabsContent>

          {/* Stats Tab (Phase 4) */}
          <TabsContent value="stats" className="space-y-6">
            <StatsEditForm
              characterId={character.id}
              initialStats={character.stats || []}
            />

            {/* Phase 8.6: 時效性效果卡片 */}
            <TemporaryEffectsCard characterId={character.id} />
          </TabsContent>

          {/* Tasks Tab (Phase 4.5) */}
          <TabsContent value="tasks">
            <TasksEditForm
              characterId={character.id}
              gameId={gameId}
              initialTasks={character.tasks || []}
              secrets={(character.secretInfo?.secrets || []).map((s) => ({
                id: s.id,
                title: s.title,
              }))}
            />
          </TabsContent>

          {/* Items Tab (Phase 4.5) */}
          <TabsContent value="items">
            <ItemsEditForm
              characterId={character.id}
              initialItems={character.items || []}
              stats={character.stats || []}
              randomContestMaxValue={game.randomContestMaxValue}
            />
          </TabsContent>

          {/* Skills Tab (Phase 5) */}
          <TabsContent value="skills">
            <SkillsEditForm
              characterId={character.id}
              initialSkills={character.skills || []}
              stats={character.stats || []}
              randomContestMaxValue={game.randomContestMaxValue}
            />
          </TabsContent>

        </Tabs>
      </div>
    </PageLayout>
  );
}

