/**
 * 裁切工具 — 根據 react-easy-crop 的 croppedAreaPixels 從原圖裁出指定區域
 */

type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * 將 File 載入為 HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('無法載入圖片'));
    img.src = src;
  });
}

/**
 * 根據裁切區域從原圖裁出 Blob
 * @param imageSrc - 圖片的 ObjectURL 或 data URL
 * @param crop - react-easy-crop 回傳的 croppedAreaPixels
 * @param fileName - 輸出的檔案名稱
 */
export async function getCroppedImage(
  imageSrc: string,
  crop: PixelCrop,
  fileName: string,
): Promise<File> {
  const img = await loadImage(imageSrc);

  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立 Canvas context');

  ctx.drawImage(
    img,
    crop.x, crop.y, crop.width, crop.height,
    0, 0, crop.width, crop.height,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas 轉換失敗'))),
      'image/jpeg',
      0.95, // 裁切時用高品質，壓縮交給 compressImage
    );
  });

  return new File([blob], fileName, { type: 'image/jpeg' });
}
