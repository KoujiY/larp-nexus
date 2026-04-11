/**
 * 前端圖片壓縮工具
 * 使用 Canvas API 在瀏覽器端 resize + 品質壓縮，不需額外套件
 */

type CompressOptions = {
  /** 最大寬度（px） */
  maxWidth: number;
  /** 最大高度（px） */
  maxHeight: number;
  /** JPEG 品質 0-1 */
  quality: number;
  /** 輸出 MIME 類型 */
  outputType?: 'image/jpeg' | 'image/webp';
};

type ImagePreset = Omit<CompressOptions, 'outputType'> & {
  /** 裁切框的寬高比（寬/高），如 1 = 正方形、3/2 = 橫幅 */
  aspectRatio: number;
};

/** 各實體的預設壓縮設定 */
export const IMAGE_PRESETS = {
  character: { maxWidth: 1200, maxHeight: 1200, quality: 0.85, aspectRatio: 1 },
  item: { maxWidth: 600, maxHeight: 600, quality: 0.8, aspectRatio: 1 },
  skill: { maxWidth: 600, maxHeight: 600, quality: 0.8, aspectRatio: 1 },
  gmAvatar: { maxWidth: 400, maxHeight: 400, quality: 0.8, aspectRatio: 1 },
  gameCover: { maxWidth: 1200, maxHeight: 800, quality: 0.85, aspectRatio: 3 / 2 },
} as const satisfies Record<string, ImagePreset>;

export type ImagePresetKey = keyof typeof IMAGE_PRESETS;

/**
 * 將 File 載入為 HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('無法載入圖片'));
    };
    img.src = url;
  });
}

/**
 * 計算等比例縮放後的尺寸
 */
function calculateDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (srcWidth <= maxWidth && srcHeight <= maxHeight) {
    return { width: srcWidth, height: srcHeight };
  }
  const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
  return {
    width: Math.round(srcWidth * ratio),
    height: Math.round(srcHeight * ratio),
  };
}

/**
 * 壓縮圖片
 * @returns 壓縮後的 File 物件（保留原檔名，副檔名改為 .jpg）
 */
export async function compressImage(
  file: File,
  options: CompressOptions,
): Promise<File> {
  const { maxWidth, maxHeight, quality, outputType = 'image/jpeg' } = options;

  const img = await loadImage(file);
  const { width, height } = calculateDimensions(img.width, img.height, maxWidth, maxHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立 Canvas context');

  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas 轉換失敗'))),
      outputType,
      quality,
    );
  });

  // 保留原檔名但更換副檔名
  const ext = outputType === 'image/webp' ? '.webp' : '.jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}${ext}`, { type: outputType });
}
