'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';
import type { Skill, Item, SkillEffect } from '@/types/character';
import { toast } from 'sonner';
import { useTargetSelection } from '@/hooks/use-target-selection';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import type { BaseEvent } from '@/types/event';
import type { SkillContestEvent } from '@/types/event';
import { useContestState } from '@/hooks/use-contest-state';
import { useContestDialogState } from '@/hooks/use-contest-dialog-state';
import { useContestStateRestore } from '@/hooks/use-contest-state-restore';
import { useSkillUsage } from '@/hooks/use-skill-usage';
import { useContestableItemUsage } from '@/hooks/use-contestable-item-usage';
import { usePostUseTargetItemSelection } from '@/hooks/use-post-use-target-item-selection';
import { getTargetCharacterItems } from '@/app/actions/public';
import { CONTEST_TIMEOUT, STORAGE_KEYS } from '@/lib/constants/contest';
import { canUseSkill, getCooldownRemaining } from '@/lib/utils/skill-validators';
import { TargetItemSelectionDialog } from './target-item-selection-dialog';
import type { SkillListProps } from '@/types/skill-list';
import { SkillCard } from './skill-card';
import { SkillDetailDialog } from './skill-detail-dialog';

export function SkillList({ skills, characterId, gameId, characterName, stats = [], randomContestMaxValue = 100, isReadOnly = false }: SkillListProps) {
  // Phase 10.5.4: 唯讀模式下隱藏所有互動按鈕（使用技能）

  const router = useRouter();
  const [localSkills, setLocalSkills] = useState<Skill[]>(skills || []);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [, setTick] = useState(0);
  const [lastToastId, setLastToastId] = useState<string | number | undefined>(undefined);
  
  // Phase 8: 對抗檢定狀態管理
  const { addPendingContest, removePendingContest, hasPendingContest, updateContestDialog, pendingContests } = useContestState(characterId);
  
  // Phase 3: 使用統一的 Dialog 狀態管理
  const { dialogState, clearDialogState, isDialogForSource } = useContestDialogState(characterId);
  
  // Phase 3.2: 使用 useTargetSelection Hook 管理目標選擇
  // Phase 6.5: 目標選擇相關邏輯
  // Phase 7: 對抗檢定類型自動需要目標角色
  const requiresTarget = Boolean(
    selectedSkill?.checkType === 'contest' ||
    selectedSkill?.checkType === 'random_contest' ||
    selectedSkill?.effects?.some((effect: SkillEffect) => effect.requiresTarget)
  );
  const targetType = (selectedSkill?.checkType === 'contest' || selectedSkill?.checkType === 'random_contest')
    ? 'other' // 對抗檢定只能對其他角色使用
    : selectedSkill?.effects?.find((e: SkillEffect) => e.requiresTarget)?.targetType;

  const {
    selectedTargetId,
    setSelectedTargetId,
    targetOptions: targetCharacters,
    isLoading: isLoadingTargets,
    isTargetConfirmed,
    setIsTargetConfirmed,
    targetItems,
    setTargetItems,
    selectedTargetItemId,
    setSelectedTargetItemId,
    isLoadingTargetItems,
    setIsLoadingTargetItems,
    clearTargetState,
    saveTargetState,
    restoreTargetState,
  } = useTargetSelection({
    characterId,
    sourceId: selectedSkill?.id || '',
    sourceType: 'skill',
    gameId,
    characterName,
    requiresTarget,
    targetType,
    enabled: !!selectedSkill,
    effects: selectedSkill?.effects || [],
    selectedSource: selectedSkill,
  });

  // Phase 4: 從統一 Dialog 狀態恢復攻擊方等待 Dialog（重新整理後）
  useEffect(() => {
    if (!dialogState || !skills) return;
    
    // 如果是攻擊方等待狀態，且來源類型是技能
    if (dialogState.type === 'attacker_waiting' && dialogState.sourceType === 'skill') {
      const skill = skills.find((s) => s.id === dialogState.sourceId);
      if (skill && !selectedSkill) {
        // 設置選中的技能，這會自動打開 dialog
        setSelectedSkill(skill);
        
        // 設置等待狀態訊息，讓技能 dialog 顯示等待狀態
        setUseResult({
          success: true,
          message: '對抗檢定請求已發送，等待防守方回應...',
        });
        
        // 確保 pendingContests 中有對應的記錄
        if (pendingContests[dialogState.sourceId]) {
          updateContestDialog(dialogState.sourceId, false);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogState, skills, selectedSkill, pendingContests, updateContestDialog]);

  // 追蹤之前的 pendingContests 狀態，用於檢測對抗檢定是否被移除
  const prevPendingContestsRef = useRef<typeof pendingContests>({});

  // 追蹤是否正在關閉 dialog，避免重複處理導致無限循環
  const isClosingDialogRef = useRef<string | null>(null);
  
  // 追蹤正在等待回應的 contest（同步標記，用於 handleCloseDialog 檢查）
  const waitingContestRef = useRef<Set<string>>(new Set());
  
  // 當 selectedSkill 變為 null 時，清除關閉標記
  useEffect(() => {
    if (!selectedSkill && isClosingDialogRef.current) {
      isClosingDialogRef.current = null;
    }
  }, [selectedSkill]);

  // Phase 4.2: 使用 useContestStateRestore Hook 管理對抗檢定狀態恢復
  // 清除目標狀態的回調
  // 注意：setCheckResult 將在 useSkillUsage Hook 之後定義
  const handleClearTargetStateBase = useCallback(() => {
    setSelectedTargetId(undefined);
    setIsTargetConfirmed(false);
    setSelectedTargetItemId('');
    // Phase 3.2: targetItems 由 hook 管理，不需要手動清除
    // 同時清除 localStorage，避免下次開啟 dialog 時恢復舊狀態
    clearTargetState();
  }, [setSelectedTargetId, setIsTargetConfirmed, setSelectedTargetItemId, clearTargetState]);

  // 顯示 toast 的回調
  const handleToastShow = useCallback((message: string, options?: { duration?: number }) => {
    const toastId = toast.info(message, {
      duration: options?.duration || 5000,
    });
    setLastToastId(toastId);
    return toastId;
  }, []);

  // Phase 6.4: 使用 ref 存儲 handleCloseDialog，以便在回調中使用
  const handleCloseDialogRef = useRef<(() => void) | null>(null);

  // 非對抗偷竊/移除：使用成功後的目標道具選擇
  const postUseSelection = usePostUseTargetItemSelection({
    onComplete: () => {
      // 直接關閉 dialog，不經過 handleCloseDialog（因為 React batched state 導致
      // postUseSelection.selectionState 尚未清除，handleCloseDialog 的 protection check 會擋住關閉）
      setSelectedSkill(null);
      setCheckResult(undefined);
      setUseResult(null);
      setSelectedTargetId(undefined);
      setIsTargetConfirmed(false);
      setSelectedTargetItemId('');
    },
    onRouterRefresh: () => router.refresh(),
  });

  // 包裝 setSelectedSkill 以符合 hook 的類型要求
  const handleItemSelected = useCallback((item: Skill | Item | null) => {
    // 如果嘗試關閉 dialog（item 為 null），但正在進行對抗檢定或目標道具選擇，則不關閉
    if (!item && selectedSkill) {
      const hasPending = hasPendingContest(selectedSkill.id);
      const isAttackerWaiting = dialogState?.type === 'attacker_waiting' &&
                                dialogState.sourceType === 'skill' &&
                                dialogState.sourceId === selectedSkill.id;
      const isWaitingInRef = waitingContestRef.current.has(selectedSkill.id);
      const isPostUseSelecting = postUseSelection.selectionState?.sourceId === selectedSkill.id;

      if (hasPending || isAttackerWaiting || isWaitingInRef || isPostUseSelecting) {
        return; // 不關閉 dialog
      }
    }
    setSelectedSkill(item as Skill | null);
  }, [selectedSkill, hasPendingContest, dialogState, postUseSelection.selectionState?.sourceId]);

  // dismissLastToast 回調
  const dismissLastToast = useCallback(() => {
    if (lastToastId !== undefined) {
      toast.dismiss(lastToastId);
      setLastToastId(undefined);
    }
  }, [lastToastId]);

  // Phase 8.2: 使用 ref 存儲 handleContestStarted，以便在 onSuccess 回調中使用
  const handleContestStartedRef = useRef<((contestId: string, message?: string) => void) | null>(null);

  // Phase 6.2: 使用 useSkillUsage Hook 管理技能使用
  const {
    isUsing,
    checkResult,
    useResult,
    handleUseSkill,
    setUseResult,
    setCheckResult,
  } = useSkillUsage({
    characterId,
    selectedSkill,
    selectedTargetId,
    selectedTargetItemId,
    onSuccess: (result) => {
      // Phase 8.2: 使用統一的對抗檢定處理邏輯
      if (result.data?.contestId && selectedSkill && handleContestStartedRef.current) {
        // 立即標記正在等待回應（同步標記，用於 handleCloseDialog 檢查）
        waitingContestRef.current.add(selectedSkill.id);
        handleContestStartedRef.current(result.data.contestId, result.message);
        // 不關閉 dialog，讓用戶看到等待狀態
      }
    },
    onUpdateLocalSkills: (skillId, updates) => {
      setLocalSkills(prevSkills => prevSkills.map(skill => {
        if (skill.id === skillId) {
          return {
            ...skill,
            ...updates,
          };
        }
        return skill;
      }));
    },
    onUpdateSelectedSkill: (updates) => {
      if (selectedSkill) {
        setSelectedSkill({
          ...selectedSkill,
          ...updates,
        });
      }
    },
    onClearTargetState: () => {
      handleClearTargetStateBase();
      setCheckResult(undefined);
    },
    onRouterRefresh: () => router.refresh(),
    onNeedsTargetItemSelection: (info) => {
      // 非對抗偷竊/移除：使用成功後觸發目標道具選擇流程
      postUseSelection.startSelection({
        ...info,
        sourceType: 'skill',
        characterId,
      });
    },
  });

  // Phase 8.2: 使用 useContestableItemUsage Hook（需要在 useSkillUsage 之後，因為需要 setUseResult）
  const { handleContestStarted } = useContestableItemUsage({
    characterId,
    sourceType: 'skill',
    sourceId: selectedSkill?.id || '',
    selectedTargetId,
    setUseResult,
    setLastToastId,
  });

  // Phase 8.2: 更新 ref，確保 handleContestStarted 可以在 onSuccess 回調中使用
  useEffect(() => {
    handleContestStartedRef.current = handleContestStarted;
  }, [handleContestStarted]);

  // Phase 6.2: 創建完整的 handleClearTargetState，包含清除 checkResult
  const handleClearTargetState = useCallback(() => {
    handleClearTargetStateBase();
    setCheckResult(undefined);
  }, [handleClearTargetStateBase, setCheckResult]);

  // Phase 9: 目標道具選擇 dialog 狀態
  const [targetItemSelectionDialog, setTargetItemSelectionDialogState] = useState<{
    open: boolean;
    contestId: string;
    defenderId: string;
    sourceId: string;
  } | null>(null);

  useContestStateRestore({
    characterId,
    sourceType: 'skill',
    pendingContests,
    items: skills || [],
    selectedItem: selectedSkill,
    hasPendingContest,
    removePendingContest,
    updateContestDialog,
    onItemSelected: handleItemSelected,
    onUseResultSet: setUseResult, // Phase 6.2: 使用 useSkillUsage Hook 的 setUseResult
    onToastShow: handleToastShow,
    onClearDialog: clearDialogState,
    isDialogForSource,
    onClearTargetState: handleClearTargetState,
    isClosingDialogRef,
    dialogState,
  });

  // 當 skills prop 更新時，同步更新本地狀態
  useEffect(() => {
    if (skills) {
      setLocalSkills(skills);
      // 如果當前選中的技能有更新，也要更新
      if (selectedSkill) {
        const updatedSkill = skills.find((s) => s.id === selectedSkill.id);
        if (updatedSkill) {
          setSelectedSkill(updatedSkill);
        }
      }
    }
  }, [skills, selectedSkill]);

  // Phase 3.2: 當選擇技能時，恢復目標選擇狀態
  // useTargetSelection hook 內部會處理恢復邏輯，這裡只需要在適當的時機調用
  useEffect(() => {
    if (selectedSkill && !isLoadingTargets && targetCharacters.length > 0) {
      // 延遲恢復，確保 useTargetOptions 已經載入完成
      const timer = setTimeout(() => {
        restoreTargetState();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedSkill?.id, isLoadingTargets, targetCharacters.length, restoreTargetState, selectedSkill]);

  // Phase 3.2: 當目標選擇狀態變化時，儲存到 localStorage
  useEffect(() => {
    if (selectedSkill && (selectedTargetId || isTargetConfirmed || selectedTargetItemId)) {
      saveTargetState();
    }
  }, [selectedSkill?.id, selectedTargetId, isTargetConfirmed, selectedTargetItemId, selectedSkill, saveTargetState]);
  
  // Phase 7: 當選擇目標角色時，檢查是否需要載入目標道具清單
  useEffect(() => {
    const effect = selectedSkill?.effects?.find((e: SkillEffect) => e.type === 'item_take' || e.type === 'item_steal');
    
    // 如果效果需要目標道具，且已選擇目標角色，但尚未確認，則重置確認狀態
    if (effect && selectedTargetId && !isTargetConfirmed) {
      setIsTargetConfirmed(false);
      setSelectedTargetItemId('');
      // Phase 3.2: targetItems 由 hook 管理，不需要手動清除
    }
  }, [selectedSkill, selectedTargetId, isTargetConfirmed, setIsTargetConfirmed, setSelectedTargetItemId]);

  // Phase 7: 監聽對抗檢定結果事件，當收到結果時關閉 dialog 並清除狀態
  // 注意：這個監聽只處理攻擊方的結果事件，不會影響防守方的處理
  useCharacterWebSocket(characterId, (event: BaseEvent) => {
    // 只處理 skill.contest 事件，且是攻擊方收到的結果事件
    if (event.type === 'skill.contest') {
      const payload = event.payload as SkillContestEvent['payload'];// 只處理結果事件（attackerValue !== 0），且是攻擊方收到的結果
      // 確保 ID 比較時都轉換為字符串，避免類型不匹配問題
      const characterIdStr = String(characterId);
      const attackerIdStr = String(payload.attackerId);
      const defenderIdStr = String(payload.defenderId);// 注意：防守方的事件（defenderId === characterId）不應該在這裡處理
      if (
        payload.attackerValue !== 0 && 
        attackerIdStr === characterIdStr && 
        defenderIdStr !== characterIdStr &&
        payload.sourceType === 'skill' &&
        payload.skillId
      ) {
        // Phase 9: 如果攻擊方獲勝且需要選擇目標道具，關閉原本的 dialog，開啟新的選擇道具 dialog
        if (payload.result === 'attacker_wins' && payload.needsTargetItemSelection && payload.skillId) {
          const skillId = payload.skillId;

          import('@/lib/contest/contest-id').then(({ generateContestId }) => {
            const pendingContest = pendingContests[skillId];
            const contestId = pendingContest?.contestId || generateContestId(attackerIdStr, skillId, event.timestamp);
            
            // 關閉原本的技能 dialog
            if (selectedSkill && selectedSkill.id === skillId) {
              handleCloseDialog();
            }
            
            // 開啟新的目標道具選擇 dialog
            setTargetItemSelectionDialogState({
              open: true,
              contestId,
              defenderId: defenderIdStr,
              sourceId: skillId,
            });
            
            // 保持對抗檢定狀態（不從 pendingContests 中移除），直到選擇完目標道具
            if (!hasPendingContest(skillId)) {
              addPendingContest(skillId, 'skill', contestId);
            }
          });
          
          return;
        }
        
        // 修復：不顯示 toast，因為 event-mappers.ts 已經會生成更詳細的「技能使用結果」通知
        // 這樣可以避免重複通知，只保留 event-mappers 生成的詳細通知
        
        // 修復：skill-list.tsx 不應該處理不需要選擇目標道具的結果事件
        // 這些情況應該由 use-contest-handler.ts 統一處理，避免重複處理導致狀態不一致
        // 只有在需要選擇目標道具的情況下，skill-list.tsx 才需要處理（上面的 if 分支已經處理了）
        // 這裡只處理技能 dialog 的關閉邏輯，不處理 pendingContests 的清除
        
        // 清除目標選擇狀態
        clearTargetState();
        
        // Phase 9: 關閉目標道具選擇 dialog（如果有的話）
        if (targetItemSelectionDialog && targetItemSelectionDialog.sourceId === payload.skillId) {
          setTargetItemSelectionDialogState(null);
        }
        
        // 修復：清除 dialogState（localStorage 中的 dialog 狀態），確保 dialog 不會因為 localStorage 中的狀態而重新打開
        // 這必須在關閉 dialog 之前執行，確保狀態一致性
        // 如果 dialog 是打開的，立即關閉它（不使用 setTimeout，確保立即關閉）
        if (payload.skillId && isDialogForSource(payload.skillId, 'skill')) {
          clearDialogState();
        }

        // 修復：先清除 pendingContests，確保狀態一致性，避免 dialog 被重新打開
        // 即使 use-contest-handler.ts 也會調用 removePendingContest，但這裡先清除可以確保 skill-list.tsx 立即看到更新後的狀態
        if (selectedSkill && selectedSkill.id === payload.skillId) {
          if (hasPendingContest(payload.skillId)) {
            removePendingContest(payload.skillId);
          }
          // 清除 ref 中的等待標記
          waitingContestRef.current.delete(payload.skillId);
          handleCloseDialog({ force: true });
        } else {
          // 即使 selectedSkill 不匹配，也要清除 pendingContests，確保狀態一致性
          if (payload.skillId && hasPendingContest(payload.skillId)) {
            removePendingContest(payload.skillId);
          }
          // 清除 ref 中的等待標記
          if (payload.skillId) {
            waitingContestRef.current.delete(payload.skillId);
          }
        }
        
        // 注意：pendingContests 的清除應該由 use-contest-handler.ts 處理，避免重複處理
        // 但為了確保 skill-list.tsx 能立即看到更新後的狀態，這裡也清除一次
        // removePendingContest 內部會處理重複調用的情況（檢查記錄是否存在）
      }
    }
  });

  // 檢查是否有任何技能在冷卻中
  const hasAnyCooldown = skills?.some((skill) => {
    if (!skill.cooldown || skill.cooldown <= 0 || !skill.lastUsedAt) return false;
    const lastUsed = new Date(skill.lastUsedAt).getTime();
    const cooldownMs = skill.cooldown * 1000;
    return Date.now() - lastUsed < cooldownMs;
  });

  // 每秒更新一次（僅當有技能在冷卻中時）
  useEffect(() => {
    if (!hasAnyCooldown) return;
    
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [hasAnyCooldown]);

  /**
   * 關閉技能 Dialog
   * @param options.force 強制關閉，跳過對抗檢定進行中的檢查。
   *   用於 WebSocket handler 已確認對抗檢定結束後呼叫，因為 React 批次更新導致
   *   dialogState / pendingContests 尚未同步到當前 render，guard 會誤判為仍在進行中。
   */
  const handleCloseDialog = useCallback((options?: { force?: boolean }) => {
    dismissLastToast();
    // Phase 8: 清除 dialog 狀態（如果有 pending contest）
    if (selectedSkill) {
      // 標記正在關閉這個 dialog，避免 Restore dialog useEffect 重複處理
      isClosingDialogRef.current = selectedSkill.id;

      if (!options?.force) {
        const hasPending = hasPendingContest(selectedSkill.id);
        // Phase 8: 檢查 dialogState 是否為 attacker_waiting（因為 addPendingContest 的狀態更新是異步的）
        const isAttackerWaiting = dialogState?.type === 'attacker_waiting' && dialogState.sourceType === 'skill' && dialogState.sourceId === selectedSkill.id;
        // Phase 8: 檢查 ref 中是否有正在等待的 contest（同步檢查）
        const isWaitingInRef = waitingContestRef.current.has(selectedSkill.id);
        // Phase 8: 如果有正在進行的對抗檢定（通過 pendingContests、dialogState 或 ref 判斷），不應該關閉 dialog
        if (hasPending || isAttackerWaiting || isWaitingInRef) {
          if (hasPending) {
            updateContestDialog(selectedSkill.id, false);
          }
          return; // 不關閉 dialog
        }
        // 非對抗偷竊/移除的後續目標道具選擇流程進行中，不關閉 dialog
        if (postUseSelection.selectionState?.sourceId === selectedSkill.id) {
          return;
        }
      }
      // 修復：清除 dialogState（localStorage 中的 dialog 狀態），確保 dialog 不會因為 localStorage 中的狀態而重新打開
      if (isDialogForSource(selectedSkill.id, 'skill')) {
        clearDialogState();
      }
    }
    setSelectedSkill(null);
    setCheckResult(undefined);
    setUseResult(null);
    setSelectedTargetId(undefined);
    // Phase 7: 清除目標道具選擇狀態
    setIsTargetConfirmed(false);
    setSelectedTargetItemId('');
    // Phase 3.2: targetItems 由 hook 管理，不需要手動清除
    // 標記會在 selectedSkill 變為 null 時通過 useEffect 清除
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSkill, hasPendingContest, updateContestDialog, dismissLastToast, setSelectedTargetId, setIsTargetConfirmed, setSelectedTargetItemId, isDialogForSource, clearDialogState, dialogState, postUseSelection.selectionState?.sourceId]);

  // 更新 handleCloseDialogRef
  useEffect(() => {
    handleCloseDialogRef.current = handleCloseDialog;
  }, [handleCloseDialog]);

  // Phase 4: 監聽 pendingContests 變化，當對應的 contest 被移除時關閉 dialog
  useEffect(() => {
    // 如果 prevPendingContestsRef 是空的，嘗試從 localStorage 恢復（處理組件重新掛載的情況）
    if (Object.keys(prevPendingContestsRef.current).length === 0 && typeof window !== 'undefined' && selectedSkill) {
      try {
        const storageKey = STORAGE_KEYS.CONTEST_PENDING(characterId);
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as Record<string, { timestamp: number; [key: string]: unknown }>;
          const now = Date.now();
          const filtered: typeof pendingContests = {};
          for (const [key, contest] of Object.entries(parsed)) {
            if (now - (contest.timestamp as number) < CONTEST_TIMEOUT) {
              filtered[key] = contest as unknown as typeof pendingContests[string];
            }
          }
          if (Object.keys(filtered).length > 0) {
            prevPendingContestsRef.current = filtered;}
        }
      } catch (error) {
        console.error('[skill-list] Failed to restore prevPendingContestsRef from localStorage:', error);
      }
    }
    
    if (!selectedSkill) {
      // 只有在 pendingContests 實際變化時才更新追蹤的狀態
      const prevKeys = Object.keys(prevPendingContestsRef.current).sort().join(',');
      const currentKeys = Object.keys(pendingContests).sort().join(',');
      if (prevKeys !== currentKeys) {
        prevPendingContestsRef.current = { ...pendingContests };
      }
      return;
    }
    
    // 如果需要選擇目標道具，且是對應的技能，保持 dialog 打開
    // Phase 9: 如果需要選擇目標道具，會通過新的 dialog 處理，這裡不需要特殊處理
    
    // 檢查對抗檢定是否被移除（從存在變成不存在）
    const hadPendingContest = prevPendingContestsRef.current[selectedSkill.id] !== undefined;
    const hasPendingContest = pendingContests[selectedSkill.id] !== undefined;
    
    // 檢查是否正在進行對抗檢定（通過 waitingContestRef 或 dialogState）
    const isWaitingInRef = waitingContestRef.current.has(selectedSkill.id);
    const isAttackerWaiting = dialogState?.type === 'attacker_waiting' && 
                              dialogState.sourceType === 'skill' && 
                              dialogState.sourceId === selectedSkill.id;
    
    // 方法1: 檢查對抗檢定是否被移除（從存在變成不存在）
    // 重要：只有在確認對抗檢定已完成時才關閉 dialog
    // 如果 waitingContestRef 有值或 dialogState 為 attacker_waiting，說明對抗檢定正在進行中，不應該關閉
    if (hadPendingContest && !hasPendingContest && !targetItemSelectionDialog && !isWaitingInRef && !isAttackerWaiting) {
      // 對抗檢定已完成，關閉 dialog
      // 清除 ref 中的等待標記
      waitingContestRef.current.delete(selectedSkill.id);
      handleCloseDialog();
      // Phase 3: 清除統一的 Dialog 狀態
      if (isDialogForSource(selectedSkill.id, 'skill')) {
        clearDialogState();
      }
    }
    
    // 方法2: 如果 prevPendingContestsRef 有記錄但 pendingContests 沒有，且 dialog 打開了，關閉 dialog
    // 這是為了處理重新整理後恢復的 dialog，當防守方回應時，pendingContests 被清空，但 prevPendingContestsRef 還保留之前的狀態
    // 重要：只有在確認對抗檢定已完成時才關閉 dialog
    // 如果 waitingContestRef 有值或 dialogState 為 attacker_waiting，說明對抗檢定正在進行中，不應該關閉
    if (!hadPendingContest && !hasPendingContest && Object.keys(prevPendingContestsRef.current).length > 0 && prevPendingContestsRef.current[selectedSkill.id] !== undefined && !targetItemSelectionDialog && !isWaitingInRef && !isAttackerWaiting) {
      // 對抗檢定已完成，關閉 dialog
      // 清除 ref 中的等待標記
      waitingContestRef.current.delete(selectedSkill.id);
      handleCloseDialog();
      // Phase 3: 清除統一的 Dialog 狀態
      if (isDialogForSource(selectedSkill.id, 'skill')) {
        clearDialogState();
      }
    }
    
    // 只有在 pendingContests 實際變化時才更新追蹤的狀態
    const prevKeys = Object.keys(prevPendingContestsRef.current).sort().join(',');
    const currentKeys = Object.keys(pendingContests).sort().join(',');
    if (prevKeys !== currentKeys) {
      prevPendingContestsRef.current = { ...pendingContests };}
  }, [pendingContests, selectedSkill, targetItemSelectionDialog, clearDialogState, isDialogForSource, handleCloseDialog, characterId, dialogState]);

  // 衍生狀態：當前選中技能的對抗檢定與操作鎖定狀態
  // 集中計算一次，取代 JSX 中 10+ 處重複的 inline IIFE
  const isContestInProgress = Boolean(
    selectedSkill && (
      hasPendingContest(selectedSkill.id) ||
      waitingContestRef.current.has(selectedSkill.id) ||
      (dialogState?.type === 'attacker_waiting' &&
       dialogState.sourceType === 'skill' &&
       dialogState.sourceId === selectedSkill.id)
    )
  );
  const isPostUseSelecting = Boolean(
    selectedSkill && postUseSelection.selectionState?.sourceId === selectedSkill.id
  );
  /** Dialog 是否被鎖定（不可關閉/不可操作） */
  const isDialogLocked = isContestInProgress || isPostUseSelecting;

  if (!skills || skills.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="space-y-4">
          <Zap className="mx-auto h-12 w-12 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">尚無技能</h3>
            <p className="text-sm text-muted-foreground mt-2">
              你還沒有獲得任何技能
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Phase 7: 確認目標角色並載入目標道具清單
  const handleConfirmTarget = async () => {
    if (!selectedTargetId) {
      toast.error('請先選擇目標角色');
      return;
    }
    
    const effect = selectedSkill?.effects?.find((e: SkillEffect) => e.type === 'item_take' || e.type === 'item_steal');
    
    if (!effect) {
      // 不需要目標道具，直接確認
      setIsTargetConfirmed(true);
        // 儲存狀態
        if (selectedSkill) {
          saveTargetState();
        }
      return;
    }
    
    // 需要目標道具，載入目標角色的道具清單
    setIsLoadingTargetItems(true);
    try {
      const result = await getTargetCharacterItems(selectedTargetId);
      if (result.success && result.data) {
        setTargetItems(result.data);
        setIsTargetConfirmed(true);
        // 如果 localStorage 中有保存的 selectedTargetItemId，恢復它
        // 注意：這個邏輯已經在 useTargetSelection hook 的 restoreTargetState 中處理
        if (selectedSkill) {
          saveTargetState();
        }
      } else {
        toast.error(result.message || '無法載入目標角色的道具清單');
      }
    } catch (error) {
      console.error('載入目標道具清單失敗:', error);
      toast.error('載入目標道具清單失敗');
    } finally {
      setIsLoadingTargetItems(false);
    }
  };
  
  // Phase 7: 取消目標確認
  const handleCancelTarget = () => {
    setIsTargetConfirmed(false);
    setTargetItems([]);
    setSelectedTargetItemId('');
    setSelectedTargetId(undefined);
  };

  return (
    <div className="space-y-4">
      {/* 技能清單標題 */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">技能清單</h2>
        {localSkills.length > 0 && (
          <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-bold">
            {localSkills.length}
          </span>
        )}
      </div>

      {/* 技能卡片列表 */}
      <div className="flex flex-col gap-3">
      {localSkills.map((skill) => {
        const { canUse, reason } = canUseSkill(skill);
        const cooldownRemaining = getCooldownRemaining(skill);
        // Phase 8: 檢查是否有正在進行的對抗檢定
        const isPendingContest = hasPendingContest(skill.id);
        const isDisabled = !canUse || isPendingContest;

        return (
          <SkillCard
            key={skill.id}
            skill={skill}
            cooldownRemaining={cooldownRemaining}
            isPendingContest={isPendingContest}
            isDisabled={isDisabled}
            reason={reason}
            randomContestMaxValue={randomContestMaxValue}
            onClick={() => {
              setSelectedSkill(skill);
              setCheckResult(undefined);
            }}
          />
        );
      })}
      </div>

      <SkillDetailDialog
        selectedSkill={selectedSkill}
        isDialogLocked={isDialogLocked}
        onClose={handleCloseDialog}
        checkResult={checkResult}
        randomContestMaxValue={randomContestMaxValue}
        stats={stats}
        useResult={useResult}
        isUsing={isUsing}
        targetCharacters={targetCharacters}
        selectedTargetId={selectedTargetId}
        setSelectedTargetId={setSelectedTargetId}
        isLoadingTargets={isLoadingTargets}
        isTargetConfirmed={isTargetConfirmed}
        setIsTargetConfirmed={setIsTargetConfirmed}
        targetItems={targetItems}
        selectedTargetItemId={selectedTargetItemId}
        setSelectedTargetItemId={setSelectedTargetItemId}
        isLoadingTargetItems={isLoadingTargetItems}
        requiresTarget={requiresTarget}
        isContestInProgress={isContestInProgress}
        isPostUseSelecting={isPostUseSelecting}
        handleUseSkill={handleUseSkill}
        handleConfirmTarget={handleConfirmTarget}
        handleCancelTarget={handleCancelTarget}
        postUseSelection={postUseSelection}
        isReadOnly={isReadOnly}
        canUseSkill={canUseSkill}
      />

      {/* Phase 9: 目標道具選擇 Dialog */}
      {targetItemSelectionDialog && (
        <TargetItemSelectionDialog
          open={targetItemSelectionDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setTargetItemSelectionDialogState(null);
            }
          }}
          contestId={targetItemSelectionDialog.contestId}
          characterId={characterId}
          defenderId={targetItemSelectionDialog.defenderId}
          sourceType="skill"
          sourceId={targetItemSelectionDialog.sourceId}
          onSelectionComplete={() => {
            // 清除對抗檢定狀態
            if (targetItemSelectionDialog.sourceId) {
              removePendingContest(targetItemSelectionDialog.sourceId);
              waitingContestRef.current.delete(targetItemSelectionDialog.sourceId);
            }
            // 刷新頁面資料
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

