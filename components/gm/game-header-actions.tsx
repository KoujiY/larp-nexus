'use client';

import Link from 'next/link';
import { Eye } from 'lucide-react';
import { IconActionButton } from '@/components/gm/icon-action-button';
import { GenerateGamePublicQRCodeButton } from '@/components/gm/generate-game-public-qrcode-button';
import { DeleteGameButton } from '@/components/gm/delete-game-button';

interface GameHeaderActionsProps {
  gameId: string;
  gameName: string;
}

/**
 * 劇本管理頁標頭的 icon-only 操作按鈕群
 * 包含：世界觀 QR Code、預覽公開頁面、刪除劇本
 */
export function GameHeaderActions({ gameId, gameName }: GameHeaderActionsProps) {
  return (
    <div className="flex items-center">
      <GenerateGamePublicQRCodeButton gameId={gameId} />
      <IconActionButton
        icon={<Eye className="h-5 w-5" />}
        label="預覽公開頁面"
        asChild
      >
        <Link href={`/g/${gameId}`} target="_blank">
          <Eye className="h-5 w-5" />
        </Link>
      </IconActionButton>
      <DeleteGameButton gameId={gameId} gameName={gameName} />
    </div>
  );
}
