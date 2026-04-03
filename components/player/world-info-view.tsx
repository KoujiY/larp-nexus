'use client';

/**
 * 世界觀頁面主視圖
 *
 * Ethereal Manuscript 設計風格：
 * - Hero 區塊（漸層背景 + 劇本名稱/描述）
 * - 世界觀內容（BackgroundBlock[] 渲染，可摺疊段落）
 * - 角色列表（橫向捲動頭像 + 詳情卡）
 * - 背景裝飾光球
 *
 * RWD：手機單欄、桌面 12-grid（內容 7 + 角色側欄 5）
 */

import { useState } from 'react';
import { Globe } from 'lucide-react';
import Image from 'next/image';
import type { GamePublicData } from '@/types/game';
import { BackgroundBlockRenderer } from './background-block-renderer';
import { CharacterAvatarList } from './character-avatar-list';
import { ThemeToggleButton } from './theme-toggle-button';

interface WorldInfoViewProps {
  game: GamePublicData;
}

export function WorldInfoView({ game }: WorldInfoViewProps) {
  const [activeCharId, setActiveCharId] = useState<string | undefined>(
    game.characters[0]?.id,
  );

  const activeChar = game.characters.find((c) => c.id === activeCharId);
  const hasBlocks = (game.publicInfo?.blocks?.length ?? 0) > 0;
  const hasCharacters = game.characters.length > 0;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/40 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-primary/70">
      {/* ── 主題切換按鈕（固定右上角） ── */}
      <ThemeToggleButton variant="fixed" />

      {/* ── Hero 區塊 ── */}
      <div className="relative w-full h-svh lg:h-auto lg:max-w-[1280px] lg:mx-auto lg:aspect-video lg:max-h-[720px] overflow-hidden">
        {/* 漸層背景（未來替換為圖片） */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
        {/* Overlay 漸層 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, var(--color-background) 0%, var(--color-background) 15%, color-mix(in oklch, var(--color-background) 80%, transparent) 40%, color-mix(in oklch, var(--color-background) 40%, transparent) 100%)',
          }}
        />
        {/* Hero 內容 */}
        <div className="absolute bottom-12 left-0 w-full px-6 md:px-12 lg:px-24 lg:max-w-[1280px] lg:left-1/2 lg:-translate-x-1/2">
          <h1 className="text-4xl md:text-6xl font-extrabold text-primary tracking-tighter mb-4">
            {game.name}
          </h1>
          {game.description && (
            <p className="text-muted-foreground text-lg md:text-xl max-w-2xl font-light leading-relaxed">
              {game.description}
            </p>
          )}
        </div>
      </div>

      {/* ── 主要內容 ── */}
      {hasBlocks || hasCharacters ? (
        <main className="relative z-10 max-w-[1280px] mx-auto px-6 md:px-12 lg:px-24 pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
            {/* 世界觀內容欄 */}
            {hasBlocks && (
              <div className={hasCharacters ? 'lg:col-span-7' : 'lg:col-span-12 max-w-4xl'}>
                <BackgroundBlockRenderer
                  blocks={game.publicInfo!.blocks}
                  emptyMessage="尚無世界觀內容"
                />
              </div>
            )}

            {/* 角色列表欄 */}
            {hasCharacters && (
              <aside className={hasBlocks ? 'lg:col-span-5' : 'lg:col-span-12'}>
                <div className="lg:sticky lg:top-12">
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-primary tracking-[0.2em] uppercase mb-6">
                      登場角色
                    </h3>

                    {/* 橫向頭像列表 */}
                    <CharacterAvatarList
                      characters={game.characters}
                      activeId={activeCharId}
                      onSelect={setActiveCharId}
                    />
                  </div>

                  {/* 角色詳情卡 */}
                  {activeChar && (
                    <div className="bg-card/80 backdrop-blur-[12px] rounded-xl p-8 border border-primary/5 shadow-2xl">
                      <div className="flex items-center gap-6 mb-6">
                        {/* 頭像 */}
                        <div className="w-20 h-20 rounded-full p-0.5 border-2 border-primary shadow-[0_0_15px_rgba(254,197,106,0.3)] shrink-0">
                          {activeChar.imageUrl ? (
                            <Image
                              src={activeChar.imageUrl}
                              alt={activeChar.name}
                              width={80}
                              height={80}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full rounded-full bg-surface-base flex items-center justify-center">
                              <span className="text-2xl font-bold text-primary/60 select-none">
                                {activeChar.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                        <h4 className="text-2xl font-bold text-primary">
                          {activeChar.name}
                        </h4>
                      </div>
                      {activeChar.description && (
                        <p className="text-muted-foreground text-base leading-relaxed font-light">
                          {activeChar.description}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </aside>
            )}
          </div>
        </main>
      ) : (
        /* ── 空狀態 ── */
        <main className="relative z-10 max-w-[1280px] mx-auto px-6 md:px-12 lg:px-24 pb-24 mt-16">
          <div className="py-20 text-center">
            <Globe className="mx-auto h-16 w-16 text-muted-foreground/40 mb-6" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              尚未設定世界觀資訊
            </h3>
            <p className="text-muted-foreground">
              GM 尚未為此劇本設定世界觀資訊
            </p>
          </div>
        </main>
      )}

      {/* ── 背景裝飾光球 ── */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-primary/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary/3 rounded-full blur-[100px]" />
      </div>
    </div>
  );
}
