/**
 * @vitest-environment jsdom
 *
 * useTargetOptions externalTargets 測試（perf 去重 case B）
 *
 * 契約：提供 externalTargets 時，hook 直接使用該清單、不自行呼叫 getTransferTargets，
 * 讓 item-list 的 sharedTargets 成為唯一抓取來源（避免選取道具時重複查同一份目標清單）。
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useTargetOptions } from '../use-target-options';
import type { TransferTargetCharacter } from '@/app/actions/public';

const { getTransferTargetsMock } = vi.hoisted(() => ({ getTransferTargetsMock: vi.fn() }));
vi.mock('@/app/actions/public', () => ({
  getTransferTargets: getTransferTargetsMock,
}));

const external: TransferTargetCharacter[] = [
  { id: 't1', name: '角色B', imageUrl: undefined },
];

beforeEach(() => {
  // 若 hook 仍走舊路徑（自抓），解析為空清單以區分來源
  getTransferTargetsMock.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useTargetOptions externalTargets', () => {
  it('提供 externalTargets 時直接使用，且不呼叫 getTransferTargets', async () => {
    const { result } = renderHook(() =>
      useTargetOptions({
        gameId: 'g1',
        characterId: 'c1',
        characterName: '我',
        requiresTarget: true,
        targetType: 'other',
        enabled: true,
        externalTargets: external,
        externalTargetsLoading: false,
      }),
    );

    await waitFor(() => {
      expect(result.current.targetOptions).toEqual(external);
    });
    expect(getTransferTargetsMock).not.toHaveBeenCalled();
  });

  it('externalTargetsLoading 為 true 時回報 isLoading 且不抓取', async () => {
    const { result } = renderHook(() =>
      useTargetOptions({
        gameId: 'g1',
        characterId: 'c1',
        characterName: '我',
        requiresTarget: true,
        targetType: 'other',
        enabled: true,
        externalTargets: [],
        externalTargetsLoading: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });
    expect(getTransferTargetsMock).not.toHaveBeenCalled();
  });
});
