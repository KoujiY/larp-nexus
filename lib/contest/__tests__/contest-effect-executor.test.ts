/**
 * executeContestEffects 寫入/通知一致性回歸測試
 *
 * 核心保護（CONTEST_CONSISTENCY_PLAN D1=路線 B）：
 * 1. 同角色的數值變更（$set）與時效性效果（$push temporaryEffects）必須
 *    併入同一次 updateCharacterData —— 由 MongoDB 單文件原子性保證
 *    「client 收 character.affected 後重抓，不可能看到數值已變但無倒數條目」
 * 2. emitCharacterAffected 必須在該角色的 DB 寫入 resolve 之後才發出
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/websocket/events', () => ({ emitCharacterAffected: vi.fn() }));
vi.mock('@/lib/game/get-character-data', () => ({
  getBaselineCharacterId: vi.fn((doc: { _id: string }) => doc._id),
  getCharacterData: vi.fn(),
}));
vi.mock('@/lib/game/update-character-data', () => ({ updateCharacterData: vi.fn() }));
vi.mock('@/lib/effects/create-temporary-effect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/effects/create-temporary-effect')>();
  return { ...actual, createTemporaryEffectRecord: vi.fn() };
});
vi.mock('@/lib/item/get-item-effects', () => ({ getItemEffects: vi.fn(() => []) }));
vi.mock('@/lib/logs/write-log', () => ({ writeLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/effects/shared-effect-executor', () => ({
  computeStatChange: vi.fn(),
  applyItemTransfer: vi.fn(),
}));
vi.mock('@/lib/reveal/auto-reveal-evaluator', () => ({
  executeAutoReveal: vi.fn().mockResolvedValue(undefined),
}));

import { executeContestEffects } from '../contest-effect-executor';
import { updateCharacterData } from '@/lib/game/update-character-data';
import { emitCharacterAffected } from '@/lib/websocket/events';
import { createTemporaryEffectRecord } from '@/lib/effects/create-temporary-effect';
import { computeStatChange } from '@/lib/effects/shared-effect-executor';
import type { CharacterDocument } from '@/lib/db/models';
import type { SkillType } from '@/lib/db/types/character-types';

const updateMock = vi.mocked(updateCharacterData);
const emitMock = vi.mocked(emitCharacterAffected);
const createTempRecordMock = vi.mocked(createTemporaryEffectRecord);
const computeStatChangeMock = vi.mocked(computeStatChange);

/** 建立最小可用的角色文件 mock */
function makeCharacter(id: string, name: string, stats: Array<{ id: string; name: string; value: number }>): CharacterDocument {
  return {
    _id: id,
    name,
    gameId: 'game-1',
    stats,
    skills: [],
    items: [],
    tasks: [],
  } as unknown as CharacterDocument;
}

function makeSkill(effects: SkillType['effects']): SkillType {
  return { id: 'skill-1', name: '測試技能', effects, tags: [] } as unknown as SkillType;
}

