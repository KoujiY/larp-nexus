/**
 * perf-context 單元測試
 *
 * 重點：
 * 1. 併發的 runWithPerf 各自持有獨立累加器（ALS 歸因正確，互不污染）
 * 2. PERF_LOG 未啟用時直通執行、不輸出 log
 * 3. fn throw 時標記 result=error 並原樣重拋
 * 4. 無 perf context 時累加函數靜默 no-op（不可炸掉呼叫端）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  runWithPerf,
  addDbTime,
  addPusherTime,
  incrGetChar,
  getPerfStore,
  formatPerfLine,
  isPerfLogEnabled,
  type PerfStore,
} from '../perf-context';

describe('perf-context', () => {
  const originalPerfLog = process.env.PERF_LOG;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.PERF_LOG = '1';
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalPerfLog === undefined) {
      delete process.env.PERF_LOG;
    } else {
      process.env.PERF_LOG = originalPerfLog;
    }
    infoSpy.mockRestore();
  });

  describe('isPerfLogEnabled', () => {
    it('PERF_LOG=1 時回傳 true', () => {
      expect(isPerfLogEnabled()).toBe(true);
    });

    it('PERF_LOG 未設定時回傳 false', () => {
      delete process.env.PERF_LOG;
      expect(isPerfLogEnabled()).toBe(false);
    });
  });

  describe('runWithPerf', () => {
    it('回傳 fn 的結果', async () => {
      const result = await runWithPerf('test-action', async () => 42);
      expect(result).toBe(42);
    });

    it('輸出 [perf:start] 與 [perf] 兩行，且欄位齊全', async () => {
      await runWithPerf('test-action', async () => {
        addDbTime(10);
        addPusherTime(20);
        incrGetChar();
      });

      const lines = infoSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const startLine = lines.find((l: string) => l.startsWith('[perf:start]'));
      const endLine = lines.find((l: string) => l.startsWith('[perf] '));

      expect(startLine).toMatch(/^\[perf:start\] action=test-action reqId=\w{8}$/);
      expect(endLine).toMatch(
        /^\[perf\] action=test-action reqId=\w{8} total=\d+ db=10 dbOps=1 pusher=20 getChar=1 emits=1 result=ok$/,
      );
    });

    it('fn throw 時標記 result=error 並原樣重拋', async () => {
      const boom = new Error('boom');
      await expect(
        runWithPerf('test-action', async () => {
          throw boom;
        }),
      ).rejects.toBe(boom);

      const endLine = infoSpy.mock.calls
        .map((c: unknown[]) => String(c[0]))
        .find((l: string) => l.startsWith('[perf] '));
      expect(endLine).toContain('result=error');
    });

    it('PERF_LOG 未啟用時直通執行、不輸出 log、無 perf store', async () => {
      delete process.env.PERF_LOG;

      let storeInside: PerfStore | undefined = { action: 'sentinel' } as PerfStore;
      const result = await runWithPerf('test-action', async () => {
        storeInside = getPerfStore();
        return 'pass-through';
      });

      expect(result).toBe('pass-through');
      expect(storeInside).toBeUndefined();
      expect(infoSpy).not.toHaveBeenCalled();
    });

    it('併發執行時各自持有獨立累加器（互不污染）', async () => {
      // 兩個 action 交錯執行：A 累加 db、B 累加 pusher，
      // 若 ALS 歸因錯誤，A 的 log 行會出現 B 的數字
      const interleave = () => new Promise((resolve) => setTimeout(resolve, 5));

      await Promise.all([
        runWithPerf('action-a', async () => {
          addDbTime(100);
          await interleave();
          addDbTime(100);
          incrGetChar();
        }),
        runWithPerf('action-b', async () => {
          addPusherTime(50);
          await interleave();
          addPusherTime(50);
        }),
      ]);

      const lines = infoSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const lineA = lines.find((l: string) => l.includes('action=action-a') && l.startsWith('[perf] '));
      const lineB = lines.find((l: string) => l.includes('action=action-b') && l.startsWith('[perf] '));

      expect(lineA).toContain('db=200 dbOps=2');
      expect(lineA).toContain('pusher=0');
      expect(lineA).toContain('getChar=1');
      expect(lineB).toContain('pusher=100');
      expect(lineB).toContain('db=0 dbOps=0');
      expect(lineB).toContain('emits=2');
    });
  });

  describe('累加函數在無 perf context 時', () => {
    it('靜默 no-op、不丟例外', () => {
      expect(() => {
        addDbTime(10);
        addPusherTime(10);
        incrGetChar();
      }).not.toThrow();
    });
  });

  describe('formatPerfLine', () => {
    it('輸出固定格式且毫秒四捨五入', () => {
      const store: PerfStore = {
        action: 'contest-respond',
        reqId: 'abcd1234',
        startedAt: 0,
        dbMs: 620.4,
        dbOps: 24,
        pusherMs: 980.6,
        pusherCalls: 9,
        getCharCalls: 5,
      };
      expect(formatPerfLine(store, 1840.2, 'ok')).toBe(
        '[perf] action=contest-respond reqId=abcd1234 total=1840 db=620 dbOps=24 pusher=981 getChar=5 emits=9 result=ok',
      );
    });
  });
});
