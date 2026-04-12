import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/auth/session', () => ({
  getCurrentGMUserId: vi.fn(),
}));
vi.mock('@/lib/db/models/GMUser', () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));
vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn().mockReturnValue('iv:encrypted:tag'),
}));
vi.mock('@/lib/ai/provider', () => ({
  testAiConnection: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { getAiConfig, saveAiConfig, deleteAiConfig } from '@/app/actions/ai-config';
import { getCurrentGMUserId } from '@/lib/auth/session';
import GMUser from '@/lib/db/models/GMUser';
import { testAiConnection } from '@/lib/ai/provider';

describe('AI Config Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAiConfig', () => {
    it('未登入時回傳 UNAUTHORIZED', async () => {
      vi.mocked(getCurrentGMUserId).mockResolvedValueOnce(null);
      const result = await getAiConfig();
      expect(result.success).toBe(false);
      expect(result.error).toBe('UNAUTHORIZED');
    });

    it('未設定 aiConfig 時回傳 hasApiKey: false', async () => {
      vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
      vi.mocked(GMUser.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'user1', email: 'test@test.com' }),
      } as never);

      const result = await getAiConfig();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ hasApiKey: false });
    });

    it('已設定 aiConfig 時回傳 hasApiKey: true 及明文設定（不含 key）', async () => {
      vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
      vi.mocked(GMUser.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'user1',
          aiConfig: {
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o',
            encryptedApiKey: 'iv:enc:tag',
          },
        }),
      } as never);

      const result = await getAiConfig();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        hasApiKey: true,
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      });
    });
  });

  describe('saveAiConfig', () => {
    it('驗證測試失敗時不儲存', async () => {
      vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
      vi.mocked(testAiConnection).mockRejectedValueOnce(new Error('Invalid API key'));

      const result = await saveAiConfig({
        provider: 'openai',
        apiKey: 'sk-invalid',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      });

      expect(result.success).toBe(false);
      expect(GMUser.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('驗證通過時加密並儲存', async () => {
      vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
      vi.mocked(testAiConnection).mockResolvedValueOnce(undefined);
      vi.mocked(GMUser.findByIdAndUpdate).mockResolvedValueOnce({});

      const result = await saveAiConfig({
        provider: 'openai',
        apiKey: 'sk-valid-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      });

      expect(result.success).toBe(true);
      expect(GMUser.findByIdAndUpdate).toHaveBeenCalledWith('user1', {
        $set: {
          aiConfig: {
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o',
            encryptedApiKey: 'iv:encrypted:tag',
          },
        },
      });
    });
  });

  describe('deleteAiConfig', () => {
    it('清除 aiConfig 欄位', async () => {
      vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
      vi.mocked(GMUser.findByIdAndUpdate).mockResolvedValueOnce({});

      const result = await deleteAiConfig();

      expect(result.success).toBe(true);
      expect(GMUser.findByIdAndUpdate).toHaveBeenCalledWith('user1', {
        $unset: { aiConfig: 1 },
      });
    });
  });
});
