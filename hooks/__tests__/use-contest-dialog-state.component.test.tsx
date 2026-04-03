/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useContestDialogState } from '../use-contest-dialog-state';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHARACTER_ID = 'char-test-001';
const STORAGE_KEY = `contest-dialog-${CHARACTER_ID}`;

function storedState(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'attacker_waiting',
    contestId: 'contest-1',
    sourceType: 'skill',
    sourceId: 'skill-1',
    timestamp: Date.now(),
    ...overrides,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useContestDialogState', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // ── 初始狀態 ──────────────────────────────────────────────────────────────

  it('無 localStorage 時初始為 null', () => {
    const { result } = renderHook(() => useContestDialogState(CHARACTER_ID));
    expect(result.current.dialogState).toBeNull();
  });

  it('從 localStorage 恢復未過期狀態', () => {
    localStorage.setItem(STORAGE_KEY, storedState());

    const { result } = renderHook(() => useContestDialogState(CHARACTER_ID));
    expect(result.current.dialogState).not.toBeNull();
    expect(result.current.dialogState?.type).toBe('attacker_waiting');
    expect(result.current.dialogState?.contestId).toBe('contest-1');
  });

  it('過期狀態（>3 分鐘）不恢復，並清除 localStorage', () => {
    const expired = Date.now() - 200_000; // 200 秒前
    localStorage.setItem(STORAGE_KEY, storedState({ timestamp: expired }));

    const { result } = renderHook(() => useContestDialogState(CHARACTER_ID));
    expect(result.current.dialogState).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  // ── 設置 Dialog 狀態 ─────────────────────────────────────────────────────

  it('setAttackerWaitingDialog 設置攻擊方等待狀態', () => {
    const { result } = renderHook(() => useContestDialogState(CHARACTER_ID));

    act(() => {
      result.current.setAttackerWaitingDialog('contest-2', 'skill', 'skill-2', {
        attackerValue: 10,
        defenderName: '守護者',
        sourceName: '火球術',
        checkType: 'contest',
        relatedStat: 'attack',
      });
    });

    expect(result.current.dialogState?.type).toBe('attacker_waiting');
    expect(result.current.dialogState?.contestId).toBe('contest-2');
    expect(result.current.dialogState?.waitingDisplayData?.attackerValue).toBe(10);
    expect(result.current.dialogState?.waitingDisplayData?.defenderName).toBe('守護者');
  });

  it('setDefenderResponseDialog 設置防守方回應狀態', () => {
    const { result } = renderHook(() => useContestDialogState(CHARACTER_ID));

    act(() => {
      result.current.setDefenderResponseDialog('contest-3', 'item', 'item-1');
    });

    expect(result.current.dialogState?.type).toBe('defender_response');
    expect(result.current.dialogState?.sourceType).toBe('item');
    expect(result.current.dialogState?.sourceId).toBe('item-1');
  });

  it('setTargetItemSelectionDialog 設置目標道具選擇狀態', () => {
    const { result } = renderHook(() => useContestDialogState(CHARACTER_ID));

    act(() => {
      result.current.setTargetItemSelectionDialog('contest-4', 'skill', 'skill-3', 'target-char-1');
    });

    expect(result.current.dialogState?.type).toBe('target_item_selection');
    expect(result.current.dialogState?.targetCharacterId).toBe('target-char-1');
  });

  // ── 清除 ──────────────────────────────────────────────────────────────────

  it('clearDialogState 清除狀態和 localStorage', () => {
    localStorage.setItem(STORAGE_KEY, storedState());

    const { result } = renderHook(() => useContestDialogState(CHARACTER_ID));
    expect(result.current.dialogState).not.toBeNull();

    act(() => {
      result.current.clearDialogState();
    });

    expect(result.current.dialogState).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  // ── 查詢方法 ──────────────────────────────────────────────────────────────

  it('hasDialogType 正確判斷 Dialog 類型', () => {
    const { result } = renderHook(() => useContestDialogState(CHARACTER_ID));

    expect(result.current.hasDialogType('attacker_waiting')).toBe(false);

    act(() => {
      result.current.setAttackerWaitingDialog('c1', 'skill', 's1');
    });

    expect(result.current.hasDialogType('attacker_waiting')).toBe(true);
    expect(result.current.hasDialogType('defender_response')).toBe(false);
  });

  it('isDialogForSource 正確判斷來源', () => {
    const { result } = renderHook(() => useContestDialogState(CHARACTER_ID));

    act(() => {
      result.current.setDefenderResponseDialog('c1', 'skill', 'skill-99');
    });

    expect(result.current.isDialogForSource('skill-99')).toBe(true);
    expect(result.current.isDialogForSource('skill-99', 'skill')).toBe(true);
    expect(result.current.isDialogForSource('skill-99', 'item')).toBe(false);
    expect(result.current.isDialogForSource('other-id')).toBe(false);
  });

  it('isDialogForSource 無狀態時回傳 false', () => {
    const { result } = renderHook(() => useContestDialogState(CHARACTER_ID));
    expect(result.current.isDialogForSource('any-id')).toBe(false);
  });

  // ── localStorage 持久化 ───────────────────────────────────────────────────

  it('設置狀態後自動寫入 localStorage', async () => {
    const { result } = renderHook(() => useContestDialogState(CHARACTER_ID));

    // 初始 mount 的 useEffect 會透過 customEvent 設置 isSyncingRef=true，
    // 導致第一次 state change 的持久化被跳過。需要先消耗掉這個 flag。
    await act(async () => {
      result.current.setAttackerWaitingDialog('c-init', 'skill', 'skill-0');
    });

    // 第二次設置：isSyncingRef 已重置為 false，持久化正常運作
    await act(async () => {
      result.current.setAttackerWaitingDialog('c-persist', 'item', 'item-2');
    });

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.contestId).toBe('c-persist');
    expect(parsed.sourceType).toBe('item');
  });

  // ── 不同角色隔離 ─────────────────────────────────────────────────────────

  it('不同 characterId 使用不同 storageKey', () => {
    localStorage.setItem('contest-dialog-char-A', storedState({ contestId: 'A-contest' }));
    localStorage.setItem('contest-dialog-char-B', storedState({ contestId: 'B-contest' }));

    const { result: resultA } = renderHook(() => useContestDialogState('char-A'));
    const { result: resultB } = renderHook(() => useContestDialogState('char-B'));

    expect(resultA.current.dialogState?.contestId).toBe('A-contest');
    expect(resultB.current.dialogState?.contestId).toBe('B-contest');
  });
});
