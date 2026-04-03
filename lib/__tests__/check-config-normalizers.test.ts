import { describe, it, expect } from 'vitest';
import { normalizeCheckConfig } from '../utils/check-config-normalizers';

describe('normalizeCheckConfig', () => {
  // ─── none ────────────────────────────────────────────────────────────────────

  it('none: 清除兩個設定', () => {
    const result = normalizeCheckConfig('none', { relatedStat: 'ATK' }, { maxValue: 100, threshold: 50 });
    expect(result.contestConfig).toBeUndefined();
    expect(result.randomConfig).toBeUndefined();
  });

  it('undefined: 清除兩個設定', () => {
    const result = normalizeCheckConfig(undefined, undefined, undefined);
    expect(result.contestConfig).toBeUndefined();
    expect(result.randomConfig).toBeUndefined();
  });

  // ─── contest ─────────────────────────────────────────────────────────────────

  it('contest: 保留已有的 contestConfig', () => {
    const result = normalizeCheckConfig('contest', {
      relatedStat: 'ATK',
      opponentMaxItems: 2,
      opponentMaxSkills: 1,
      tieResolution: 'defender_wins',
    }, undefined);
    expect(result.contestConfig?.relatedStat).toBe('ATK');
    expect(result.contestConfig?.opponentMaxItems).toBe(2);
    expect(result.contestConfig?.tieResolution).toBe('defender_wins');
    expect(result.randomConfig).toBeUndefined();
  });

  it('contest: contestConfig 為 undefined 時補預設值', () => {
    const result = normalizeCheckConfig('contest', undefined, undefined);
    expect(result.contestConfig).toEqual({
      relatedStat: '',
      opponentMaxItems: 0,
      opponentMaxSkills: 0,
      tieResolution: 'attacker_wins',
    });
    expect(result.randomConfig).toBeUndefined();
  });

  it('contest: 清除 randomConfig', () => {
    const result = normalizeCheckConfig('contest', { relatedStat: 'DEF' }, { maxValue: 100, threshold: 50 });
    expect(result.randomConfig).toBeUndefined();
  });

  // ─── random_contest ───────────────────────────────────────────────────────────

  it('random_contest: relatedStat 強制清空', () => {
    const result = normalizeCheckConfig('random_contest', { relatedStat: 'ATK', opponentMaxItems: 3 }, undefined);
    expect(result.contestConfig?.relatedStat).toBe('');
    expect(result.contestConfig?.opponentMaxItems).toBe(3);
    expect(result.randomConfig).toBeUndefined();
  });

  it('random_contest: contestConfig 為 undefined 時補預設值', () => {
    const result = normalizeCheckConfig('random_contest', undefined, undefined);
    expect(result.contestConfig?.relatedStat).toBe('');
    expect(result.contestConfig?.tieResolution).toBe('attacker_wins');
  });

  // ─── random ──────────────────────────────────────────────────────────────────

  it('random: 保留有效的 maxValue 與 threshold', () => {
    const result = normalizeCheckConfig('random', undefined, { maxValue: 200, threshold: 80 });
    expect(result.randomConfig).toEqual({ maxValue: 200, threshold: 80 });
    expect(result.contestConfig).toBeUndefined();
  });

  it('random: maxValue 無效時補預設 100', () => {
    const result = normalizeCheckConfig('random', undefined, { maxValue: 0, threshold: 50 });
    expect(result.randomConfig?.maxValue).toBe(100);
  });

  it('random: threshold 無效時補預設 50', () => {
    const result = normalizeCheckConfig('random', undefined, { maxValue: 100, threshold: 0 });
    expect(result.randomConfig?.threshold).toBe(50);
  });

  it('random: threshold 超過 maxValue 時夾至 maxValue', () => {
    const result = normalizeCheckConfig('random', undefined, { maxValue: 60, threshold: 80 });
    expect(result.randomConfig?.threshold).toBe(60);
    expect(result.randomConfig?.maxValue).toBe(60);
  });

  it('random: randomConfig 為 undefined 時使用全預設值', () => {
    const result = normalizeCheckConfig('random', undefined, undefined);
    expect(result.randomConfig).toEqual({ maxValue: 100, threshold: 50 });
  });

  it('random: 清除 contestConfig', () => {
    const result = normalizeCheckConfig('random', { relatedStat: 'ATK' }, { maxValue: 100, threshold: 50 });
    expect(result.contestConfig).toBeUndefined();
  });
});
