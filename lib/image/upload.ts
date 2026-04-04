import { put, del } from '@vercel/blob';

/** 後端上傳驗證的上限（前端壓縮後不該超過） */
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

type UploadImageOptions = {
  /** FormData 中的檔案欄位名稱 */
  fieldName?: string;
  /** Blob 儲存路徑前綴，如 `characters/{id}` */
  pathPrefix: string;
  /** 如果有舊圖 URL，上傳成功後刪除 */
  oldImageUrl?: string;
};

type UploadResult =
  | { success: true; url: string }
  | { success: false; error: string };

/**
 * 從 FormData 提取、驗證並上傳圖片到 Vercel Blob
 * Server-side only — 供各 Server Action 共用
 *
 * 注意：此函數只負責 Blob 層的上傳與舊圖清理。
 * 呼叫端需自行處理 DB 寫入策略（如角色圖片的 Baseline + Runtime 同步）。
 */
export async function uploadImageToBlob(
  formData: FormData,
  options: UploadImageOptions,
): Promise<UploadResult> {
  const { fieldName = 'image', pathPrefix, oldImageUrl } = options;

  const file = formData.get(fieldName) as File | null;
  if (!file) {
    return { success: false, error: '請選擇圖片檔案' };
  }

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { success: false, error: '僅支援 JPG、PNG、WebP 格式' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: '圖片檔案大小不可超過 2MB' };
  }

  // 消毒檔名，防止路徑注入
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const blobPath = `${pathPrefix}/${Date.now()}-${safeName}`;

  const blob = await put(blobPath, file, { access: 'public' });

  // 上傳成功後刪除舊圖（graceful degradation: 刪除失敗不影響結果）
  if (oldImageUrl) {
    try {
      await del(oldImageUrl);
    } catch {
      console.warn('Failed to delete old image:', oldImageUrl);
    }
  }

  return { success: true, url: blob.url };
}

/**
 * 批次刪除多張 Blob 圖片（graceful degradation: 個別刪除失敗不影響其他）
 *
 * 用於刪除實體時清理所有關聯圖片，例如刪除角色時同步清理頭像、道具圖、技能圖。
 */
/**
 * 從角色文件中收集所有圖片 URL（頭像 + 道具圖 + 技能圖）
 */
export function collectCharacterImageUrls(character: {
  imageUrl?: string;
  items?: Array<{ imageUrl?: string }>;
  skills?: Array<{ imageUrl?: string }>;
}): string[] {
  const urls: string[] = [];
  if (character.imageUrl) urls.push(character.imageUrl);
  for (const item of character.items || []) {
    if (item.imageUrl) urls.push(item.imageUrl);
  }
  for (const skill of character.skills || []) {
    if (skill.imageUrl) urls.push(skill.imageUrl);
  }
  return urls;
}

/**
 * 批次刪除多張 Blob 圖片（graceful degradation: 個別刪除失敗不影響其他）
 *
 * 用於刪除實體時清理所有關聯圖片，例如刪除角色時同步清理頭像、道具圖、技能圖。
 */
export async function deleteImagesFromBlob(imageUrls: string[]): Promise<void> {
  const validUrls = imageUrls.filter(Boolean);
  if (validUrls.length === 0) return;

  await Promise.allSettled(
    validUrls.map((url) =>
      del(url).catch((err) => {
        console.warn('Failed to delete blob image:', url, err);
      }),
    ),
  );
}
