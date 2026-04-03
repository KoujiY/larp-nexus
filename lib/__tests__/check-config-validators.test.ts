import { describe, it, expect } from 'vitest';
import { validateCheckConfig } from '../utils/check-config-validators';

describe('validateCheckConfig', () => {
  // ─── none ───────────────────────────────────────────────────────────────────

  it('none: 無條件通過', () => {
    expect(validateCheckConfig('none', undefined, undefined)).toEqual({ valid: true });
  });

  it('undefined checkType: 無條件通過', () => {
    expect(validateCheckConfig(undefined, undefined, undefined)).toEqual({ valid: true });
  });

  // ─── contest ─────────────────────────────────────────────────────────────────

  it('contest: 有 relatedStat 時通過', () => {
    const result = validateCheckConfig('contest', { relatedStat: 'ATK' }, undefined);
    expect(result).toEqual({ valid: true });
  });

  it('contest: relatedStat 為空字串時失敗', () => {
    const result = validateCheckConfig('contest', { relatedStat: '' }, undefined);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorMessage).toBe('請選擇對抗檢定使用的數值');
    }
  });

  it('contest: contestConfig 為 undefined 時失敗', () => {
    const result = validateCheckConfig('contest', undefined, undefined);
    expect(result.valid).toBe(false);
  });

  // ─── random_contest ──────────────────────────────────────────────────────────

  it('random_contest: 無 contestConfig 亦通過', () => {
    expect(validateCheckConfig('random_contest', undefined, undefined)).toEqual({ valid: true });
  });

  it('random_contest: 有 contestConfig 亦通過', () => {
    const result = validateCheckConfig('random_contest', { relatedStat: '' }, undefined);
    expect(result).toEqual({ valid: true });
  });

  // ─── random ──────────────────────────────────────────────────────────────────

  it('random: 有效的 randomConfig 時通過', () => {
    const result = validateCheckConfig('random', undefined, { maxValue: 100, threshold: 60 });
    expect(result).toEqual({ valid: true });
  });

  it('random: randomConfig 為 undefined 時失敗', () => {
    const result = validateCheckConfig('random', undefined, undefined);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorMessage).toBe('請設定隨機檢定配置');
    }
  });

  it('random: threshold 為 undefined 時失敗', () => {
    const result = validateCheckConfig('random', undefined, { maxValue: 100 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorMessage).toBe('請設定隨機檢定門檻值');
    }
  });

  it('random: maxValue 為 undefined 時失敗', () => {
    const result = validateCheckConfig('random', undefined, { threshold: 50 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorMessage).toBe('請設定隨機檢定上限值');
    }
  });

  it('random: threshold > maxValue 時失敗', () => {
    const result = validateCheckConfig('random', undefined, { maxValue: 50, threshold: 80 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorMessage).toBe('門檻值不得超過上限值');
    }
  });

  it('random: threshold === maxValue 時通過（邊界值）', () => {
    const result = validateCheckConfig('random', undefined, { maxValue: 100, threshold: 100 });
    expect(result).toEqual({ valid: true });
  });
});
