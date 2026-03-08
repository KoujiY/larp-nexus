import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Hash PIN 碼
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

/**
 * 驗證 PIN 碼
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

/**
 * 生成隨機 Token (用於 Magic Link)
 */
export function generateToken(): string {
  return crypto.randomUUID();
}

/**
 * 檢查 Token 是否過期
 */
export function isTokenExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

