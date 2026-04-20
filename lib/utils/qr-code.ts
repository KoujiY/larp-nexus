/**
 * 生成 QR Code 圖片 (Data URL)
 *
 * qrcode 套件透過 dynamic import 延後載入（原 14 KB gzip 進 eager bundle）。
 * 僅在使用者實際點擊產 QR Code 按鈕時才 fetch chunk。
 */
export async function generateQRCode(text: string): Promise<string> {
  try {
    const { default: QRCode } = await import('qrcode');
    return await QRCode.toDataURL(text, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
  } catch (error) {
    console.error('QR Code 生成失敗:', error);
    throw new Error('無法生成 QR Code');
  }
}

/**
 * 取得 App Base URL（去除末尾斜線）
 */
function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return url.replace(/\/+$/, '');
}

/**
 * 生成角色卡 URL
 */
export function generateCharacterUrl(characterId: string): string {
  return `${getBaseUrl()}/c/${characterId}`;
}

/**
 * 生成劇本公開資訊頁面 URL
 */
export function generateGamePublicUrl(gameId: string): string {
  return `${getBaseUrl()}/g/${gameId}`;
}

