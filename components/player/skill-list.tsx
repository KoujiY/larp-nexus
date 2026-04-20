'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Zap } from 'lucide-react';
import type { Skill, Item, SkillEffect } from '@/types/character';
import { useTargetSelection } from '@/hooks/use-target-selection';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import type { BaseEvent } from '@/types/event';
import type { SkillContestEvent } from '@/types/event';
import { useContestState } from '@/hooks/use-contest-state';
import { useContestDialogState } from '@/hooks/use-contest-dialog-state';
import { useContestStateRestore } from '@/hooks/use-contest-state-restore';
import { useSkillUsage } from '@/hooks/use-skill-usage';
import { useContestableItemUsage } from '@/hooks/use-contestable-item-usage';
import { canUseSkill, getCooldownRemaining } from '@/lib/utils/skill-validators';
import type { SkillListProps } from '@/types/skill-list';
import { SkillCard } from './skill-card';

// 技能詳情與目標選擇 dialog 僅在玩家點技能時出現，改 dynamic 延後載入。
const SkillDetailDialog = dynamic(
  () => import('./skill-detail-dialog').then((m) => ({ default: m.SkillDetailDialog })),
  { ssr: false },
);
const TargetItemSelectionDialog = dynamic(
  () => import('./target-item-selection-dialog').then((m) => ({ default: m.TargetItemSelectionDialog })),
  { ssr: false },
);

