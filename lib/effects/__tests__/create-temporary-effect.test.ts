/**
 * 時效性效果記錄工具測試
 *
 * CONTEST_CONSISTENCY_PLAN D1=路線 B：拆出 pure 的 buildTemporaryEffectRecord
 * 供對抗 executor 把 record 併入 bucket 的單一寫入；
 * createTemporaryEffectRecord 維持「build + 獨立 $push」舊介面（其他呼叫端不動）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/game/update-character-data', () => ({ updateCharacterData: vi.fn() }));

import {
  buildTemporaryEffectRecord,
  createTemporaryEffectRecord,
} from '../create-temporary-effect';
import { updateCharacterData } from '@/lib/game/update-character-data';

const updateMock = vi.mocked(updateCharacterData);

const sourceInfo = {
  sourceType: 'skill' as const,
  sourceId: 'skill-1',
  sourceCharacterId: 'atk-1',
  sourceCharacterName: '攻擊者',
  sourceName: '測試技能',
};

const statChange = {
  targetStat: 'HP',
  deltaValue: -10,
  deltaMax: undefined,
  statChangeTarget: 'value' as const,
  syncValue: false,
};

describe('buildTemporaryEffectRecord（pure builder）', () => {
  it('產生完整欄位的 TemporaryEffect 記錄', () => {
    const record = buildTemporaryEffectRecord(sourceInfo, statChange, 60);

    expect(record).toMatchObject({
      sourceType: 'skill',
      sourceId: 'skill-1',
      sourceCharacterId: 'atk-1',
      sourceCharacterName: '攻擊者',
      sourceName: '測試技能',
      effectType: 'stat_change',
      targetStat: 'HP',
      deltaValue: -10,
      statChangeTarget: 'value',
      duration: 60,
      isExpired: false,
    });
    expect(record.id).toMatch(/^teff-/);
  });

  it('expiresAt = appliedAt + duration 秒', () => {
    const record = buildTemporaryEffectRecord(sourceInfo, statChange, 120);

    expect(new Date(record.expiresAt).getTime() - new Date(record.appliedAt).getTime()).toBe(120 * 1000);
  });

  it('每次產生唯一 id', () => {
    const a = buildTemporaryEffectRecord(sourceInfo, statChange, 60);
    const b = buildTemporaryEffectRecord(sourceInfo, statChange, 60);

    expect(a.id).not.toBe(b.id);
  });
});

describe('createTemporaryEffectRecord（舊介面：build + 獨立 $push）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue(undefined);
  });

  it('以 $push 寫入目標角色的 temporaryEffects 並回傳記錄', async () => {
    const record = await createTemporaryEffectRecord('target-1', sourceInfo, statChange, 60);

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [characterId, updates] = updateMock.mock.calls[0];
    expect(characterId).toBe('target-1');
    expect(updates).toEqual({ $push: { temporaryEffects: record } });
    expect(record.targetStat).toBe('HP');
  });
});
