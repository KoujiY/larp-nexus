'use client';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CharacterData } from '@/types/character';
import { EditCharacterButton } from './edit-character-button';
import { DeleteCharacterButton } from './delete-character-button';
import { UploadCharacterImageButton } from './upload-character-image-button';
import { GenerateQRCodeButton } from './generate-qrcode-button';
import Image from 'next/image';

interface CharacterCardProps {
  character: CharacterData;
  gameId: string;
}

export function CharacterCard({ character, gameId }: CharacterCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow group overflow-hidden">
      {/* Character Image */}
      {character.imageUrl ? (
        <div className="relative h-48 w-full bg-muted">
          <Image
            src={character.imageUrl}
            alt={character.name}
            fill
            className="object-cover"
          />
        </div>
      ) : (
        <div className="h-48 w-full bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center">
          <span className="text-6xl">👤</span>
        </div>
      )}

      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-1">
            <CardTitle className="line-clamp-1">{character.name}</CardTitle>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {character.description || '無描述'}
            </p>
          </div>
          {character.hasPinLock && (
            <Badge variant="secondary" className="ml-2">
              🔒 PIN
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        <div className="text-xs text-muted-foreground">
          建立於 {new Date(character.createdAt).toLocaleDateString('zh-TW')}
        </div>
      </CardContent>

      <CardFooter className="flex flex-col space-y-2">
        <div className="flex w-full space-x-2">
          <UploadCharacterImageButton characterId={character.id} />
          <GenerateQRCodeButton characterId={character.id} />
        </div>
        <div className="flex w-full space-x-2">
          <EditCharacterButton character={character} gameId={gameId} />
          <DeleteCharacterButton
            characterId={character.id}
            characterName={character.name}
            gameId={gameId}
          />
        </div>
      </CardFooter>
    </Card>
  );
}

