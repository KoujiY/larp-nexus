'use client';

import { useState, useRef, useCallback, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import type { Area, Point } from 'react-easy-crop';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

// react-easy-crop 5.6 KB gzip 僅在使用者實際選了圖片、進入裁切 UI 時需要。
// 用 next/dynamic 拆到獨立 chunk，ssr: false（瀏覽器 API 依賴）。
//
// 型別註記：next/dynamic 包裝後會遺失 class component 的 defaultProps 資訊，
// 導致所有 prop 都被標成 required。此處列出實際用到的欄位即可。
type CropperRuntimeProps = {
  image: string;
  crop: Point;
  zoom: number;
  aspect: number;
  onCropChange: (location: Point) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
};

const Cropper = dynamic(() => import('react-easy-crop'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      載入裁切工具...
    </div>
  ),
}) as ComponentType<CropperRuntimeProps>;
import { cn } from '@/lib/utils';
import { compressImage, IMAGE_PRESETS, type ImagePresetKey } from '@/lib/image/compress';
import { getCroppedImage } from '@/lib/image/crop';
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

/** 壓縮前的原圖大小上限（10MB），避免瀏覽器處理超大檔案時卡頓 */
const MAX_RAW_FILE_SIZE = 10 * 1024 * 1024;

type ImageUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog 標題 */
  title: string;
  /** Dialog 說明文字 */
  description?: string;
  /** 壓縮 preset 名稱 */
  preset: ImagePresetKey;
  /** 上傳 callback — 接收壓縮後的 FormData，回傳 { success, error? } */
  onUpload: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
  /** 上傳成功後的 callback */
  onSuccess?: () => void;
  /** 錯誤 callback — 由呼叫端決定如何顯示（toast 等） */
  onError?: (message: string) => void;
};

/**
 * 共用圖片上傳 Dialog
 * 選圖 → 裁切 → 壓縮 → 上傳
 * 錯誤透過 onError callback 回報，不在 Dialog 內顯示
 */
