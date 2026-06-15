/**
 * @vitest-environment jsdom
 *
 * useItemTransfer sharedTargets 測試（perf 去重 case B）
 *
 * 契約：fallback 開啟 ItemSelectDialog 時，改用呼叫端提供的 sharedTargets，
 * 不再自行呼叫 getTransferTargets（item-list 已抓過同一份目標清單）。
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useItemTransfer } from '../use-item-transfer';
import type { TransferTargetCharacter } from '@/app/actions/public';
import type { Item } from '@/types/character';

const { getTransferTargetsMock } = vi.hoisted(() => ({ getTransferTargetsMock: vi.fn() }));
vi.mock('@/app/actions/public', () => ({ getTransferTargets: getTransferTargetsMock }));

const sharedTargets: TransferTargetCharacter[] = [
  { id: 't1', name: '角色B', imageUrl: undefined },
];
const transferableItem = { id: 'i1', name: '寶劍', isTransferable: true } as unknown as Item;

beforeEach(() => {
  getTransferTargetsMock.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useItemTransfer sharedTargets', () => {
  it('fallback 開啟對話框時使用 sharedTargets，不呼叫 getTransferTargets', async () => {
    const { result } = renderHook(() =>
      useItemTransfer({
        characterId: 'c1',
        gameId: 'g1',
        selectedItem: transferableItem,
        selectedUseTargetId: undefined,
        onTransferItem: vi.fn(),
        onTransferComplete: vi.fn(),
        sharedTargets,
      }),
    );

    await act(async () => {
      await result.current.handleOpen();
    });

    expect(result.current.targets).toEqual(sharedTargets);
    expect(result.current.isOpen).toBe(true);
    expect(getTransferTargetsMock).not.toHaveBeenCalled();
  });
});
