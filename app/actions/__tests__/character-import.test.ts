import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/auth/session', () => ({
  getCurrentGMUserId: vi.fn(),
}));
vi.mock('@/lib/ai/provider', () => ({
  callAiForCharacterImport: vi.fn(),
}));
vi.mock('@/lib/ai/parsers/docx', () => ({
  parseDocx: vi.fn(),
}));

import { parseCharacterFromText, parseCharacterFromDocx } from '@/app/actions/character-import';
import { getCurrentGMUserId } from '@/lib/auth/session';
import { callAiForCharacterImport } from '@/lib/ai/provider';
import { parseDocx } from '@/lib/ai/parsers/docx';
import type { CharacterImportResult } from '@/lib/ai/schemas/character-import';

const MOCK_RESULT: CharacterImportResult = {
  name: '測試角色',
  description: '測試描述',
  slogan: null,
  publicInfo: { background: [], personality: null, relationships: [] },
  secretInfo: { secrets: [] },
  tasks: [],
  stats: [],
};

describe('parseCharacterFromText', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('未登入時回傳 UNAUTHORIZED', async () => {
    vi.mocked(getCurrentGMUserId).mockResolvedValueOnce(null);
    const result = await parseCharacterFromText('角色文字');
    expect(result.success).toBe(false);
    expect(result.error).toBe('UNAUTHORIZED');
  });

  it('文字超過 50000 字元時回傳錯誤', async () => {
    vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
    const longText = 'a'.repeat(50001);
    const result = await parseCharacterFromText(longText);
    expect(result.success).toBe(false);
  });

  it('空文字時回傳錯誤', async () => {
    vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
    const result = await parseCharacterFromText('');
    expect(result.success).toBe(false);
  });

  it('成功呼叫 AI 並回傳解析結果', async () => {
    vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
    vi.mocked(callAiForCharacterImport).mockResolvedValueOnce(MOCK_RESULT);

    const result = await parseCharacterFromText('角色名稱：測試角色');
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('測試角色');
    expect(callAiForCharacterImport).toHaveBeenCalledWith('user1', '角色名稱：測試角色');
  });

  it('AI 呼叫失敗時回傳錯誤訊息', async () => {
    vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
    vi.mocked(callAiForCharacterImport).mockRejectedValueOnce(new Error('API error'));

    const result = await parseCharacterFromText('角色文字');
    expect(result.success).toBe(false);
  });
});

describe('parseCharacterFromDocx', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('解析 .docx 後呼叫 AI', async () => {
    vi.mocked(getCurrentGMUserId).mockResolvedValueOnce('user1');
    vi.mocked(parseDocx).mockResolvedValueOnce('從 docx 提取的文字');
    vi.mocked(callAiForCharacterImport).mockResolvedValueOnce(MOCK_RESULT);

    const formData = new FormData();
    const blob = new Blob(['fake-docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    formData.append('file', blob, 'test.docx');

    const result = await parseCharacterFromDocx(formData);
    expect(result.success).toBe(true);
    expect(parseDocx).toHaveBeenCalled();
    expect(callAiForCharacterImport).toHaveBeenCalledWith('user1', '從 docx 提取的文字');
  });
});
