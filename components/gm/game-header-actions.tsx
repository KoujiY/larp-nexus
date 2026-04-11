'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Eye, Upload } from 'lucide-react';
import { IconActionButton } from '@/components/gm/icon-action-button';
import { GenerateGamePublicQRCodeButton } from '@/components/gm/generate-game-public-qrcode-button';
import { DeleteGameButton } from '@/components/gm/delete-game-button';
import { ImageUploadDialog } from '@/components/shared/image-upload-dialog';
import { uploadGameCover } from '@/app/actions/games';

interface GameHeaderActionsProps {
  gameId: string;
  gameName: string;
}

/**
 * 劇本管理頁標頭的 icon-only 操作按鈕群
 * 包含：上傳封面、世界觀 QR Code、預覽公開頁面、刪除劇本
 */
export function GameHeaderActions({ gameId, gameName }: GameHeaderActionsProps) {
  const router = useRouter();
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);

  return (
    <div className="flex items-center">
      <IconActionButton
        icon={<Upload className="h-5 w-5" />}
        label="上傳封面圖"
        onClick={() => setCoverDialogOpen(true)}
      />
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

      <ImageUploadDialog
        open={coverDialogOpen}
        onOpenChange={setCoverDialogOpen}
        title="上傳劇本封面"
        description="選擇一張圖片作為劇本封面，建議 3:2 比例"
        preset="gameCover"
        onUpload={async (formData) => {
          const result = await uploadGameCover(gameId, formData);
          return { success: result.success, error: result.message };
        }}
        onSuccess={() => {
          toast.success('封面更新成功');
          router.refresh();
        }}
        onError={(msg) => toast.error(msg)}
      />
    </div>
  );
}
