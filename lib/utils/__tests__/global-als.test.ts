import { describe, it, expect } from 'vitest';
import { getGlobalAls } from '../global-als';

describe('getGlobalAls', () => {
  it('同名呼叫回傳同一實例（HMR-safe 契約）', () => {
    const a = getGlobalAls<{ value: number }>('test-same');
    const b = getGlobalAls<{ value: number }>('test-same');

    expect(a).toBe(b);
  });

  it('不同名稱回傳不同實例', () => {
    expect(getGlobalAls('test-x')).not.toBe(getGlobalAls('test-y'));
  });

  it('透過取得的實例可正常 run / getStore', () => {
    const als = getGlobalAls<{ count: number }>('test-run');

    const result = als.run({ count: 7 }, () => als.getStore()?.count);

    expect(result).toBe(7);
    expect(als.getStore()).toBeUndefined();
  });

  it('跨「模組重新評估」共用 store：A 取得的實例寫入，B 取得的實例讀得到', () => {
    // 模擬 HMR：兩次獨立的 getGlobalAls 呼叫代表新舊模組各自取得實例
    const writer = getGlobalAls<{ tag: string }>('test-hmr');
    const reader = getGlobalAls<{ tag: string }>('test-hmr');

    writer.run({ tag: 'shared' }, () => {
      expect(reader.getStore()?.tag).toBe('shared');
    });
  });
});
