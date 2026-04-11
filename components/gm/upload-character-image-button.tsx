'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { uploadCharacterImage } from '@/app/actions/characters';
import { Upload } from 'lucide-react';
import { IconActionButton } from '@/components/gm/icon-action-button';
import { ImageUploadDialog } from '@/components/shared/image-upload-dialog';

type UploadCharacterImageButtonProps = {
  characterId: string;
};

export function UploadCharacterImageButton({
  characterId,
}: UploadCharacterImageButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleUpload = async (formData: FormData) => {
    const result = await uploadCharacterImage(characterId, formData);
    return {
      success: result.success,
      error: result.success ? undefined : result.message,
    };
  };

  return (
    <>
      <IconActionButton
        icon={<Upload className="h-[18px] w-[18px]" />}
        label="上傳圖片"
        onClick={() => setOpen(true)}
        size="sm"
      />
      <ImageUploadDialog
        open={open}
        onOpenChange={setOpen}
        title="上傳角色圖片"
        description="選擇一張圖片作為角色卡的封面"
        preset="character"
        onUpload={handleUpload}
        onError={(msg) => toast.error(msg)}
        onSuccess={() => {
          toast.success('圖片上傳成功');
          router.refresh();
        }}
      />
    </>
  );
}