describe('executeContestEffects 寫入/通知一致性', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue(undefined);
    emitMock.mockResolvedValue(undefined);
    // 簡化的 stat 計算：直接套 delta
    computeStatChangeMock.mockImplementation((stat, value) => ({
      newValue: stat.value + value,
      newMaxValue: undefined,
      deltaValue: value,
      deltaMax: 0,
      message: `${stat.name} ${value > 0 ? '+' : ''}${value}`,
      effectiveTarget: 'value',
    }) as ReturnType<typeof computeStatChange>);
  });

  it('時效性效果與數值變更併入同一次 updateCharacterData（$set + $push 原子合併）', async () => {
    const attacker = makeCharacter('atk-1', '攻擊者', [{ id: 'st-1', name: 'MP', value: 50 }]);
    const defender = makeCharacter('def-1', '防守者', [{ id: 'st-2', name: 'HP', value: 100 }]);
    const skill = makeSkill([
      { type: 'stat_change', targetStat: 'HP', value: -10, duration: 60 },
    ]);

    await executeContestEffects(attacker, defender, skill, undefined, 'attacker_wins', undefined, { skipFinalReload: true });

    // 防守方只能有一次寫入，且同時包含 $set 與 $push
    const defenderCalls = updateMock.mock.calls.filter(([id]) => id === 'def-1');
    expect(defenderCalls).toHaveLength(1);
    const updates = defenderCalls[0][1] as {
      $set?: Record<string, unknown>;
      $push?: { temporaryEffects?: { $each: Array<Record<string, unknown>> } };
    };
    expect(updates.$set?.['stats.0.value']).toBe(90);
    const pushed = updates.$push?.temporaryEffects?.$each;
    expect(pushed).toHaveLength(1);
    expect(pushed?.[0]).toMatchObject({
      sourceType: 'skill',
      sourceId: 'skill-1',
      sourceCharacterId: 'atk-1',
      targetStat: 'HP',
      deltaValue: -10,
      duration: 60,
      isExpired: false,
    });

    // 不再走獨立的 createTemporaryEffectRecord（獨立 $push 即 race 來源）
    expect(createTempRecordMock).not.toHaveBeenCalled();
  });

  it('emitCharacterAffected 在同角色的 DB 寫入 resolve 後才發出', async () => {
    const callOrder: string[] = [];
    updateMock.mockImplementation(async () => {
      // 模擬 DB 延遲，曝露「emit 不等寫入」的時序錯誤
      await new Promise((resolve) => setTimeout(resolve, 10));
      callOrder.push('update');
    });
    emitMock.mockImplementation(async () => {
      callOrder.push('emit');
    });

    const attacker = makeCharacter('atk-1', '攻擊者', []);
    const defender = makeCharacter('def-1', '防守者', [{ id: 'st-2', name: 'HP', value: 100 }]);
    const skill = makeSkill([
      { type: 'stat_change', targetStat: 'HP', value: -10, duration: 60 },
    ]);

    await executeContestEffects(attacker, defender, skill, undefined, 'attacker_wins', undefined, { skipFinalReload: true });

    expect(callOrder).toEqual(['update', 'emit']);
  });

  it('無 duration 的效果不產生 $push', async () => {
    const attacker = makeCharacter('atk-1', '攻擊者', []);
    const defender = makeCharacter('def-1', '防守者', [{ id: 'st-2', name: 'HP', value: 100 }]);
    const skill = makeSkill([
      { type: 'stat_change', targetStat: 'HP', value: -10 },
    ]);

    await executeContestEffects(attacker, defender, skill, undefined, 'attacker_wins', undefined, { skipFinalReload: true });

    const defenderCalls = updateMock.mock.calls.filter(([id]) => id === 'def-1');
    expect(defenderCalls).toHaveLength(1);
    const updates = defenderCalls[0][1] as { $set?: Record<string, unknown>; $push?: unknown };
    expect(updates.$set?.['stats.0.value']).toBe(90);
    expect(updates.$push).toBeUndefined();
  });

  it('self/other 混合：各 bucket 獨立寫入，只有對手收到 character.affected', async () => {
    const attacker = makeCharacter('atk-1', '攻擊者', [{ id: 'st-1', name: 'MP', value: 50 }]);
    const defender = makeCharacter('def-1', '防守者', [{ id: 'st-2', name: 'HP', value: 100 }]);
    const skill = makeSkill([
      { type: 'stat_change', targetStat: 'HP', value: -10, targetType: 'other', duration: 60 },
      { type: 'stat_change', targetStat: 'MP', value: 5, targetType: 'self' },
    ]);

    await executeContestEffects(attacker, defender, skill, undefined, 'attacker_wins', undefined, { skipFinalReload: true });

    // 兩個角色各一次寫入
    const defenderCalls = updateMock.mock.calls.filter(([id]) => id === 'def-1');
    const attackerCalls = updateMock.mock.calls.filter(([id]) => id === 'atk-1');
    expect(defenderCalls).toHaveLength(1);
    expect(attackerCalls).toHaveLength(1);

    // 對手有 $push（duration 效果），self 無
    const defUpdates = defenderCalls[0][1] as { $push?: { temporaryEffects?: { $each: unknown[] } } };
    const atkUpdates = attackerCalls[0][1] as { $set?: Record<string, unknown>; $push?: unknown };
    expect(defUpdates.$push?.temporaryEffects?.$each).toHaveLength(1);
    expect(atkUpdates.$set?.['stats.0.value']).toBe(55);
    expect(atkUpdates.$push).toBeUndefined();

    // 只有對手收 character.affected（self 效果不發跨角色通知）
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0]).toBe('def-1');
  });

  it('defender_wins：actualSource 切換為防守方來源，效果反向套用到攻擊方', async () => {
    const attacker = makeCharacter('atk-1', '攻擊者', [{ id: 'st-1', name: 'HP', value: 80 }]);
    const defender = makeCharacter('def-1', '防守者', []);
    (defender as unknown as { skills: SkillType[] }).skills = [
      makeSkill([{ type: 'stat_change', targetStat: 'HP', value: -7, duration: 30 }]),
    ];
    const attackerSkill = makeSkill([{ type: 'stat_change', targetStat: 'HP', value: -99 }]);

    await executeContestEffects(
      attacker, defender, attackerSkill, undefined, 'defender_wins',
      [{ type: 'skill', id: 'skill-1' }], { skipFinalReload: true },
    );

    // 效果套用到攻擊方（防守方視角的 other）
    const attackerCalls = updateMock.mock.calls.filter(([id]) => id === 'atk-1');
    expect(attackerCalls).toHaveLength(1);
    const updates = attackerCalls[0][1] as {
      $set?: Record<string, unknown>;
      $push?: { temporaryEffects?: { $each: Array<Record<string, unknown>> } };
    };
    expect(updates.$set?.['stats.0.value']).toBe(73);
    expect(updates.$push?.temporaryEffects?.$each?.[0]).toMatchObject({
      sourceCharacterId: 'def-1',
      deltaValue: -7,
      duration: 30,
    });

    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0]).toBe('atk-1');
  });
});
