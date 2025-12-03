'use client';

import { useState, useSyncExternalStore, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CharacterData } from '@/types/character';
import { PinUnlock } from './pin-unlock';
import { PublicInfoSection } from './public-info-section';
import { SecretInfoSection } from './secret-info-section';
import { TaskList } from './task-list';
import { ItemList } from './item-list';
import { WorldInfoLink } from './world-info-link';
import Image from 'next/image';

interface CharacterCardViewProps {
  character: CharacterData;
}

// Hook 用於安全地讀取 localStorage（避免 SSR/CSR hydration 問題）
function useLocalStorageUnlock(characterId: string, hasPinLock: boolean) {
  const storageKey = `character-${characterId}-unlocked`;

  const subscribe = useCallback(
    (callback: () => void) => {
      window.addEventListener('storage', callback);
      return () => window.removeEventListener('storage', callback);
    },
    []
  );

  const getSnapshot = useCallback(() => {
    if (!hasPinLock) return true;
    return localStorage.getItem(storageKey) === 'true';
  }, [hasPinLock, storageKey]);

  // Server 端的快照：有 PIN 鎖時為 false
  const getServerSnapshot = useCallback(() => {
    return !hasPinLock;
  }, [hasPinLock]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function CharacterCardView({ character }: CharacterCardViewProps) {
  // 使用 useSyncExternalStore 安全地從 localStorage 讀取解鎖狀態
  const isStorageUnlocked = useLocalStorageUnlock(character.id, character.hasPinLock);
  const [isManuallyUnlocked, setIsManuallyUnlocked] = useState(false);

  // 最終解鎖狀態：localStorage 或手動解鎖
  const isUnlocked = isStorageUnlocked || isManuallyUnlocked;

  const handleUnlocked = () => {
    setIsManuallyUnlocked(true);
    // 儲存解鎖狀態到 localStorage
    localStorage.setItem(`character-${character.id}-unlocked`, 'true');
  };

  // 如果需要 PIN 且未解鎖，顯示解鎖畫面
  if (character.hasPinLock && !isUnlocked) {
    return (
      <PinUnlock
        characterId={character.id}
        characterName={character.name}
        onUnlocked={handleUnlocked}
      />
    );
  }

  // 已解鎖或無 PIN，顯示角色卡
  return (
    <div className="container max-w-4xl mx-auto p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
          🎭 LARP Nexus
        </h1>
        <p className="text-purple-200 text-sm">角色卡系統</p>
      </div>

      {/* 主要角色卡 */}
      <Card className="mb-6 overflow-hidden">
        {/* 角色圖片 */}
        {character.imageUrl && (
          <div className="relative h-64 md:h-96 w-full bg-linear-to-br from-purple-200 to-purple-300">
            <Image
              src={character.imageUrl}
              alt={character.name}
              fill
              className="object-cover"
              priority
            />
          </div>
        )}

        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-3xl md:text-4xl mb-2">
                {character.name}
              </CardTitle>
              {character.publicInfo?.personality && (
                <p className="text-muted-foreground mb-2">
                  {character.publicInfo.personality}
                </p>
              )}
              {character.hasPinLock && (
                <Badge variant="secondary" className="mb-2">
                  🔓 已解鎖
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* 角色描述 */}
          {character.description && (
            <div className="space-y-2 mb-6">
              <h3 className="text-xl font-semibold flex items-center">
                <span className="mr-2">📝</span>
                角色描述
              </h3>
              <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {character.description}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tab 切換：資訊、任務、道具 */}
      <Card className="mb-6">
        <CardContent className="p-0">
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="info">📋 資訊</TabsTrigger>
              <TabsTrigger value="tasks">✅ 任務</TabsTrigger>
              <TabsTrigger value="items">🎒 道具</TabsTrigger>
            </TabsList>

            <div className="p-6">
              <TabsContent value="info" className="mt-0 space-y-6">
                <PublicInfoSection publicInfo={character.publicInfo} />
                <SecretInfoSection
                  secretInfo={character.secretInfo}
                  characterId={character.id}
                />
              </TabsContent>

              <TabsContent value="tasks" className="mt-0">
                <TaskList tasks={character.tasks} />
              </TabsContent>

              <TabsContent value="items" className="mt-0">
                <ItemList items={character.items} />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* 世界觀連結 */}
      <WorldInfoLink gameId={character.gameId} />

      {/* 系統資訊 */}
      <Card className="mt-6">
        <CardContent className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div className="flex items-center">
              <span className="mr-2">🆔</span>
              <span>角色 ID: {character.id.substring(0, 8)}...</span>
            </div>
            <div className="flex items-center">
              <span className="mr-2">📅</span>
              <span>
                建立於 {new Date(character.createdAt).toLocaleDateString('zh-TW')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 返回提示 */}
      <div className="mt-8 text-center">
        <p className="text-purple-200 text-sm">
          🎮 這是您的專屬角色卡，請妥善保管此頁面連結
        </p>
      </div>
    </div>
  );
}

