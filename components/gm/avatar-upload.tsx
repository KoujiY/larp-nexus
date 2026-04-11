'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Camera } from 'lucide-react';
import { ImageUploadDialog } from '@/components/shared/image-upload-dialog';
import { uploadGMAvatar } from '@/app/actions/profile';

type AvatarUploadProps = {
  displayName: string;
  avatarUrl?: string;
};

/**
 * GM 頭像上傳元件
 * 點擊頭像區域開啟 ImageUploadDialog，上傳後刷新頁面
 */
export function AvatarUpload({ displayName, avatarUrl }: AvatarUploadProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(avatarUrl);
  const avatarInitial = displayName.charAt(0);

  // 同步 props 更新（server refresh 後 props 可能改變）
  const effectiveUrl = currentUrl ?? avatarUrl;

  return (
    <>
      <div
        className="relative group cursor-pointer shrink-0"
        onClick={() => setDialogOpen(true)}
      >
        {effectiveUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={effectiveUrl}
            alt={displayName}
            className="w-20 h-20 rounded-full object-cover shadow-sm"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-muted-foreground/30 flex items-center justify-center text-white text-3xl font-bold shadow-sm">
            {avatarInitial}
          </div>
        )}
        <div className="absolute -bottom-1 -right-1 bg-primary p-1.5 rounded-full border-4 border-background shadow-sm group-hover:scale-110 transition-transform">
          <Camera className="h-4 w-4 text-primary-foreground" />
        </div>
      </div>

      <ImageUploadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="上傳頭像"
        description="選擇一張圖片作為您的 GM 頭像"
        preset="gmAvatar"
        onUpload={async (formData) => {
          const result = await uploadGMAvatar(formData);
          if (result.success && result.data) {
            setCurrentUrl(result.data.avatarUrl);
          }
          return { success: result.success, error: result.message };
        }}
        onSuccess={() => {
          toast.success('頭像更新成功');
          router.refresh();
        }}
        onError={(msg) => toast.error(msg)}
      />
    </>
  );
}
