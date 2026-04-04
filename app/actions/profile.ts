'use server';

import { getCurrentGMUserId } from '@/lib/auth/session';
import { uploadImageToBlob } from '@/lib/image/upload';
import dbConnect from '@/lib/db/mongodb';
import GMUser from '@/lib/db/models/GMUser';
import type { ApiResponse } from '@/types/api';

/**
 * 上傳 GM 頭像
 *
 * 前端已壓縮至 400×400，後端只做驗證 + 上傳 + 舊圖清理。
 * Blob 路徑：gm-avatars/{userId}/{ts}-{name}
 */
export async function uploadGMAvatar(
  formData: FormData,
): Promise<ApiResponse<{ avatarUrl: string }>> {
  try {
    const gmUserId = await getCurrentGMUserId();
    if (!gmUserId) {
      return { success: false, error: 'UNAUTHORIZED', message: '請先登入' };
    }

    await dbConnect();

    const gmUser = await GMUser.findById(gmUserId);
    if (!gmUser) {
      return { success: false, error: 'NOT_FOUND', message: '找不到使用者' };
    }

    const uploadResult = await uploadImageToBlob(formData, {
      pathPrefix: `gm-avatars/${gmUserId}`,
      oldImageUrl: gmUser.avatarUrl || undefined,
    });

    if (!uploadResult.success) {
      return { success: false, error: 'VALIDATION_ERROR', message: uploadResult.error };
    }

    await GMUser.updateOne(
      { _id: gmUserId },
      { $set: { avatarUrl: uploadResult.url } },
    );

    return {
      success: true,
      data: { avatarUrl: uploadResult.url },
    };
  } catch (error) {
    console.error('[uploadGMAvatar] Error:', error);
    return { success: false, error: 'INTERNAL_ERROR', message: '上傳失敗，請稍後再試' };
  }
}