export function ImageUploadDialog({
  open,
  onOpenChange,
  title,
  description,
  preset,
  onUpload,
  onSuccess,
  onError,
}: ImageUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // 裁切狀態
  const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
  const [rawFileName, setRawFileName] = useState('');
  const [rawFileSize, setRawFileSize] = useState(0);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // 壓縮後預覽
  const [preview, setPreview] = useState<string | null>(null);
  const [compressedFile, setCompressedFile] = useState<File | null>(null);
  const [sizeInfo, setSizeInfo] = useState<string | null>(null);

  const presetConfig = IMAGE_PRESETS[preset];

  const resetState = () => {
    if (rawImageUrl) URL.revokeObjectURL(rawImageUrl);
    if (preview) URL.revokeObjectURL(preview);
    setRawImageUrl(null);
    setRawFileName('');
    setRawFileSize(0);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setPreview(null);
    setCompressedFile(null);
    setSizeInfo(null);
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED_TYPES.includes(file.type)) {
      onError?.('僅支援 JPG、PNG、WebP 格式');
      return;
    }

    if (file.size > MAX_RAW_FILE_SIZE) {
      onError?.('原始圖片不可超過 10MB');
      return;
    }

    // 清除上一張的狀態
    if (rawImageUrl) URL.revokeObjectURL(rawImageUrl);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCompressedFile(null);
    setSizeInfo(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);

    const url = URL.createObjectURL(file);
    setRawImageUrl(url);
    setRawFileName(file.name);
    setRawFileSize(file.size);
  };

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  /** 裁切 → 壓縮 → 產生預覽 */
  const handleConfirmCrop = async () => {
    if (!rawImageUrl || !croppedAreaPixels) return;

    setIsProcessing(true);
    try {
      // 步驟 1：裁切
      const cropped = await getCroppedImage(rawImageUrl, croppedAreaPixels, rawFileName);

      // 步驟 2：壓縮
      const compressed = await compressImage(cropped, presetConfig);

      setCompressedFile(compressed);
      setSizeInfo(`${formatSize(rawFileSize)} → ${formatSize(compressed.size)}`);

      // 步驟 3：預覽
      const previewUrl = URL.createObjectURL(compressed);
      setPreview(previewUrl);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : '圖片處理失敗');
    } finally {
      setIsProcessing(false);
    }
  };

  /** 回到裁切步驟 */
  const handleReCrop = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCompressedFile(null);
    setSizeInfo(null);
  };

  /** 回到選擇檔案步驟（重新選擇） */
  const handleReselect = () => {
    resetState();
  };

  const handleUpload = async () => {
    if (!compressedFile) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', compressedFile);

      const result = await onUpload(formData);

      if (result.success) {
        onOpenChange(false);
        resetState();
        onSuccess?.();
      } else {
        onError?.(result.error || '上傳失敗');
      }
    } catch {
      onError?.('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetState();
    onOpenChange(newOpen);
  };

  // 判斷目前在哪個步驟
  const isCropping = rawImageUrl && !preview;
  const isPreviewing = !!preview;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[520px] p-0 gap-0')}
        showCloseButton={false}
      >
        <div className={GM_DIALOG_HEADER_CLASS}>
          <DialogTitle className={GM_DIALOG_TITLE_CLASS}>{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-muted-foreground/70 mt-1">
              {description}
            </DialogDescription>
          )}
        </div>

        <div className={GM_DIALOG_BODY_CLASS}>
          {/* 步驟 1：選擇檔案 */}
          {!isCropping && !isPreviewing && (
            <div className="space-y-2">
              <label className={GM_LABEL_CLASS}>選擇圖片</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
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
              <p className="text-[11px] text-muted-foreground/60 font-medium">
                支援 JPG、PNG、WebP，上限 10MB
              </p>
            </div>
          )}

          {/* 步驟 2：裁切 */}
          {isCropping && (
            <div className="space-y-3">
              <label className={GM_LABEL_CLASS}>裁切圖片</label>
              <div className="relative w-full h-72 bg-muted rounded-xl overflow-hidden">
                <Cropper
                  image={rawImageUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={presetConfig.aspectRatio}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          )}

          {/* 步驟 3：預覽 */}
          {isPreviewing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={GM_LABEL_CLASS}>預覽</label>
                {sizeInfo && (
                  <span className="text-[11px] text-muted-foreground/60 font-medium">
                    {sizeInfo}
                  </span>
                )}
              </div>
              <div className="relative w-full h-72 bg-muted rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}

          {isProcessing && (
            <p className="text-sm text-muted-foreground/70 animate-pulse">
              處理中...
            </p>
          )}
        </div>

        <div className={GM_DIALOG_FOOTER_CLASS}>
          {/* 步驟 1：只有取消 */}
          {!isCropping && !isPreviewing && (
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className={GM_CANCEL_BUTTON_CLASS}
            >
              取消
            </button>
          )}

          {/* 步驟 2：重新選擇 + 確認裁切 */}
          {isCropping && (
            <>
              <button
                type="button"
                onClick={handleReselect}
                disabled={isProcessing}
                className={GM_CANCEL_BUTTON_CLASS}
              >
                重新選擇
              </button>
              <button
                type="button"
                onClick={handleConfirmCrop}
                disabled={isProcessing || !croppedAreaPixels}
                className={GM_CTA_BUTTON_CLASS}
              >
                {isProcessing ? '處理中...' : '確認裁切'}
              </button>
            </>
          )}

          {/* 步驟 3：重新裁切 / 重新選擇 + 上傳 */}
          {isPreviewing && (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReselect}
                  disabled={isLoading}
                  className={GM_CANCEL_BUTTON_CLASS}
                >
                  重新選擇
                </button>
                <button
                  type="button"
                  onClick={handleReCrop}
                  disabled={isLoading}
                  className={GM_CANCEL_BUTTON_CLASS}
                >
                  重新裁切
                </button>
              </div>
              <button
                type="button"
                onClick={handleUpload}
                disabled={isLoading}
                className={GM_CTA_BUTTON_CLASS}
              >
                {isLoading ? '上傳中...' : '上傳圖片'}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 格式化檔案大小為人類可讀字串 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
