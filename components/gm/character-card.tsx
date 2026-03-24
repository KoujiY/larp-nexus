'use client';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CharacterData } from '@/types/character';
import { DeleteCharacterButton } from './delete-character-button';
import { UploadCharacterImageButton } from './upload-character-image-button';
import { GenerateQRCodeButton } from './generate-qrcode-button';
import { ViewPinButton } from './view-pin-button';
import Link from 'next/link';
import { User } from 'lucide-react';
import Image from 'next/image';

interface CharacterCardProps {
  character: CharacterData;
  gameId: string;
}

export function CharacterCard({ character, gameId }: CharacterCardProps) {
  return (
    <Card className="hover:shadow-lg transition-all hover:-translate-y-1 group overflow-hidden cursor-pointer border-2 hover:border-primary/50">
      {/* Clickable Area - Navigate to Edit Page */}
      <Link href={`/games/${gameId}/characters/${character.id}`} className="block">
        {/* Character Image */}
        {character.imageUrl ? (
          <div className="relative aspect-4/3 w-full bg-muted">
            <Image
              src={character.imageUrl}
              alt={character.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-200"
            />
          </div>
        ) : (
          <div className="aspect-4/3 w-full bg-muted flex items-center justify-center transition-colors group-hover:bg-muted/70">
            <User className="h-16 w-16 text-muted-foreground group-hover:scale-110 transition-transform" />
          </div>
        )}

        <CardHeader className="pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2 min-w-0">
              <CardTitle className="line-clamp-1 group-hover:text-primary transition-colors text-lg">
                {character.name}
              </CardTitle>
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {character.description || '無描述'}
              </p>
            </div>
            {character.hasPinLock && (
              <Badge variant="secondary" className="ml-2 shrink-0">
                🔒 PIN
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="text-xs text-muted-foreground">
            建立於 {new Date(character.createdAt).toLocaleDateString('zh-TW')}
          </div>
        </CardContent>
      </Link>

      {/* Action Buttons - Prevent click propagation */}
      <CardFooter className="flex flex-col space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex w-full gap-2">
          <UploadCharacterImageButton characterId={character.id} />
          <GenerateQRCodeButton characterId={character.id} />
        </div>
        {character.hasPinLock && (
          <div className="flex w-full">
            <ViewPinButton 
              characterId={character.id} 
              characterName={character.name}
            />
          </div>
        )}
        <div className="flex w-full">
          <DeleteCharacterButton
            characterId={character.id}
            characterName={character.name}
            gameId={gameId}
          />
        </div>
        <div className="w-full pt-3 border-t border-border/50">
          <Link href={`/games/${gameId}/characters/${character.id}`}>
            <div className="text-center text-sm text-muted-foreground hover:text-primary transition-colors py-1.5">
              點擊卡片進入編輯 →
            </div>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

