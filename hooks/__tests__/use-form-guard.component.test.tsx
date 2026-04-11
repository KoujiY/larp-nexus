/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useFormGuard } from '../use-form-guard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type FormData = { name: string; value: number };

const initial: FormData = { name: 'Alice', value: 10 };

function renderFormGuard(overrides: Record<string, unknown> = {}) {
  const props = {
    initialData: initial,
    currentData: initial,
    ...overrides,
  };
  return renderHook(
    ({ initialData, currentData, enabled, compareFn }) =>
      useFormGuard({ initialData, currentData, enabled, compareFn }),
    { initialProps: props as Parameters<typeof useFormGuard<FormData>>[0] },
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useFormGuard', () => {
  afterEach(() => {
    cleanup();
  });

  // ── isDirty 判斷 ─────────────────────────────────────────────────────────

  it('初始狀態（資料相同）→ isDirty = false', () => {
    const { result } = renderFormGuard();
    expect(result.current.isDirty).toBe(false);
  });

  it('currentData 改變 → isDirty = true', () => {
    const { result } = renderFormGuard({
      currentData: { name: 'Bob', value: 10 },
    });
    expect(result.current.isDirty).toBe(true);
  });

  it('currentData 改回初始值 → isDirty = false', () => {
    const { result, rerender } = renderFormGuard({
      currentData: { name: 'Bob', value: 10 },
    });
    expect(result.current.isDirty).toBe(true);

    rerender({
      initialData: initial,
      currentData: initial,
    });
    expect(result.current.isDirty).toBe(false);
  });

  // ── enabled 控制 ─────────────────────────────────────────────────────────

  it('enabled = false → isDirty 始終為 false', () => {
    const { result } = renderFormGuard({
      currentData: { name: 'Changed', value: 99 },
      enabled: false,
    });
    expect(result.current.isDirty).toBe(false);
  });

  // ── manualDirty（markDirty / resetDirty）───────────────────────────────

  it('markDirty 強制設定 dirty', () => {
    const { result } = renderFormGuard();
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.markDirty();
    });
    expect(result.current.isDirty).toBe(true);
  });

  it('resetDirty 清除手動 dirty', () => {
    const { result } = renderFormGuard();

    act(() => {
      result.current.markDirty();
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.resetDirty();
    });
    expect(result.current.isDirty).toBe(false);
  });

  it('resetDirty 不影響資料比較的 dirty', () => {
    const { result } = renderFormGuard({
      currentData: { name: 'Changed', value: 10 },
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.resetDirty();
    });
    // 資料仍然不同 → isDirty 仍為 true
    expect(result.current.isDirty).toBe(true);
  });

  // ── initialData 更新時自動重置 ────────────────────────────────────────

  it('initialData 從 server 更新 → 自動重置 manualDirty', () => {
    const { result, rerender } = renderFormGuard();

    act(() => {
      result.current.markDirty();
    });
    expect(result.current.isDirty).toBe(true);

    // 模擬 server 回傳新資料（router.refresh 後 props 改變）
    const newData = { name: 'Updated', value: 20 };
    rerender({
      initialData: newData,
      currentData: newData,
    });
    expect(result.current.isDirty).toBe(false);
  });

  // ── 自訂比較函數 ──────────────────────────────────────────────────────

  it('自訂 compareFn 用於特殊比較邏輯', () => {
    // 只比較 name，忽略 value
    const nameOnlyCompare = (a: FormData, b: FormData) => a.name === b.name;

    const { result } = renderFormGuard({
      currentData: { name: 'Alice', value: 999 },
      compareFn: nameOnlyCompare,
    });
    // name 相同 → isDirty = false（即使 value 不同）
    expect(result.current.isDirty).toBe(false);
  });

  it('自訂 compareFn 偵測到不同 → isDirty = true', () => {
    const nameOnlyCompare = (a: FormData, b: FormData) => a.name === b.name;

    const { result } = renderFormGuard({
      currentData: { name: 'Bob', value: 10 },
      compareFn: nameOnlyCompare,
    });
    expect(result.current.isDirty).toBe(true);
  });

  // ── 導航保護（beforeunload / pushState）────────────────────────────────

  it('isDirty 時攔截 history.pushState', () => {
    // Mock window.confirm
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { result } = renderFormGuard({
      currentData: { name: 'Changed', value: 10 },
    });
    expect(result.current.isDirty).toBe(true);

    // pushState 應觸發 confirm
    history.pushState(null, '', '/other');
    expect(confirmSpy).toHaveBeenCalledWith('你有未儲存的變更，確定要離開嗎？');

    confirmSpy.mockRestore();
    // cleanup 會觸發 deactivateNavigationGuard 恢復 pushState
  });

  it('isDirty = false 時不攔截 pushState', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');

    renderFormGuard();

    // pushState 不應觸發 confirm
    history.pushState(null, '', '/other');
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
