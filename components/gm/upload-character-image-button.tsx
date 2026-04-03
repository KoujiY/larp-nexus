'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadCharacterImage } from '@/app/actions/characters';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Upload, AlertTriangle } from 'lucide-react';
import { IconActionButton } from '@/components/gm/icon-action-button';
import { cn } from '@/lib/utils';
import {
  GM_LABEL_CLASS,
  GM_DIALOG_CONTENT_CLASS,
  GM_DIALOG_HEADER_CLASS,
  GM_DIALOG_TITLE_CLASS,
  GM_DIALOG_BODY_CLASS,
  GM_DIALOG_FOOTER_CLASS,
  GM_CANCEL_BUTTON_CLASS,
  GM_CTA_BUTTON_CLASS,
} from '@/lib/styles/gm-form';

interface UploadCharacterImageButtonProps {
  characterId: string;
}

export function UploadCharacterImageButton({
  characterId,
}: UploadCharacterImageButtonProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 驗證檔案類型
    if (!file.type.startsWith('image/')) {
      setError('請選擇圖片檔案');
      return;
    }

    // 驗證檔案大小（5MB）
    if (file.size > 5 * 1024 * 1024) {
      setError('圖片大小不可超過 5MB');
      return;
    }

    setSelectedFile(file);
    setError(null);

    // 產生預覽
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('請選擇圖片');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const result = await uploadCharacterImage(characterId, formData);

      if (result.success) {
        setOpen(false);
        setPreview(null);
        setSelectedFile(null);
        router.refresh();
      } else {
        setError(result.message || '上傳失敗');
      }
    } catch (err) {
      console.error('Error uploading image:', err);
      setError('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // 關閉時清除狀態
      setPreview(null);
      setSelectedFile(null);
      setError(null);
    }
    setOpen(newOpen);
  };

  return (
    <>
      <IconActionButton
        icon={<Upload className="h-[18px] w-[18px]" />}
        label="上傳圖片"
        onClick={() => handleOpenChange(true)}
        size="sm"
      />
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[480px] p-0 gap-0')}
          showCloseButton={false}
        >
          <div className={GM_DIALOG_HEADER_CLASS}>
            <DialogTitle className={GM_DIALOG_TITLE_CLASS}>上傳角色圖片</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground/70 mt-1">
              選擇一張圖片作為角色卡的封面（最大 5MB）
            </DialogDescription>
          </div>

          <div className={GM_DIALOG_BODY_CLASS}>
            <div className="space-y-2">
              <label className={GM_LABEL_CLASS}>選擇圖片</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={isLoading}
                className="block w-full text-sm text-muted-foreground
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-primary file:text-primary-foreground
                  hover:file:bg-primary/90
                  file:cursor-pointer cursor-pointer"
              />
            </div>

            {preview && (
              <div className="space-y-2">
                <label className={GM_LABEL_CLASS}>預覽</label>
                <div className="relative w-full h-64 bg-muted rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-foreground flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!process.env.NEXT_PUBLIC_BLOB_TOKEN_CONFIGURED && (
              <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 text-sm text-foreground flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <span>圖片上傳功能需要配置 Vercel Blob Token</span>
              </div>
            )}
          </div>

          <div className={GM_DIALOG_FOOTER_CLASS}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isLoading}
              className={GM_CANCEL_BUTTON_CLASS}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={isLoading || !selectedFile}
              className={GM_CTA_BUTTON_CLASS}
            >
              {isLoading ? '上傳中...' : '上傳圖片'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

