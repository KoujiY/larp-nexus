/**
 * 目標道具選擇 Dialog
 *
 * 統一處理「選擇目標道具」的 UI，支援兩種場景：
 *
 * 1. contest（對抗檢定後）
 *    - 分歧 2：攻擊方獲勝，效果為偷竊/移除道具
 *    - 分歧 5：防守方獲勝，防守方使用的道具/技能效果為偷竊/移除道具
 *    - 使用 selectTargetItemForContest server action
 *
 * 2. post-use（非對抗使用成功後）
 *    - 道具/技能使用成功，server 回傳 needsTargetItemSelection
 *    - 使用 selectTargetItemAfterUse server action
 *
 * 視覺風格：Ethereal Manuscript Glass Panel
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trophy, Package, Loader2 } from 'lucide-react';
import { notify } from '@/lib/notify';
import { selectTargetItemForContest } from '@/app/actions/contest-select-item';
import { selectTargetItemAfterUse } from '@/app/actions/select-target-item';
import { getTargetCharacterItems, type TargetItemInfo } from '@/app/actions/public';

// ── Contest 模式 Props ──────────────────────────────────────

interface ContestModeProps {
  mode: 'contest';
  contestId: string;
  characterId: string;
  defenderId: string;
  sourceType: 'skill' | 'item';
  sourceId: string;
}

// ── Post-use 模式 Props ─────────────────────────────────────

interface PostUseModeProps {
  mode: 'post-use';
  characterId: string;
  targetCharacterId: string;
  sourceType: 'skill' | 'item';
  sourceId: string;
  effectType: 'item_steal' | 'item_take';
}

// ── 共用 Props ──────────────────────────────────────────────

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectionComplete: () => void;
}

export type TargetItemSelectionDialogProps = BaseProps & (ContestModeProps | PostUseModeProps);

export function TargetItemSelectionDialog(props: TargetItemSelectionDialogProps) {
  const { open, onOpenChange, onSelectionComplete, mode } = props;

  const [targetItems, setTargetItems] = useState<TargetItemInfo[]>([]);
  const [selectedTargetItemId, setSelectedTargetItemId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  // 決定要載入哪個角色的道具
  const targetId = mode === 'contest' ? props.defenderId : props.targetCharacterId;

  // 鎖定背景滾動
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // 載入目標角色的道具清單
  useEffect(() => {
    if (open && targetId) {
      setIsLoading(true);
      getTargetCharacterItems(targetId)
        .then((result) => {
          if (result.success && result.data) {
            setTargetItems(result.data);
          } else {
            setTargetItems([]);
          }
        })
        .catch((error) => {
          console.error('載入目標道具清單錯誤:', error);
          setTargetItems([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, targetId]);

  // 當 dialog 關閉時重置狀態
  useEffect(() => {
    if (!open) {
      setSelectedTargetItemId('');
      setTargetItems([]);
    }
  }, [open]);

  /** 完成後的共用收尾 */
  const finalize = useCallback(() => {
    onSelectionComplete();
    onOpenChange(false);
  }, [onSelectionComplete, onOpenChange]);

  /** 執行 contest 模式的 server action */
  const executeContestAction = useCallback(async (itemId: string) => {
    if (mode !== 'contest') return;
    const result = await selectTargetItemForContest(
      props.contestId,
      props.characterId,
      itemId,
      props.defenderId,
      props.sourceId,
      props.sourceType,
    );
    if (!result.success) {
      notify.error(result.message || '選擇目標道具失敗');
      return false;
    }
    return true;
  }, [mode, props]);

  /** 執行 post-use 模式的 server action */
  const executePostUseAction = useCallback(async (itemId: string) => {
    if (mode !== 'post-use') return;
    const result = await selectTargetItemAfterUse(
      props.characterId,
      props.sourceId,
      props.sourceType,
      props.effectType,
      props.targetCharacterId,
      itemId,
    );
    if (!result.success) {
      notify.error(result.message || '操作失敗');
      return false;
    }
    return true;
  }, [mode, props]);

  /** 確認選擇道具 */
  const handleConfirm = async () => {
    if (isSelecting) return;

    // 有選擇道具 → 執行選擇
    if (selectedTargetItemId) {
      setIsSelecting(true);
      try {
        const success = mode === 'contest'
          ? await executeContestAction(selectedTargetItemId)
          : await executePostUseAction(selectedTargetItemId);
        if (success) finalize();
      } catch (error) {
        console.error('選擇目標道具錯誤:', error);
        notify.error('選擇目標道具時發生錯誤');
      } finally {
        setIsSelecting(false);
      }
      return;
    }

    // 目標沒有道具 → 執行延遲效果（stat_change 等）
    if (targetItems.length === 0) {
      setIsSelecting(true);
      try {
        const success = mode === 'contest'
          ? await executeContestAction('')
          : await executePostUseAction('');
        if (success) finalize();
      } catch (error) {
        console.error('執行效果失敗:', error);
        notify.error('執行效果時發生錯誤');
      } finally {
        setIsSelecting(false);
      }
      return;
    }

    // 有道具但沒選 → 提示
    notify.warning('請選擇目標道具');
  };

  /** 放棄獲取 */
  const handleSkip = async () => {
    if (isSkipping || isSelecting) return;
    setIsSkipping(true);
    try {
      if (mode === 'contest') {
        await executeContestAction('');
      } else {
        await executePostUseAction('');
      }
    } catch (error) {
      console.error('放棄獲取時執行效果失敗:', error);
    }
    finalize();
    setIsSkipping(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      {/* Dialog 容器 — Glass Panel */}
      <div
        className="relative w-full max-w-lg rounded-4xl border border-primary/15 shadow-2xl flex flex-col max-h-[80vh] overflow-hidden bg-background/85 backdrop-blur-[20px]"
        style={{ boxShadow: '0 0 40px rgba(254,197,106,0.1)' }}
        role="dialog"
        aria-modal="true"
        aria-label="選擇目標道具"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <header className="pt-8 pb-4 px-8 text-center flex flex-col items-center shrink-0">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 border border-primary/30">
            <Trophy className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-primary mb-1">
            {mode === 'contest' ? '對抗檢定成功' : '使用成功'}
          </h1>
          <p className="text-muted-foreground text-sm font-medium">
            請選擇要獲取的目標道具
          </p>
        </header>

        {/* ── 道具列表（可滾動） ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/40 [&::-webkit-scrollbar-thumb]:rounded-full">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">載入道具清單中...</p>
            </div>
          ) : targetItems.length > 0 ? (
            <div className="space-y-3 pb-4">
              {targetItems.map((item) => {
                const isSelected = selectedTargetItemId === item.id;
                return (
                  <label
                    key={item.id}
                    className={`relative flex items-center p-4 rounded-xl cursor-pointer transition-all duration-300 group ${
                      isSelected
                        ? 'bg-linear-to-br from-primary/30 to-primary/20 border border-primary'
                        : 'bg-surface-base border border-transparent hover:border-primary/15'
                    }`}
                    style={isSelected ? { boxShadow: '0 0 15px rgba(254,197,106,0.15)' } : undefined}
                  >
                    <input
                      type="radio"
                      name="target_item"
                      value={item.id}
                      checked={isSelected}
                      onChange={() => setSelectedTargetItemId(item.id)}
                      className="hidden"
                    />
                    {/* 自訂 Radio 圓圈 */}
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-4 shrink-0 transition-colors ${
                      isSelected ? 'border-primary' : 'border-muted-foreground/40 group-hover:border-primary/50'
                    }`}>
                      <div className={`w-3 h-3 rounded-full bg-primary transition-transform ${
                        isSelected ? 'scale-100' : 'scale-0'
                      }`} />
                    </div>
                    <span className={`font-medium tracking-wide ${
                      isSelected ? 'text-primary' : 'text-foreground'
                    }`}>
                      {item.name}
                      {item.quantity > 1 && (
                        <span className="text-muted-foreground ml-1 text-sm">
                          (x{item.quantity})
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            /* ── 空狀態：目標無道具 ──────────────────────────── */
            <div className="py-12 flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-card/30 border border-white/5 flex items-center justify-center">
                <Package className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-foreground font-medium">目標角色沒有道具</p>
              <p className="text-sm text-muted-foreground">
                點擊下方按鈕結束流程
              </p>
            </div>
          )}
        </div>

        {/* ── Footer（固定底部） ───────────────────────────────── */}
        <footer className="p-8 space-y-3 bg-surface-base/80 backdrop-blur-[20px] border-t border-primary/5 shrink-0">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSelecting || isSkipping || (targetItems.length > 0 && !selectedTargetItemId)}
            className="w-full py-4 rounded-xl font-extrabold text-base tracking-wide flex items-center justify-center gap-2 bg-linear-to-r from-primary to-primary/80 text-primary-foreground transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ boxShadow: '0 4px 15px rgba(254,197,106,0.3)' }}
          >
            {isSelecting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                處理中...
              </>
            ) : targetItems.length === 0 ? (
              '確認'
            ) : (
              '確認選擇'
            )}
          </button>
          {targetItems.length > 0 && (
            <button
              type="button"
              onClick={handleSkip}
              disabled={isSkipping || isSelecting}
              className="w-full py-3 rounded-xl font-semibold text-sm tracking-wide text-muted-foreground bg-transparent border border-primary/15 transition-colors hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSkipping ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  處理中...
                </>
              ) : (
                '放棄獲取'
              )}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
