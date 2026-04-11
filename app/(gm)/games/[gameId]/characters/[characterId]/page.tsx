import { getCharacterById, getCharactersByGameId } from '@/app/actions/characters';
import { getGameById } from '@/app/actions/games';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/gm/page-layout';
import { EnvironmentBanner } from '@/components/gm/environment-banner';
import { CharacterEditTabs } from '@/components/gm/character-edit-tabs';
import { UploadCharacterImageButton } from '@/components/gm/upload-character-image-button';
import { GenerateQRCodeButton } from '@/components/gm/generate-qrcode-button';
import { ViewPinButton } from '@/components/gm/view-pin-button';
import { DeleteCharacterButton } from '@/components/gm/delete-character-button';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { LockKeyhole } from 'lucide-react';
import { GmBreadcrumb } from '@/components/gm/gm-breadcrumb';

interface CharacterEditPageProps {
  params: Promise<{
    gameId: string;
    characterId: string;
  }>;
}

export default async function CharacterEditPage({ params }: CharacterEditPageProps) {
  const { gameId, characterId } = await params;

  const characterResult = await getCharacterById(characterId);
  if (!characterResult.success || !characterResult.data) {
    if (characterResult.error === 'UNAUTHORIZED') {
      redirect('/auth/login');
    }
    redirect(`/games/${gameId}`);
  }

  const gameResult = await getGameById(gameId);
  if (!gameResult.success || !gameResult.data) {
    redirect('/games');
  }

  const character = characterResult.data;
  const game = gameResult.data;

  // 同劇本角色摘要（排除自身），用於 Tab 2 人物關係頭像
  const allCharsResult = await getCharactersByGameId(gameId);
  const gameCharacters = (allCharsResult.success && allCharsResult.data
    ? allCharsResult.data
    : []
  )
    .filter((c) => c.id !== character.id)
    .map((c) => ({ id: c.id, name: c.name, imageUrl: c.imageUrl }));

  /** 角色名稱首字，用於頭像佔位 */
  const avatarInitial = character.name.charAt(0);

  return (
    <PageLayout
      topSlot={
        <EnvironmentBanner isActive={game.isActive} gameName={game.name} />
      }
      header={
        <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-6">
            {/* 角色頭像 — 80×80 圓角方形 */}
            {character.imageUrl ? (
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
                <Image
                  src={character.imageUrl}
                  alt={character.name}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted text-3xl font-bold text-muted-foreground">
                {avatarInitial}
              </div>
            )}

            <div className="space-y-3">
              {/* 麵包屑 */}
              <GmBreadcrumb items={[
                { label: '劇本管理', href: '/games' },
                { label: game.name, href: `/games/${gameId}` },
                { label: character.name },
              ]} />

              {/* 角色名稱 + 標籤 */}
              <div className="flex items-center gap-4">
                <h1 className="truncate text-3xl font-bold tracking-tight">
                  {character.name}
                </h1>
                <div className="flex shrink-0 gap-2">
                  <Badge
                    variant="secondary"
                    className={
                      game.isActive
                        ? 'bg-env-runtime/15 text-env-runtime border border-env-runtime/30 text-[10px] font-bold uppercase tracking-wider'
                        : 'bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-wider'
                    }
                  >
                    {game.isActive ? 'Runtime' : 'Baseline'}
                  </Badge>
                  {character.hasPinLock && (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                    >
                      <LockKeyhole className="h-3.5 w-3.5" />
                      PIN 已設定
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 操作按鈕群 — icon-only, 40×40 */}
          <div className="flex items-center gap-2">
            <UploadCharacterImageButton characterId={character.id} />
            <GenerateQRCodeButton characterId={character.id} />
            {character.hasPinLock && (
              <ViewPinButton
                characterId={character.id}
                characterName={character.name}
              />
            )}
            {!game.isActive && (
              <>
                <div className="mx-1 h-6 w-px bg-border/30" />
                <DeleteCharacterButton
                  characterId={character.id}
                  characterName={character.name}
                  gameId={gameId}
                />
              </>
            )}
          </div>
        </header>
      }
      maxWidth="lg"
    >
      {/* Tab 導航 + 內容 + Sticky Save Bar
          （所有 WebSocket 事件由 CharacterEditTabs 內部統一訂閱，含 dirty check） */}
      <CharacterEditTabs
        character={character}
        gameId={gameId}
        gameIsActive={game.isActive}
        randomContestMaxValue={game.randomContestMaxValue}
        gameCharacters={gameCharacters}
      />
    </PageLayout>
  );
}
