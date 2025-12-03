'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadCharacterImage } from '@/app/actions/characters';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1">
          📸 上傳圖片
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>上傳角色圖片</DialogTitle>
          <DialogDescription>
            選擇一張圖片作為角色卡的封面（最大 5MB）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="image">選擇圖片</Label>
            <input
              ref={fileInputRef}
              id="image"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isLoading}
              className="block w-full text-sm text-gray-500
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
              <Label>預覽</Label>
              <div className="relative w-full h-64 bg-muted rounded-lg overflow-hidden">
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
            <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">
              {error}
            </div>
          )}

          {!process.env.NEXT_PUBLIC_BLOB_TOKEN_CONFIGURED && (
            <div className="p-3 rounded-lg bg-yellow-50 text-yellow-800 text-sm border border-yellow-200">
              ⚠️ 提示：圖片上傳功能需要配置 Vercel Blob Token
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={isLoading || !selectedFile}
          >
            {isLoading ? '上傳中...' : '上傳圖片'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

