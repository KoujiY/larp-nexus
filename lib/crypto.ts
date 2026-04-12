import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * 從環境變數取得加密金鑰。
 * 使用 SHA-256 將任意長度的 secret 正規化為 256-bit 金鑰。
 */
function getKey(): Buffer {
  const secret = process.env.AI_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AI_ENCRYPTION_SECRET 環境變數未設定或長度不足 32 字元');
  }
  return createHash('sha256').update(secret).digest();
}

/**
 * 使用 AES-256-GCM 加密明文。
 * @param plainText 要加密的字串
 * @returns 格式為 `iv:encrypted:authTag` 的十六進位字串
 */
export function encrypt(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

/**
 * 使用 AES-256-GCM 解密密文。
 * @param cipherText 格式為 `iv:encrypted:authTag` 的十六進位字串
 * @returns 原始明文字串
 * @throws 密文格式錯誤或驗證失敗時拋出錯誤
 */
export function decrypt(cipherText: string): string {
  const key = getKey();
  const [ivHex, encryptedHex, authTagHex] = cipherText.split(':');
  if (!ivHex || !encryptedHex || !authTagHex) {
    throw new Error('密文格式錯誤，預期格式為 iv:encrypted:authTag');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
