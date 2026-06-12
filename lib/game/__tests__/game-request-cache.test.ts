/**
 * game-request-cache 單元測試
 *
 * 重點：
 * 1. runWithGameCache 建立獨立的 per-request 快取 context
 * 2. 快取命中時回傳已存的值，未命中時回傳 undefined
 * 3. 巢狀 runWithGameCache 不覆蓋外層快取（idempotent）
 * 4. 併發的 runWithGameCache 各自持有獨立快取（ALS 隔離）
 * 5. 無 context 時 get/set 靜默不炸
 */

import { describe, it, expect } from 'vitest';
import {
  runWithGameCache,
  getCachedIsActive,
  setCachedIsActive,
  getCachedGameId,
  setCachedCharGameId,
} from '../game-request-cache';

describe('game-request-cache', () => {
  describe('runWithGameCache', () => {
    it('在 context 內 get/set 正常運作', async () => {
      await runWithGameCache(async () => {
        expect(getCachedIsActive('game1')).toBeUndefined();

        setCachedIsActive('game1', true);
        expect(getCachedIsActive('game1')).toBe(true);

        setCachedCharGameId('char1', 'game1');
        expect(getCachedGameId('char1')).toBe('game1');
      });
    });

    it('context 結束後快取不殘留（下次進入是新 store）', async () => {
      await runWithGameCache(async () => {
        setCachedIsActive('game1', true);
      });

      await runWithGameCache(async () => {
        expect(getCachedIsActive('game1')).toBeUndefined();
      });
    });

    it('巢狀呼叫不覆蓋外層快取', async () => {
      await runWithGameCache(async () => {
        setCachedIsActive('game1', true);

        await runWithGameCache(async () => {
          // 內層應該看到外層的快取
          expect(getCachedIsActive('game1')).toBe(true);
          setCachedIsActive('game2', false);
        });

        // 外層應該看到內層寫入的值（同一 store）
        expect(getCachedIsActive('game2')).toBe(false);
      });
    });
  });

  describe('ALS 隔離', () => {
    it('併發的 runWithGameCache 各自持有獨立快取', async () => {
      const results: boolean[] = [];

      await Promise.all([
        runWithGameCache(async () => {
          setCachedIsActive('game1', true);
          // 讓出 event loop
          await new Promise((resolve) => setTimeout(resolve, 10));
          results.push(getCachedIsActive('game1')!);
          // 不應看到另一個 context 的 game2
          results.push(getCachedIsActive('game2') === undefined);
        }),
        runWithGameCache(async () => {
          setCachedIsActive('game2', false);
          await new Promise((resolve) => setTimeout(resolve, 10));
          results.push(getCachedIsActive('game2') === false);
          // 不應看到另一個 context 的 game1
          results.push(getCachedIsActive('game1') === undefined);
        }),
      ]);

      expect(results).toEqual([true, true, true, true]);
    });
  });

  describe('無 context 時靜默運作', () => {
    it('get 回傳 undefined', () => {
      expect(getCachedIsActive('game1')).toBeUndefined();
      expect(getCachedGameId('char1')).toBeUndefined();
    });

    it('set 不拋錯', () => {
      expect(() => setCachedIsActive('game1', true)).not.toThrow();
      expect(() => setCachedCharGameId('char1', 'game1')).not.toThrow();
    });
  });

  describe('charToGame + gameActive 整合', () => {
    it('模擬 getCharacterData 首次填入 + 後續命中', async () => {
      await runWithGameCache(async () => {
        // 首次：無快取
        expect(getCachedGameId('charA')).toBeUndefined();

        // 模擬首次查詢後填入
        setCachedCharGameId('charA', 'gameX');
        setCachedIsActive('gameX', true);

        // 後續同一 charA：命中
        expect(getCachedGameId('charA')).toBe('gameX');
        expect(getCachedIsActive('gameX')).toBe(true);

        // 不同 charB 同一 game：charToGame 未知，但 gameActive 已知
        setCachedCharGameId('charB', 'gameX');
        expect(getCachedIsActive(getCachedGameId('charB')!)).toBe(true);
      });
    });
  });
});
