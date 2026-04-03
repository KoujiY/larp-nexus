'use client';

import type { CharacterData } from '@/types/character';
import { DeleteCharacterButton } from './delete-character-button';
import { UploadCharacterImageButton } from './upload-character-image-button';
import { GenerateQRCodeButton } from './generate-qrcode-button';
import { ViewPinButton } from './view-pin-button';
import Link from 'next/link';
import { NavLink } from '@/components/shared/nav-link';
import { User } from 'lucide-react';
import Image from 'next/image';

interface CharacterCardProps {
  character: CharacterData;
  gameId: string;
}

export function CharacterCard({ character, gameId }: CharacterCardProps) {
  return (
    <div className="group bg-card rounded-xl overflow-hidden border border-border/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5">
      {/* 可點擊區域 — 導航至編輯頁 */}
      <NavLink href={`/games/${gameId}/characters/${character.id}`} className="block rounded-t-xl overflow-hidden" showOverlay>
        {/* 角色圖片 */}
        {character.imageUrl ? (
          <div className="relative aspect-16/10 w-full overflow-hidden bg-muted">
            <Image
              src={character.imageUrl}
              alt={character.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-700"
            />
          </div>
        ) : (
          <div className="aspect-16/10 w-full flex flex-col items-center justify-center bg-muted/30">
            <User className="h-8 w-8 text-muted-foreground/30" />
            <span className="text-[9px] text-muted-foreground/30 tracking-widest mt-1">尚無圖片</span>
          </div>
        )}
      </NavLink>

      {/* 卡片資訊區 */}
      <div className="px-4 py-3">
        {/* 名稱 + 日期 */}
        <div className="mb-2">
          <h3 className="text-base font-extrabold text-foreground line-clamp-1">
            {character.name}
          </h3>
          <p className="text-[9px] text-muted-foreground/50 tracking-widest mt-0.5">
            EST. {new Date(character.createdAt).toLocaleDateString('sv-SE')}
          </p>
        </div>

        {/* 操作列 */}
        <div
          className="flex items-center gap-0.5 mb-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <UploadCharacterImageButton characterId={character.id} />
          <GenerateQRCodeButton characterId={character.id} />
          {character.hasPinLock && (
            <ViewPinButton
              characterId={character.id}
              characterName={character.name}
            />
          )}
          <div className="flex-1" />
          <DeleteCharacterButton
            characterId={character.id}
            characterName={character.name}
            gameId={gameId}
          />
        </div>

        {/* 底部連結 */}
        <div className="pt-2.5 border-t border-border/5">
          <Link href={`/games/${gameId}/characters/${character.id}`}>
            <span className="text-[11px] font-bold text-primary opacity-80 group-hover:opacity-100 group-hover:translate-x-1 transition-all inline-block cursor-pointer">
              點擊卡片進入編輯 →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