export function SkillList({ skills, characterId, gameId, characterName, stats = [], randomContestMaxValue = 100, isReadOnly = false }: SkillListProps) {
  // Phase 10.5.4: 唯讀模式下隱藏所有互動按鈕（使用技能）

  const router = useRouter();
  const [localSkills, setLocalSkills] = useState<Skill[]>(skills || []);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [, setTick] = useState(0);
  // Phase 8: 對抗檢定狀態管理
  const { removePendingContest, hasPendingContest, updateContestDialog, pendingContests } = useContestState(characterId);
  
  // Phase 3: 使用統一的 Dialog 狀態管理
  const { dialogState, clearDialogState, isDialogForSource } = useContestDialogState(characterId);
  
  // Phase 3.2: 使用 useTargetSelection Hook 管理目標選擇
  // §4: 由 effects 陣列整體推導 targetType（Wizard mutex 規則保證 other / any 不並存）
  //   - 對抗檢定 → 固定 'other'
  //   - 任一效果 other → 'other'
  //   - 任一效果 any → 'any'
  //   - 只有 self 效果 → 不需要目標（requiresTarget = false）
  const isContestCheck = selectedSkill?.checkType === 'contest' || selectedSkill?.checkType === 'random_contest';
  const hasOtherEffect = selectedSkill?.effects?.some((e: SkillEffect) => e.targetType === 'other') ?? false;
  const hasAnyEffect = selectedSkill?.effects?.some((e: SkillEffect) => e.targetType === 'any') ?? false;
  const requiresTarget = Boolean(isContestCheck || hasOtherEffect || hasAnyEffect);
  const targetType: 'self' | 'other' | 'any' | undefined = isContestCheck
    ? 'other'
    : hasOtherEffect
      ? 'other'
      : hasAnyEffect
        ? 'any'
        : undefined;

  const {
    selectedTargetId,
    setSelectedTargetId,
    targetOptions: targetCharacters,
    isLoading: isLoadingTargets,
    isTargetConfirmed,
    setIsTargetConfirmed,
    selectedTargetItemId,
    setSelectedTargetItemId,
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

  // Phase 6.4: 使用 ref 存儲 handleCloseDialog，以便在回調中使用
  const handleCloseDialogRef = useRef<(() => void) | null>(null);

  // 非對抗偷竊/移除：使用成功後的目標道具選擇（由獨立 Dialog 顯示）
  const [postUseSelectionState, setPostUseSelectionState] = useState<{
    sourceId: string;
    sourceType: 'skill' | 'item';
    effectType: 'item_steal' | 'item_take';
    targetCharacterId: string;
    characterId: string;
  } | null>(null);

  // 包裝 setSelectedSkill 以符合 hook 的類型要求
  const handleItemSelected = useCallback((item: Skill | Item | null) => {
    // 如果嘗試關閉 dialog（item 為 null），但正在進行對抗檢定或目標道具選擇，則不關閉
    if (!item && selectedSkill) {
      const hasPending = hasPendingContest(selectedSkill.id);
      const isAttackerWaiting = dialogState?.type === 'attacker_waiting' &&
                                dialogState.sourceType === 'skill' &&
                                dialogState.sourceId === selectedSkill.id;
      const isWaitingInRef = waitingContestRef.current.has(selectedSkill.id);

      if (hasPending || isAttackerWaiting || isWaitingInRef) {
        return; // 不關閉 dialog
      }
    }
    setSelectedSkill(item as Skill | null);
  }, [selectedSkill, hasPendingContest, dialogState]);

  // Phase 8.2: 使用 ref 存儲 handleContestStarted，以便在 onSuccess 回調中使用
  const handleContestStartedRef = useRef<((contestId: string, displayData?: import('@/hooks/use-contest-dialog-state').AttackerWaitingDisplayData) => void) | null>(null);

  // Phase 6.2: 使用 useSkillUsage Hook 管理技能使用
  const {
    isUsing,
    checkResult,
    handleUseSkill,
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
        const targetName = targetCharacters.find((c) => c.id === selectedTargetId)?.name || '未知';
        handleContestStartedRef.current(result.data.contestId, {
          attackerValue: result.data.attackerValue ?? 0,
          defenderName: targetName,
          sourceName: selectedSkill.name,
          checkType: (selectedSkill.checkType as 'contest' | 'random_contest') || 'contest',
          relatedStat: selectedSkill.contestConfig?.relatedStat,
          randomContestMaxValue,
        });
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
    onCloseDialog: () => {
      handleCloseDialogRef.current?.();
    },
    onNeedsTargetItemSelection: (info) => {
      // 非對抗偷竊/移除：使用成功後開啟目標道具選擇 Dialog
      setPostUseSelectionState({
        ...info,
        sourceType: 'skill',
        characterId,
      });
    },
  });

  // Phase 8.2: 使用 useContestableItemUsage Hook
  const { handleContestStarted } = useContestableItemUsage({
    characterId,
    sourceType: 'skill',
    sourceId: selectedSkill?.id || '',
    selectedTargetId,
    onContestStarted: () => {
      // 關閉 bottom sheet，等待 Dialog 由 character-card-view 層掛載
      setSelectedSkill(null);
      setCheckResult(undefined);
    },
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

  // 監聽對抗檢定結果事件：清除 skill-list 本地狀態（pendingContest、waitingRef、bottom sheet）
  // 注意：dialog 開關（等待 dialog、目標道具選擇 dialog）由 use-game-event-handler.ts 統一處理
  useCharacterWebSocket(characterId, (event: BaseEvent) => {
    if (event.type === 'skill.contest') {
      const payload = event.payload as SkillContestEvent['payload'];
      const characterIdStr = String(characterId);
      const attackerIdStr = String(payload.attackerId);
      const defenderIdStr = String(payload.defenderId);

      // 只處理攻擊方收到的結果事件（技能類型）
      if (
        payload.attackerValue !== 0 &&
        attackerIdStr === characterIdStr &&
        defenderIdStr !== characterIdStr &&
        payload.sourceType === 'skill' &&
        payload.skillId
      ) {
        const skillId = payload.skillId;

        // 清除本地等待標記
        waitingContestRef.current.delete(skillId);
        clearTargetState();

        // 需要選擇目標道具的分歧：保持 pendingContest（由 character-card-view 的 TargetItemSelectionDialog 結束後清除）
        if (payload.result === 'attacker_wins' && payload.needsTargetItemSelection) {
          return;
        }

        // 其他結果：清除 pendingContest
        if (hasPendingContest(skillId)) {
          removePendingContest(skillId);
        }
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
      }
      // 修復：清除 dialogState（localStorage 中的 dialog 狀態），確保 dialog 不會因為 localStorage 中的狀態而重新打開
      if (isDialogForSource(selectedSkill.id, 'skill')) {
        clearDialogState();
      }
    }
    setSelectedSkill(null);
    setCheckResult(undefined);
    setSelectedTargetId(undefined);
    // Phase 7: 清除目標道具選擇狀態
    setIsTargetConfirmed(false);
    setSelectedTargetItemId('');
    // Phase 3.2: targetItems 由 hook 管理，不需要手動清除
    // 標記會在 selectedSkill 變為 null 時通過 useEffect 清除
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSkill, hasPendingContest, updateContestDialog, setSelectedTargetId, setIsTargetConfirmed, setSelectedTargetItemId, isDialogForSource, clearDialogState, dialogState]);

  // 更新 handleCloseDialogRef
  useEffect(() => {
    handleCloseDialogRef.current = handleCloseDialog;
  }, [handleCloseDialog]);

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
  /** Dialog 是否被鎖定（不可關閉/不可操作） */
  const isDialogLocked = isContestInProgress;

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
        isUsing={isUsing}
        targetCharacters={targetCharacters}
        selectedTargetId={selectedTargetId}
        setSelectedTargetId={setSelectedTargetId}
        isLoadingTargets={isLoadingTargets}
        isTargetConfirmed={isTargetConfirmed}
        requiresTarget={requiresTarget}
        isContestInProgress={isContestInProgress}
        handleUseSkill={handleUseSkill}
        isReadOnly={isReadOnly}
        canUseSkill={canUseSkill}
      />

      {/* 非對抗偷竊/移除：使用成功後的目標道具選擇 Dialog */}
      {postUseSelectionState && (
        <TargetItemSelectionDialog
          mode="post-use"
          open={true}
          onOpenChange={(open) => {
            if (!open) setPostUseSelectionState(null);
          }}
          characterId={postUseSelectionState.characterId}
          targetCharacterId={postUseSelectionState.targetCharacterId}
          sourceType={postUseSelectionState.sourceType}
          sourceId={postUseSelectionState.sourceId}
          effectType={postUseSelectionState.effectType}
          onSelectionComplete={() => {
            setPostUseSelectionState(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

