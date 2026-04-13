import { describe, it, expect, vi } from 'vitest';

vi.mock('mammoth', () => ({
  extractRawText: vi.fn(),
}));

import { parseDocx } from '@/lib/ai/parsers/docx';
import { extractRawText } from 'mammoth';

describe('parseDocx', () => {
  it('回傳 mammoth 解析的純文字', async () => {
    vi.mocked(extractRawText).mockResolvedValueOnce({
      value: '角色名稱：艾德溫\n\n背景故事：\n來自北方的騎士',
      messages: [],
    });

    const buffer = Buffer.from('fake-docx-content');
    const result = await parseDocx(buffer);

    expect(result).toBe('角色名稱：艾德溫\n\n背景故事：\n來自北方的騎士');
    expect(extractRawText).toHaveBeenCalledWith({ buffer });
  });

  it('mammoth 拋錯時包裝為使用者友善訊息', async () => {
    vi.mocked(extractRawText).mockRejectedValueOnce(new Error('Invalid file'));

    const buffer = Buffer.from('not-a-docx');
    await expect(parseDocx(buffer)).rejects.toThrow('文件格式無法解析');
  });
});
