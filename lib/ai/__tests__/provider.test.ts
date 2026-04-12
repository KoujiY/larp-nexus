import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/models/GMUser', () => ({
  default: { findById: vi.fn() },
}));
vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn().mockReturnValue('sk-decrypted-key'),
}));

const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(function (this: unknown) {
      return {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };
    }),
  };
});

import { callAiForCharacterImport } from '@/lib/ai/provider';
import GMUser from '@/lib/db/models/GMUser';

describe('callAiForCharacterImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('使用者無 aiConfig 時拋出明確錯誤', async () => {
    vi.mocked(GMUser.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'user1', email: 'test@test.com' }),
    } as never);

    await expect(
      callAiForCharacterImport('user1', '角色文字')
    ).rejects.toThrow('尚未設定 AI 服務');
  });

  it('使用者有 aiConfig 時呼叫 OpenAI client 並回傳解析結果', async () => {
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

    const mockResult = {
      name: '測試角色',
      description: '',
      slogan: null,
      publicInfo: { background: [], personality: null, relationships: [] },
      secretInfo: { secrets: [] },
      tasks: [],
      stats: [],
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify(mockResult),
        },
      }],
    });

    const result = await callAiForCharacterImport('user1', '角色名稱：測試角色');
    expect(result.name).toBe('測試角色');
    expect(mockCreate).toHaveBeenCalledOnce();
  });
});
