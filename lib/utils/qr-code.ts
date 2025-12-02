import QRCode from 'qrcode';

/**
 * 生成 QR Code 圖片 (Data URL)
 */
export async function generateQRCode(text: string): Promise<string> {
  try {
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
 * 生成角色卡 URL
 */
export function generateCharacterUrl(characterId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/c/${characterId}`;
}

/**
 * 生成 Magic Link URL
 */
export function generateMagicLinkUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/verify?token=${token}`;
}

/**
 * 生成劇本公開資訊頁面 URL
 */
export function generateGamePublicUrl(gameId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/g/${gameId}`;
}

