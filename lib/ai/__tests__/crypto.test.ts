import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const MOCK_SECRET = 'a]3Fj!kL9#mNpQ2rStUvWxYz0123456789abcdef'; // 40 chars

describe('crypto', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, AI_ENCRYPTION_SECRET: MOCK_SECRET };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('encrypt 回傳 iv:encrypted:authTag 格式', async () => {
    const { encrypt } = await import('@/lib/crypto');
    const result = encrypt('test-api-key');
    const parts = result.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveLength(24); // IV = 12 bytes = 24 hex chars
  });

  it('decrypt 可還原 encrypt 的結果', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const plainText = 'sk-proj-abc123xyz';
    const encrypted = encrypt(plainText);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plainText);
  });

  it('不同次加密同一明文產出不同密文（IV 隨機）', async () => {
    const { encrypt } = await import('@/lib/crypto');
    const plainText = 'same-key';
    const encrypted1 = encrypt(plainText);
    const encrypted2 = encrypt(plainText);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('密文被竄改時 decrypt 拋錯', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    const tampered = parts[0] + ':' + 'ff' + parts[1].slice(2) + ':' + parts[2];
    expect(() => decrypt(tampered)).toThrow();
  });

  it('缺少 AI_ENCRYPTION_SECRET 時拋錯', async () => {
    delete process.env.AI_ENCRYPTION_SECRET;
    const { encrypt } = await import('@/lib/crypto');
    expect(() => encrypt('test')).toThrow('AI_ENCRYPTION_SECRET');
  });
});
