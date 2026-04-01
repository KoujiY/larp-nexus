'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import type {
  CharacterTabKey,
  TabDirtyInfo,
  CharacterDirtyState,
} from '@/types/gm-edit';
import { EMPTY_DIRTY_INFO } from '@/types/gm-edit';

/** 各 Tab 的 save handler 型別 */
type TabSaveHandler = () => Promise<void>;

/** 各 Tab 的 discard handler 型別 */
type TabDiscardHandler = () => void;

/**
 * useCharacterEditState — 管理角色編輯頁 7 個 Tab 的跨 Tab dirty state
 *
 * 取代舊的 `dirtyTabs: Record<string, boolean>` + `window.confirm` 機制。
 * 提供統一的 dirty 資訊回報、全部儲存、全部捨棄 API。
 *
 * @example
 * ```tsx
 * const {
 *   dirtyState, hasDirty, dirtyTabCount,
 *   registerDirty, registerSaveHandler, registerDiscardHandler,
 *   saveAll, discardAll,
 * } = useCharacterEditState();
 *
 * // 各 Tab 元件內呼叫
 * registerDirty('items', { isDirty: true, added: 2, modified: 1, deleted: 0 });
 * registerSaveHandler('items', async () => { ... });
 * registerDiscardHandler('items', () => { ... });
 * ```
 */
export function useCharacterEditState() {
  const [dirtyState, setDirtyState] = useState<CharacterDirtyState>(() => ({
    basic: EMPTY_DIRTY_INFO,
    background: EMPTY_DIRTY_INFO,
    secrets: EMPTY_DIRTY_INFO,
    stats: EMPTY_DIRTY_INFO,
    tasks: EMPTY_DIRTY_INFO,
    items: EMPTY_DIRTY_INFO,
    skills: EMPTY_DIRTY_INFO,
  }));

  const [saveHandlers] = useState<Map<CharacterTabKey, TabSaveHandler>>(
    () => new Map()
  );
  const [discardHandlers] = useState<Map<CharacterTabKey, TabDiscardHandler>>(
    () => new Map()
  );
  const [isSaving, setIsSaving] = useState(false);

  /** 某 Tab 回報 dirty 資訊 */
  const registerDirty = useCallback(
    (tabKey: CharacterTabKey, info: TabDirtyInfo) => {
      setDirtyState((prev) => {
        const current = prev[tabKey];
        // 避免不必要的 re-render
        if (
          current.isDirty === info.isDirty &&
          current.added === info.added &&
          current.modified === info.modified &&
          current.deleted === info.deleted
        ) {
          return prev;
        }
        return { ...prev, [tabKey]: info };
      });
    },
    []
  );

  /** 某 Tab 註冊 save handler */
  const registerSaveHandler = useCallback(
    (tabKey: CharacterTabKey, handler: TabSaveHandler) => {
      saveHandlers.set(tabKey, handler);
    },
    [saveHandlers]
  );

  /** 某 Tab 註冊 discard handler */
  const registerDiscardHandler = useCallback(
    (tabKey: CharacterTabKey, handler: TabDiscardHandler) => {
      discardHandlers.set(tabKey, handler);
    },
    [discardHandlers]
  );

  /** 是否有任何 Tab dirty */
  const hasDirty = useMemo(
    () => Object.values(dirtyState).some((info) => info.isDirty),
    [dirtyState]
  );

  /** dirty Tab 數量 */
  const dirtyTabCount = useMemo(
    () => Object.values(dirtyState).filter((info) => info.isDirty).length,
    [dirtyState]
  );

  /** dirty Tab 的 key 列表 */
  const dirtyTabKeys = useMemo(
    () =>
      (Object.entries(dirtyState) as [CharacterTabKey, TabDirtyInfo][])
        .filter(([, info]) => info.isDirty)
        .map(([key]) => key),
    [dirtyState]
  );

  /** 全部儲存：依序呼叫所有 dirty Tab 的 save handler */
  const saveAll = useCallback(async () => {
    setIsSaving(true);
    try {
      const promises = dirtyTabKeys.map((key) => {
        const handler = saveHandlers.get(key);
        return handler ? handler() : Promise.resolve();
      });
      await Promise.all(promises);
    } finally {
      setIsSaving(false);
    }
  }, [dirtyTabKeys, saveHandlers]);

  /** 全部捨棄：呼叫所有 Tab 的 discard handler + 重置 dirty state */
  const discardAll = useCallback(() => {
    for (const [, handler] of discardHandlers) {
      handler();
    }
    setDirtyState({
      basic: EMPTY_DIRTY_INFO,
      background: EMPTY_DIRTY_INFO,
      secrets: EMPTY_DIRTY_INFO,
      stats: EMPTY_DIRTY_INFO,
      tasks: EMPTY_DIRTY_INFO,
      items: EMPTY_DIRTY_INFO,
      skills: EMPTY_DIRTY_INFO,
    });
  }, [discardHandlers]);

  // beforeunload 攔截
  useEffect(() => {
    if (!hasDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasDirty]);

  return {
    dirtyState,
    hasDirty,
    dirtyTabCount,
    dirtyTabKeys,
    isSaving,
    registerDirty,
    registerSaveHandler,
    registerDiscardHandler,
    saveAll,
    discardAll,
  };
}
