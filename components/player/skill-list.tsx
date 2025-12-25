'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Zap, Clock, CheckCircle2, XCircle } from 'lucide-react';
import Image from 'next/image';
import type { Skill, SkillEffect } from '@/types/character';
import { useSkill as executeSkillAction } from '@/app/actions/skill-use';
import { toast } from 'sonner';
import { useTargetOptions } from '@/hooks/use-target-options';
import { EffectDisplay } from './effect-display';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import type { BaseEvent } from '@/types/event';
import type { SkillContestEvent } from '@/types/event';
import { useContestState } from '@/hooks/use-contest-state';
import { getTargetCharacterItems, type TargetItemInfo } from '@/app/actions/public';
import { selectTargetItemForContest } from '@/app/actions/contest-select-item';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SkillListProps {
  skills?: Skill[];
  characterId: string;
  gameId: string; // Phase 6.5: 需要 gameId 來獲取同劇本角色列表
  characterName: string; // Phase 6.5: 需要角色名稱來顯示在選項中
  stats?: Array<{ name: string; value: number }>; // 用於顯示檢定相關數值
}

export function SkillList({ skills, characterId, gameId, characterName, stats = [] }: SkillListProps) {
  const router = useRouter();
  const [localSkills, setLocalSkills] = useState<Skill[]>(skills || []);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [isUsing, setIsUsing] = useState(false);
  const [checkResult, setCheckResult] = useState<number | undefined>(undefined);
  const [useResult, setUseResult] = useState<{ success: boolean; message: string } | null>(null);
  const [, setTick] = useState(0);
  const [lastToastId, setLastToastId] = useState<string | number | undefined>(undefined);
  
  // Phase 8: 對抗檢定狀態管理
  const { addPendingContest, removePendingContest, hasPendingContest, updateContestDialog, pendingContests } = useContestState(characterId);
  
  // Phase 7: 目標道具選擇相關狀態（用於 item_take 和 item_steal）
  const [isTargetConfirmed, setIsTargetConfirmed] = useState(false); // 目標角色是否已確認
  const [targetItems, setTargetItems] = useState<TargetItemInfo[]>([]); // 目標角色的道具清單
  const [selectedTargetItemId, setSelectedTargetItemId] = useState<string>(''); // 選中的目標道具 ID
  const [isLoadingTargetItems, setIsLoadingTargetItems] = useState(false); // 載入目標道具清單中

  // Phase 8: 需要選擇目標道具的狀態（持久化到 localStorage）
  const getNeedsTargetItemSelectionKey = useCallback(() => `skill-needs-target-selection-${characterId}`, [characterId]);
  
  const [needsTargetItemSelection, setNeedsTargetItemSelection] = useState<{
    contestId: string;
    skillId: string;
    defenderId: string;
  } | null>(null);
  const [targetItemsForSelection, setTargetItemsForSelection] = useState<TargetItemInfo[]>([]);
  const [selectedTargetItemForContest, setSelectedTargetItemForContest] = useState<string>('');
  const [isLoadingTargetItemsForContest, setIsLoadingTargetItemsForContest] = useState(false);
  const [isSelectingTargetItem, setIsSelectingTargetItem] = useState(false);

  // 防止重複 API 調用的 ref
  const restoredStateRef = useRef<Set<string>>(new Set()); // 記錄已經恢復過的技能 ID

  // 目標選擇狀態持久化的 key
  const getTargetStorageKey = useCallback((skillId: string) => `skill-${characterId}-${skillId}-target`, [characterId]);

  // 清除目標選擇狀態
  const clearTargetState = (skillId: string) => {
    if (typeof window === 'undefined') return;
    try {
      const storageKey = getTargetStorageKey(skillId);
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('清除目標選擇狀態失敗:', error);
    }
  };
  
  // Phase 6.5: 目標選擇相關邏輯
  // Phase 7: 對抗檢定類型自動需要目標角色
  const requiresTarget = Boolean(
    selectedSkill?.checkType === 'contest' || 
    selectedSkill?.effects?.some((effect: SkillEffect) => effect.requiresTarget)
  );
  const targetType = selectedSkill?.checkType === 'contest' 
    ? 'other' // 對抗檢定只能對其他角色使用
    : selectedSkill?.effects?.find((e: SkillEffect) => e.requiresTarget)?.targetType;

  const {
    targetOptions: targetCharacters,
    selectedTargetId: hookSelectedTargetId,
    setSelectedTargetId,
    isLoading: isLoadingTargets,
  } = useTargetOptions({
    gameId,
    characterId,
    characterName,
    requiresTarget,
    targetType,
    enabled: !!selectedSkill,
  });

  // 使用本地狀態來管理 selectedTargetId，避免被 hook 重置
  const [localSelectedTargetId, setLocalSelectedTargetId] = useState<string | undefined>(hookSelectedTargetId);
  
  // 同步 hook 的 selectedTargetId 到本地狀態
  useEffect(() => {
    // 只有在 hook 的值變化且本地狀態為 undefined 時才同步（避免覆蓋恢復的值）
    if (hookSelectedTargetId !== undefined && localSelectedTargetId === undefined) {
      setLocalSelectedTargetId(hookSelectedTargetId);
    }
  }, [hookSelectedTargetId, localSelectedTargetId]);

  // 使用本地狀態作為 selectedTargetId
  const selectedTargetId = localSelectedTargetId;

  // 儲存目標選擇狀態到 localStorage（必須在 selectedTargetId 聲明之後）
  const saveTargetState = useCallback((skillId: string) => {
    if (typeof window === 'undefined') return;
    try {
      const storageKey = getTargetStorageKey(skillId);
      const state = {
        selectedTargetId: selectedTargetId || undefined,
        isTargetConfirmed,
        selectedTargetItemId: selectedTargetItemId || undefined,
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.error('儲存目標選擇狀態失敗:', error);
    }
  }, [getTargetStorageKey, selectedTargetId, isTargetConfirmed, selectedTargetItemId]);
  
  // 包裝 setSelectedTargetId 以同時更新本地狀態和 hook
  const setSelectedTargetIdWrapper = useCallback((id: string | undefined) => {
    setLocalSelectedTargetId(id);
    setSelectedTargetId(id);
  }, [setSelectedTargetId]);

  // 從 localStorage 恢復目標選擇狀態
  const restoreTargetState = useCallback(async (skillId: string) => {
    if (typeof window === 'undefined') return;
    
    // 防止重複調用：如果已經恢復過這個技能的狀態，則跳過
    if (restoredStateRef.current.has(skillId)) {
      return;
    }
    
    try {
      const storageKey = getTargetStorageKey(skillId);
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const state = JSON.parse(stored);
        if (state.selectedTargetId) {
          // 標記為已恢復
          restoredStateRef.current.add(skillId);
          
          // 先設置本地狀態
          setLocalSelectedTargetId(state.selectedTargetId);
          // 然後更新 hook 的狀態（使用包裝函數確保兩者同步）
          setSelectedTargetIdWrapper(state.selectedTargetId);
          setIsTargetConfirmed(state.isTargetConfirmed || false);
          setSelectedTargetItemId(state.selectedTargetItemId || '');
          
          // 如果已確認目標且需要目標道具，自動載入目標的道具清單
          if (state.isTargetConfirmed && state.selectedTargetId) {
            const effect = selectedSkill?.effects?.find((e: SkillEffect) => e.type === 'item_take' || e.type === 'item_steal');
            if (effect) {
              // 檢查是否已經有道具清單，避免重複載入
              if (targetItems.length === 0) {
                setIsLoadingTargetItems(true);
                try {
                  const result = await getTargetCharacterItems(state.selectedTargetId);
                  if (result.success && result.data) {
                    setTargetItems(result.data);
                    // 如果 localStorage 中有保存的 selectedTargetItemId，恢復它
                    if (state.selectedTargetItemId) {
                      const itemExists = result.data.some(item => item.id === state.selectedTargetItemId);
                      if (itemExists) {
                        setSelectedTargetItemId(state.selectedTargetItemId);
                      }
                    }
                  }
                } catch (error) {
                  console.error('載入目標道具清單失敗:', error);
                } finally {
                  setIsLoadingTargetItems(false);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('恢復目標選擇狀態失敗:', error);
    }
  }, [selectedSkill, setSelectedTargetIdWrapper, targetItems.length, getTargetStorageKey]);

  // Phase 8: 從持久化狀態恢復 dialog，並檢查對抗檢定是否已完成
  // 使用 useEffect 與道具列表一致
  useEffect(() => {
    if (!skills || Object.keys(pendingContests).length === 0) return;

    // 檢查每個 pending contest 是否已完成
    const now = Date.now();
    const queryPromises: Promise<void>[] = [];
    
    for (const [skillId, contest] of Object.entries(pendingContests)) {
      if (contest.sourceType === 'skill') {
        const skill = skills.find((s) => s.id === skillId);
        if (skill) {
          // Phase 8: 如果 dialogOpen 為 true，自動打開技能 dialog（顯示等待狀態）
          // 這樣攻擊方重新整理後，會看到技能 dialog 而不是全局等待 modal
          if (contest.dialogOpen && !selectedSkill) {
            
            // Phase 8: 先關閉全局等待 dialog（設置 dialogOpen 為 false）
            // 因為技能 dialog 會顯示等待狀態，不需要全局等待 modal
            // 這必須在設置 selectedSkill 之前執行，確保全局等待 modal 不會顯示
            updateContestDialog(skillId, false);
            
            // 設置選中的技能，這會自動打開 dialog
            setSelectedSkill(skill);
            
            // Phase 8: 設置等待狀態訊息，讓技能 dialog 顯示等待狀態
            setUseResult({
              success: true,
              message: '對抗檢定請求已發送，等待防守方回應...',
            });
            
          }
          
          const contestAge = now - contest.timestamp;
          
          // Phase 8: 如果對抗檢定超過 10 秒，查詢服務器狀態確認是否已完成
          // 這是為了處理攻擊方重新整理後無法收到 WebSocket 事件的情況
          // 10 秒是一個合理的等待時間，足夠防守方回應，同時不會讓用戶等待太久
          if (contestAge > 10000) { // 10 秒
            
            // 查詢服務器狀態
            const queryPromise = import('@/app/actions/contest-query').then(({ queryContestStatus }) => {
              return queryContestStatus(contest.contestId, characterId)
                .then((result) => {
                  if (result.success && result.data) {
                    if (!result.data.isActive) {
                      // 對抗檢定已完成，清除本地狀態
                      removePendingContest(skillId);
                    } else {
                      // 對抗檢定仍在進行中，保持狀態
                    }
                  } else {
                    // 查詢失敗，清除本地狀態（避免狀態一直保留）
                    removePendingContest(skillId);
                  }
                })
                .catch((error) => {
                  console.error('[skill-list] 查詢對抗檢定狀態錯誤', { skillId, error });
                  // 查詢錯誤時，不清除本地狀態（可能是網絡問題），但記錄錯誤
                });
            });
            
            queryPromises.push(queryPromise);
          }
        }
      }
    }
    
    // 等待所有查詢完成（但不阻塞 UI）
    if (queryPromises.length > 0) {
      Promise.all(queryPromises).catch((error) => {
        console.error('[skill-list] 查詢對抗檢定狀態時發生錯誤', error);
      });
    }
  }, [skills, pendingContests, selectedSkill, setSelectedTargetIdWrapper, removePendingContest, characterId, updateContestDialog]);

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

  // 當選擇技能時，恢復目標選擇狀態
  // 需要在 useTargetOptions 載入完成後再恢復，避免被重置
  useEffect(() => {
    if (selectedSkill && !isLoadingTargets && targetCharacters.length > 0) {
      // 如果已經恢復過，則跳過
      if (restoredStateRef.current.has(selectedSkill.id)) {
        return;
      }
      // 延遲恢復，確保 useTargetOptions 已經載入完成
      const timer = setTimeout(() => {
        restoreTargetState(selectedSkill.id);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedSkill?.id, isLoadingTargets, targetCharacters.length, restoreTargetState, selectedSkill]); // 等待載入完成
  
  // 當技能改變時，清除恢復狀態記錄
  useEffect(() => {
    if (selectedSkill) {
      // 如果切換到不同的技能，清除之前的記錄
      const currentSkillId = selectedSkill.id;
      restoredStateRef.current.forEach((skillId) => {
        if (skillId !== currentSkillId) {
          restoredStateRef.current.delete(skillId);
        }
      });
    } else {
      // 如果沒有選中技能，清除所有記錄
      restoredStateRef.current.clear();
    }
  }, [selectedSkill?.id, selectedSkill]);

  // 當目標選擇狀態變化時，儲存到 localStorage
  useEffect(() => {
    if (selectedSkill && (selectedTargetId || isTargetConfirmed || selectedTargetItemId)) {
      saveTargetState(selectedSkill.id);
    }
  }, [selectedSkill?.id, selectedTargetId, isTargetConfirmed, selectedTargetItemId, selectedSkill, saveTargetState]);
  
  // Phase 7: 當選擇目標角色時，檢查是否需要載入目標道具清單
  useEffect(() => {
    const effect = selectedSkill?.effects?.find((e: SkillEffect) => e.type === 'item_take' || e.type === 'item_steal');
    
    // 如果效果需要目標道具，且已選擇目標角色，但尚未確認，則重置確認狀態
    if (effect && selectedTargetId && !isTargetConfirmed) {
      setIsTargetConfirmed(false);
      setTargetItems([]);
      setSelectedTargetItemId('');
    }
  }, [selectedSkill, selectedTargetId, isTargetConfirmed]);

  // Phase 8: 從 localStorage 恢復需要選擇目標道具的狀態
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const storageKey = getNeedsTargetItemSelectionKey();
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as { contestId: string; skillId: string; defenderId: string; timestamp: number };
        // 檢查是否過期（超過 1 小時）
        const now = Date.now();
        if (now - parsed.timestamp < 3600000 && parsed.defenderId) {
          setNeedsTargetItemSelection({
            contestId: parsed.contestId,
            skillId: parsed.skillId,
            defenderId: parsed.defenderId,
          });
          
          // 載入防守方的道具清單
          if (parsed.defenderId) {
            setIsLoadingTargetItemsForContest(true);
            getTargetCharacterItems(parsed.defenderId)
              .then((result) => {
                if (result.success && result.data) {
                  // 如果道具清單為空，清除狀態並顯示通知
                  if (result.data.length === 0) {
                    // 清除 useResult 狀態（清除「等待回應」的 toast）
                    setUseResult(null);
                    dismissLastToast();
                    
                    // 調用 API 清除服務器端的對抗檢定追蹤並發送通知
                    import('@/app/actions/contest-cancel').then(({ cancelContestItemSelection }) => {
                      cancelContestItemSelection(parsed.contestId, characterId).catch((error) => {
                        console.error('取消對抗檢定失敗:', error);
                      });
                    });
                    
                    localStorage.removeItem(storageKey);
                    setNeedsTargetItemSelection(null);
                    if (parsed.skillId) {
                      removePendingContest(parsed.skillId);
                      clearTargetState(parsed.skillId);
                    }
                    // 關閉對話框
                    setTimeout(() => {
                      setSelectedSkill(null);
                    }, 0);
                    return;
                  }
                  setTargetItemsForSelection(result.data);
                } else {
                  localStorage.removeItem(storageKey);
                  setNeedsTargetItemSelection(null);
                }
              })
              .catch((error) => {
                console.error('恢復時載入目標道具清單錯誤:', error);
                localStorage.removeItem(storageKey);
                setNeedsTargetItemSelection(null);
              })
              .finally(() => {
                setIsLoadingTargetItemsForContest(false);
              });
          } else {
            localStorage.removeItem(storageKey);
            setNeedsTargetItemSelection(null);
          }
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } catch (error) {
      console.error('[skill-list] 恢復需要選擇目標道具狀態失敗:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getNeedsTargetItemSelectionKey, characterId]);

  // 保存需要選擇目標道具的狀態到 localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const storageKey = getNeedsTargetItemSelectionKey();
    try {
      if (needsTargetItemSelection) {
        const stateToSave = {
          ...needsTargetItemSelection,
          timestamp: Date.now(),
        };
        localStorage.setItem(storageKey, JSON.stringify(stateToSave));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.error('[skill-list] 保存需要選擇目標道具狀態失敗:', error);
    }
  }, [needsTargetItemSelection, getNeedsTargetItemSelectionKey]);

  // Phase 8: 當恢復 needsTargetItemSelection 狀態時，自動打開對應的技能 dialog
  useEffect(() => {
    if (!needsTargetItemSelection) return;
    
    // 如果 skills 還沒有載入，等待載入完成
    if (!skills || skills.length === 0) {
      return;
    }
    
    // 找到對應的技能
    const skill = skills.find((s) => s.id === needsTargetItemSelection.skillId);
    if (!skill) {
      // 如果找不到對應的技能，清除狀態
      console.warn('[skill-list] 找不到對應的技能，清除 needsTargetItemSelection 狀態:', needsTargetItemSelection.skillId);
      setNeedsTargetItemSelection(null);
      return;
    }
    
    // 如果 dialog 還沒有打開，或者打開的不是這個技能，則打開它
    if (!selectedSkill || selectedSkill.id !== needsTargetItemSelection.skillId) {
      // 設置選中的技能，這會自動打開 dialog
      setSelectedSkill(skill);
      
      // 確保對抗檢定狀態已設置（從 pendingContests 恢復）
      // 如果 pendingContests 中沒有這個技能的記錄，需要添加
      if (!hasPendingContest(needsTargetItemSelection.skillId)) {
        // 從 contestId 解析（格式：attackerId::skillId::timestamp）
        const parts = needsTargetItemSelection.contestId.split('::');
        if (parts.length === 3) {
          addPendingContest(needsTargetItemSelection.skillId, 'skill', needsTargetItemSelection.contestId);
          // Phase 8: 關閉等待 dialog（設置 dialogOpen 為 false），因為現在要顯示道具選擇 dialog
          updateContestDialog(needsTargetItemSelection.skillId, false);
        }
      } else {
        // 如果已經有對抗檢定狀態，關閉等待 dialog（因為現在要顯示道具選擇 dialog）
        updateContestDialog(needsTargetItemSelection.skillId, false);
        console.log('[skill-list] 關閉等待 dialog，準備顯示道具選擇 dialog');
      }
    }
  }, [needsTargetItemSelection, skills, selectedSkill, hasPendingContest, addPendingContest, updateContestDialog]);

  // Phase 7: 監聽對抗檢定結果事件，當收到結果時關閉 dialog 並清除狀態
  // 注意：這個監聽只處理攻擊方的結果事件，不會影響防守方的處理
  useCharacterWebSocket(characterId, (event: BaseEvent) => {
    // 只處理 skill.contest 事件，且是攻擊方收到的結果事件
    if (event.type === 'skill.contest') {
      const payload = event.payload as SkillContestEvent['payload'];
      // 只處理結果事件（attackerValue !== 0），且是攻擊方收到的結果
      // 確保 ID 比較時都轉換為字符串，避免類型不匹配問題
      const characterIdStr = String(characterId);
      const attackerIdStr = String(payload.attackerId);
      const defenderIdStr = String(payload.defenderId);
      
      // 注意：防守方的事件（defenderId === characterId）不應該在這裡處理
      if (
        payload.attackerValue !== 0 && 
        attackerIdStr === characterIdStr && 
        defenderIdStr !== characterIdStr &&
        payload.sourceType === 'skill' &&
        payload.skillId
      ) {
        // Phase 8: 如果攻擊方獲勝且需要選擇目標道具
        if (payload.result === 'attacker_wins' && payload.needsTargetItemSelection) {
          
          // 從 pendingContests 中獲取 contestId
          const pendingContest = pendingContests[payload.skillId];
          const contestId = pendingContest?.contestId || `${attackerIdStr}::${payload.skillId}::${event.timestamp}`;
          
          // 設置需要選擇目標道具的狀態（會自動保存到 localStorage）
          setNeedsTargetItemSelection({
            contestId,
            skillId: payload.skillId,
            defenderId: defenderIdStr,
          });
          
          // 保持對抗檢定狀態，不應該清除 pendingContests
          // 這樣即使重新整理頁面，也能保持狀態
          
          // 確保對抗檢定狀態已設置（如果沒有，則添加）
          if (!hasPendingContest(payload.skillId)) {
            addPendingContest(payload.skillId, 'skill', contestId);
          }
          // Phase 8: 關閉等待 dialog（設置 dialogOpen 為 false），因為現在要顯示道具選擇 dialog
          // 但保持對抗檢定狀態（不從 pendingContests 中移除），直到選擇完目標道具
          updateContestDialog(payload.skillId, false);
          
          // 如果對應的技能還沒有打開，自動打開它
          if (skills && !selectedSkill) {
            const skill = skills.find((s) => s.id === payload.skillId);
            if (skill) {
              setSelectedSkill(skill);
            }
          } else if (selectedSkill && selectedSkill.id !== payload.skillId) {
            // 如果當前選中的技能不是這個技能，切換到這個技能
            const skill = skills?.find((s) => s.id === payload.skillId);
            if (skill) {
              setSelectedSkill(skill);
            }
          } else if (selectedSkill && selectedSkill.id === payload.skillId) {
            // 如果技能 dialog 已經打開，確保它保持打開狀態
          }
          
          // 載入防守方的道具清單
          setIsLoadingTargetItemsForContest(true);
          getTargetCharacterItems(defenderIdStr)
            .then((result) => {
              if (result.success && result.data) {
                // 如果道具清單為空，立即關閉對話框並顯示通知
                if (result.data.length === 0) {
                  // 從 pendingContests 中獲取 contestId
                  const pendingContest = payload.skillId ? pendingContests[payload.skillId] : null;
                  const contestId = pendingContest?.contestId || (payload.skillId ? `${characterIdStr}::${payload.skillId}::${Date.now()}` : '');
                  
                  // 清除 useResult 狀態（清除「等待回應」的 toast）
                  setUseResult(null);
                  dismissLastToast();
                  
                  // 調用 API 清除服務器端的對抗檢定追蹤並發送通知
                  if (contestId && payload.skillId) {
                    import('@/app/actions/contest-cancel').then(({ cancelContestItemSelection }) => {
                      cancelContestItemSelection(contestId, characterIdStr).catch((error) => {
                        console.error('取消對抗檢定失敗:', error);
                      });
                    });
                  }
                  
                  setNeedsTargetItemSelection(null);
                  if (payload.skillId) {
                    removePendingContest(payload.skillId);
                    clearTargetState(payload.skillId);
                  }
                  // 關閉對話框
                  setTimeout(() => {
                    setSelectedSkill(null);
                  }, 0);
                  return;
                }
                setTargetItemsForSelection(result.data);
              } else {
                toast.error(result.message || '無法載入目標角色的道具清單');
                setNeedsTargetItemSelection(null);
                // 如果載入失敗，清除對抗檢定狀態
                if (payload.skillId) {
                  removePendingContest(payload.skillId);
                }
              }
            })
            .catch((error) => {
              console.error('載入目標道具清單失敗:', error);
              toast.error('載入目標道具清單失敗');
              setNeedsTargetItemSelection(null);
              // 如果載入失敗，清除對抗檢定狀態
              if (payload.skillId) {
                removePendingContest(payload.skillId);
              }
            })
            .finally(() => {
              setIsLoadingTargetItemsForContest(false);
            });
          
          // 不關閉 dialog，讓用戶選擇目標道具
          // 不清除對抗檢定狀態，保持鎖定狀態直到選擇完成
          return;
        }
        
        // 攻擊方收到結果事件，清除對抗檢定狀態（無論 dialog 是否打開）
        // 注意：如果 needsTargetItemSelection 為 false 或 undefined，表示對抗檢定已完成（可能是選擇完目標道具後的結果通知）
        // 在這種情況下，應該清除對抗檢定狀態
        // 清除對抗檢定狀態
        removePendingContest(payload.skillId);
        
        // 清除目標選擇狀態
        clearTargetState(payload.skillId);
        
        // 清除 needsTargetItemSelection 狀態（如果有的話）
        if (needsTargetItemSelection && needsTargetItemSelection.skillId === payload.skillId) {
          setNeedsTargetItemSelection(null);
          setTargetItemsForSelection([]);
          setSelectedTargetItemForContest('');
        }
        
        // 如果 dialog 是打開的，關閉它
        if (selectedSkill && selectedSkill.id === payload.skillId) {
          setTimeout(() => {
            handleCloseDialog();
          }, 0);
        } else {
          // 即使 dialog 沒有打開，也要確保狀態已清除
          // 這會觸發 useEffect 來關閉可能存在的 dialog
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

  if (!skills || skills.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="space-y-4">
            <Zap className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">尚無技能</h3>
              <p className="text-sm text-muted-foreground mt-2">
                你還沒有獲得任何技能
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 檢查技能是否可使用
  const canUseSkill = (skill: Skill): { canUse: boolean; reason?: string } => {
    // 使用次數檢查
    if (skill.usageLimit && skill.usageLimit > 0) {
      if ((skill.usageCount || 0) >= skill.usageLimit) {
        return { canUse: false, reason: '已達使用次數上限' };
      }
    }

    // 冷卻時間檢查
    if (skill.cooldown && skill.cooldown > 0 && skill.lastUsedAt) {
      const lastUsed = new Date(skill.lastUsedAt).getTime();
      const now = Date.now();
      const cooldownMs = skill.cooldown * 1000;
      if (now - lastUsed < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
        return { canUse: false, reason: `冷卻中 (${remainingSeconds}s)` };
      }
    }

    return { canUse: true };
  };

  // 計算冷卻剩餘時間
  const getCooldownRemaining = (skill: Skill): number | null => {
    if (!skill.cooldown || skill.cooldown <= 0 || !skill.lastUsedAt) return null;
    
    const lastUsed = new Date(skill.lastUsedAt).getTime();
    const now = Date.now();
    const cooldownMs = skill.cooldown * 1000;
    const remaining = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
    
    return remaining > 0 ? remaining : null;
  };

  const dismissLastToast = () => {
    if (lastToastId !== undefined) {
      toast.dismiss(lastToastId);
      setLastToastId(undefined);
    }
  };

  // 使用技能
  const handleUseSkill = async () => {
    if (!selectedSkill) return;
    
    const { canUse } = canUseSkill(selectedSkill);
    if (!canUse) {
      return;
    }

    // Phase 6.5: 檢查是否需要選擇目標角色
    const requiresTarget = selectedSkill.checkType === 'contest' || selectedSkill.effects?.some((effect: SkillEffect) => effect.requiresTarget);
    if (requiresTarget && !selectedTargetId) {
      toast.error('請先選擇目標角色');
      return;
    }
    
    // Phase 8: 檢查是否需要確認目標角色和選擇目標道具
    // 注意：對抗檢定時，不需要在初始使用時選擇目標道具
    const effect = selectedSkill.effects?.find((e: SkillEffect) => e.type === 'item_take' || e.type === 'item_steal');
    const isContest = selectedSkill.checkType === 'contest';
    
    // 非對抗檢定時，才需要確認目標角色和選擇目標道具
    if (effect && !isContest) {
      if (selectedTargetId && !isTargetConfirmed) {
        toast.error('請先確認目標角色');
        return;
      }
      
      if (!selectedTargetItemId) {
        toast.error('請選擇目標道具');
        return;
      }
    }

    // 如果是隨機檢定，自動骰骰子
    let finalCheckResult: number | undefined = undefined;
    if (selectedSkill.checkType === 'random' && selectedSkill.randomConfig) {
      // 自動生成 1 到 maxValue 之間的隨機數
      finalCheckResult = Math.floor(Math.random() * selectedSkill.randomConfig.maxValue) + 1;
      setCheckResult(finalCheckResult);
      toast.info(`骰出結果：${finalCheckResult}`);
    }

    // Phase 7: 對抗檢定必須有目標角色
    if (selectedSkill.checkType === 'contest') {
      if (!selectedTargetId) {
        toast.error('對抗檢定需要選擇目標角色');
        return;
      }
    }

    setIsUsing(true);
    try {
      const result = await executeSkillAction(characterId, selectedSkill.id, finalCheckResult, selectedTargetId, selectedTargetItemId || undefined);
      
      // 顯示結果訊息（不關閉 dialog）
      if (result.success) {
        // 更新本地技能狀態（反映冷卻時間和使用次數）
        setLocalSkills(prevSkills => prevSkills.map(skill => {
          if (skill.id === selectedSkill.id) {
            return {
              ...skill,
              lastUsedAt: new Date(),
              usageCount: (skill.usageCount || 0) + 1,
            };
          }
          return skill;
        }));
        
        // 更新選中的技能狀態
        if (selectedSkill) {
          setSelectedSkill({
            ...selectedSkill,
            lastUsedAt: new Date(),
            usageCount: (selectedSkill.usageCount || 0) + 1,
          });
        }
        
        // Phase 7: 處理對抗檢定結果
        if (result.data?.contestId) {
          // 對抗檢定：等待防守方回應
          // 記錄正在進行的對抗檢定狀態，並保存 dialog 狀態
          addPendingContest(selectedSkill.id, 'skill', result.data.contestId);
          updateContestDialog(selectedSkill.id, true, selectedTargetId);
          setUseResult({ 
            success: true, 
            message: result.message || '對抗檢定請求已發送，等待防守方回應...' 
          });
          setLastToastId(toast.info(result.message || '對抗檢定請求已發送，等待防守方回應...', {
            duration: 5000,
          }));
          // 不關閉 dialog，讓用戶看到等待狀態
        } else if (result.data?.checkPassed === false) {
          setUseResult({ success: false, message: '檢定失敗，技能未生效' });
          setLastToastId(toast.warning('檢定失敗，技能未生效'));
        } else {
          setUseResult({ success: true, message: result.message || '技能使用成功' });
          setLastToastId(toast.success(result.message || '技能使用成功'));
          // 技能使用成功後，清除目標選擇狀態
          if (selectedSkill) {
            clearTargetState(selectedSkill.id);
          }
        }
        // 重新載入頁面資料（不重新整理整個頁面）
        router.refresh();
      } else {
        console.error('技能使用失敗:', result);
        setUseResult({ success: false, message: result.message || '技能使用失敗' });
        setLastToastId(toast.error(result.message || '技能使用失敗'));
      }
    } catch (error) {
      console.error('技能使用錯誤:', error);
      setUseResult({ success: false, message: '技能使用失敗，請稍後再試' });
      setLastToastId(toast.error('技能使用失敗，請稍後再試'));
    } finally {
      setIsUsing(false);
    }
  };

  const handleCloseDialog = () => {
    dismissLastToast();
    // Phase 8: 清除 dialog 狀態（如果有 pending contest）
    if (selectedSkill && hasPendingContest(selectedSkill.id)) {
      updateContestDialog(selectedSkill.id, false);
    }
    setSelectedSkill(null);
    setCheckResult(undefined);
    setUseResult(null);
    setSelectedTargetIdWrapper(undefined);
    // Phase 7: 清除目標道具選擇狀態
    setIsTargetConfirmed(false);
    setTargetItems([]);
    setSelectedTargetItemId('');
  };
  
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
        saveTargetState(selectedSkill.id);
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
        if (selectedSkill) {
          const storageKey = getTargetStorageKey(selectedSkill.id);
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            try {
              const state = JSON.parse(stored);
              if (state.selectedTargetItemId) {
                // 檢查該道具是否仍在目標角色的道具清單中
                const itemExists = result.data.some(item => item.id === state.selectedTargetItemId);
                if (itemExists) {
                  setSelectedTargetItemId(state.selectedTargetItemId);
                }
              }
            } catch {
              // 忽略解析錯誤
            }
          }
          saveTargetState(selectedSkill.id);
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
    setSelectedTargetIdWrapper(undefined);
  };

  return (
    <div className="space-y-4">
      {localSkills.map((skill) => {
        const { canUse, reason } = canUseSkill(skill);
        const cooldownRemaining = getCooldownRemaining(skill);
        // Phase 8: 檢查是否有正在進行的對抗檢定
        const isPendingContest = hasPendingContest(skill.id);
        const isDisabled = !canUse || isPendingContest;

        return (
          <Card
            key={skill.id}
            className={`transition-colors ${
              isDisabled 
                ? 'opacity-50 cursor-not-allowed' 
                : 'cursor-pointer hover:bg-accent/50'
            }`}
            onClick={() => {
              if (!isDisabled) {
                setSelectedSkill(skill);
                setCheckResult(undefined);
              }
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                {/* 技能圖示 */}
                {skill.iconUrl ? (
                  <div className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border">
                    <Image
                      src={skill.iconUrl}
                      alt={skill.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-16 w-16 shrink-0 rounded-lg bg-linear-to-br from-yellow-400 to-orange-500 flex items-center justify-center border">
                    <Zap className="h-8 w-8 text-white" />
                  </div>
                )}

                {/* 技能資訊 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg truncate">{skill.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {skill.description || '尚無描述'}
                      </p>
                    </div>
                    {isDisabled && (
                      <Badge variant="secondary" className="shrink-0">
                        {isPendingContest ? '對抗檢定進行中' : reason}
                      </Badge>
                    )}
                  </div>

                  {/* 技能標籤 */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {skill.checkType !== 'none' && (
                      <Badge variant="outline" className="text-xs">
                        {skill.checkType === 'contest' ? '對抗檢定' : '隨機檢定'}
                        {skill.checkType === 'contest' && skill.contestConfig?.relatedStat && (
                          <span className="ml-1">
                            (使用 {skill.contestConfig.relatedStat})
                          </span>
                        )}
                        {skill.checkType === 'random' && skill.randomConfig && (
                          <span className="ml-1">
                            ({skill.randomConfig.threshold} / {skill.randomConfig.maxValue})
                          </span>
                        )}
                      </Badge>
                    )}
                    {skill.usageLimit && skill.usageLimit > 0 && (
                      <Badge variant="outline" className="text-xs">
                        使用次數：{skill.usageCount || 0} / {skill.usageLimit}
                      </Badge>
                    )}
                    {cooldownRemaining !== null && (
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        冷卻 {cooldownRemaining}s
                      </Badge>
                    )}
                    {skill.effects && skill.effects.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {skill.effects.length} 個效果
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* 技能詳情 Dialog */}
      {selectedSkill && (
        <Dialog open={!!selectedSkill} onOpenChange={(open) => {
          // Phase 8: 如果有正在進行的對抗檢定，不允許關閉 dialog
          const isPendingContest = hasPendingContest(selectedSkill.id);
          if (!open && !isPendingContest) {
            handleCloseDialog();
          }
        }}>
          <DialogContent 
            className="max-w-lg"
            showCloseButton={!hasPendingContest(selectedSkill.id)}
            onInteractOutside={(e) => {
              // Phase 8: 如果有正在進行的對抗檢定，不允許點擊外圍關閉
              const isPendingContest = hasPendingContest(selectedSkill.id);
              if (isPendingContest) {
                e.preventDefault();
              }
            }}
            onEscapeKeyDown={(e) => {
              // Phase 8: 如果有正在進行的對抗檢定，不允許按 ESC 關閉
              const isPendingContest = hasPendingContest(selectedSkill.id);
              if (isPendingContest) {
                e.preventDefault();
              }
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                {selectedSkill.name}
              </DialogTitle>
              <DialogDescription>{selectedSkill.description || '尚無描述'}</DialogDescription>
            </DialogHeader>

            {(() => {
              const selectedCooldownRemaining = getCooldownRemaining(selectedSkill);
              
              return (
            <div className="space-y-4">
              
              {/* 檢定資訊 */}
              {selectedSkill.checkType !== 'none' && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">檢定資訊</h4>
                  {selectedSkill.checkType === 'contest' && selectedSkill.contestConfig && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm">
                        檢定類型：對抗檢定
                      </p>
                      <p className="text-sm mt-1">
                        使用數值：<strong>{selectedSkill.contestConfig.relatedStat}</strong>
                        {(() => {
                          const stat = stats.find((s) => s.name === selectedSkill.contestConfig?.relatedStat);
                          return stat && (
                            <span className="ml-2">
                              (當前值: {stat.value})
                            </span>
                          );
                        })()}
                      </p>
                      {(() => {
                        const maxItems = selectedSkill.contestConfig.opponentMaxItems ?? 0;
                        const maxSkills = selectedSkill.contestConfig.opponentMaxSkills ?? 0;
                        const itemsText = maxItems > 0 ? `${maxItems} 個道具` : null;
                        const skillsText = maxSkills > 0 ? `${maxSkills} 個技能` : null;
                        const parts = [itemsText, skillsText].filter(Boolean);
                        return parts.length > 0 && (
                          <p className="text-sm mt-1">
                            對方可使用：最多 {parts.join('、')}
                          </p>
                        );
                      })()}
                      <p className="text-sm mt-1">
                        平手裁決：{
                          selectedSkill.contestConfig.tieResolution === 'attacker_wins' ? '攻擊方獲勝' :
                          selectedSkill.contestConfig.tieResolution === 'defender_wins' ? '防守方獲勝' :
                          '雙方失敗'
                        }
                      </p>
                      <p className="text-sm mt-2 text-muted-foreground">
                        使用技能後，對方會收到通知並可選擇使用道具或技能進行對抗
                      </p>
                    </div>
                  )}
                  {selectedSkill.checkType === 'random' && selectedSkill.randomConfig && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm">
                        檢定類型：隨機檢定
                      </p>
                      <p className="text-sm mt-1">
                        隨機範圍：1 - {selectedSkill.randomConfig.maxValue}
                      </p>
                      <p className="text-sm mt-1">
                        檢定門檻：<strong>{selectedSkill.randomConfig.threshold}</strong>
                        （&ge; {selectedSkill.randomConfig.threshold} 即成功）
                      </p>
                      {checkResult !== undefined && (
                        <div className="mt-2 flex items-center gap-2">
                          <p className="text-sm">骰出結果：<strong>{checkResult}</strong></p>
                          {checkResult >= selectedSkill.randomConfig.threshold ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <span className="text-sm text-green-600">檢定成功</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 text-red-500" />
                              <span className="text-sm text-red-600">檢定失敗</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 使用限制 */}
              {(selectedSkill.usageLimit || selectedSkill.cooldown) && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">使用限制</h4>
                  <div className="space-y-1 text-sm">
                    {selectedSkill.usageLimit && selectedSkill.usageLimit > 0 && (
                      <p>
                        使用次數：{selectedSkill.usageCount || 0} / {selectedSkill.usageLimit}
                      </p>
                    )}
                    {selectedSkill.cooldown && selectedSkill.cooldown > 0 && (
                      <p>
                        冷卻時間：{selectedSkill.cooldown} 秒
                        {selectedCooldownRemaining !== null && (
                          <span className="ml-2 text-muted-foreground">
                            (剩餘 {selectedCooldownRemaining}s)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 效果列表 */}
              {selectedSkill.effects && selectedSkill.effects.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">技能效果</h4>
                  <div className="space-y-2">
                    {selectedSkill.effects.map((effect, index) => (
                      <div key={index}>
                        <EffectDisplay
                          effect={effect}
                          targetOptions={effect.requiresTarget ? targetCharacters : []}
                          selectedTargetId={selectedTargetId}
                          onTargetChange={(targetId) => {
                            // Phase 7: 當目標角色改變時，重置確認狀態
                            setIsTargetConfirmed(false);
                            setTargetItems([]);
                            setSelectedTargetItemId('');
                            setSelectedTargetIdWrapper(targetId);
                          }}
                          disabled={isTargetConfirmed}
                        />
                        
                        {/* Phase 7: 目標角色確認和目標道具選擇 */}
                        {/* Phase 8: 對抗檢定時，不顯示目標道具選擇 UI（將在判定結束後選擇） */}
                        {(effect.type === 'item_take' || effect.type === 'item_steal') && selectedSkill.checkType !== 'contest' && (
                          <div className="mt-3 space-y-3">
                            {selectedTargetId && !isTargetConfirmed && (
                              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <p className="text-sm font-medium text-blue-800 mb-2">
                                  已選擇目標角色：{targetCharacters.find(t => t.id === selectedTargetId)?.name || '未知'}
                                </p>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={handleConfirmTarget}
                                    disabled={isLoadingTargetItems}
                                    className="flex-1"
                                  >
                                    {isLoadingTargetItems ? '載入中...' : '確認目標'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleCancelTarget}
                                    disabled={isLoadingTargetItems}
                                  >
                                    取消
                                  </Button>
                                </div>
                              </div>
                            )}
                            
                            {isTargetConfirmed && targetItems.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-sm font-medium">
                                  選擇目標道具：
                                </p>
                                <Select value={selectedTargetItemId} onValueChange={setSelectedTargetItemId}>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder={`選擇要${effect.type === 'item_steal' ? '偷竊' : '移除'}的道具...`} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {targetItems.map((item) => (
                                      <SelectItem key={item.id} value={item.id}>
                                        {item.name} {item.quantity > 1 && `(x${item.quantity})`}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            
                            {isTargetConfirmed && targetItems.length === 0 && (
                              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                <p className="text-sm text-yellow-800">
                                  目標角色沒有道具
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 使用結果訊息 */}
              {useResult && (
                <div className={`p-4 rounded-lg border-2 ${
                  useResult.success 
                    ? 'bg-green-50 border-green-200 text-green-800' 
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <div className="flex items-center gap-2">
                    {useResult.success ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                    )}
                    <p className="font-medium">{useResult.message}</p>
                  </div>
                </div>
              )}

              {/* Phase 8: 對抗檢定後需要選擇目標道具 */}
              {needsTargetItemSelection && needsTargetItemSelection.skillId === selectedSkill.id && (
                <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                  <p className="text-sm font-medium text-blue-800 mb-3">
                    對抗檢定獲勝！請選擇要偷竊或移除的道具：
                  </p>
                  {isLoadingTargetItemsForContest ? (
                    <p className="text-sm text-blue-600">載入目標道具清單中...</p>
                  ) : targetItemsForSelection.length > 0 ? (
                    <div className="space-y-3">
                      <Select 
                        value={selectedTargetItemForContest} 
                        onValueChange={setSelectedTargetItemForContest}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="選擇目標道具..." />
                        </SelectTrigger>
                        <SelectContent>
                          {targetItemsForSelection.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name} {item.quantity > 1 && `(x${item.quantity})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button
                          onClick={async () => {
                            if (!selectedTargetItemForContest || !needsTargetItemSelection) return;
                            
                            setIsSelectingTargetItem(true);
                            try {
                              
                              const result = await selectTargetItemForContest(
                                needsTargetItemSelection.contestId,
                                characterId,
                                selectedTargetItemForContest,
                                needsTargetItemSelection.defenderId // 傳遞 defenderId，以防服務器端記錄丟失
                              );
                              
                              
                              if (result.success) {
                                toast.success(result.message || '目標道具選擇成功');
                                // 清除狀態
                                setNeedsTargetItemSelection(null);
                                setSelectedTargetItemForContest('');
                                setTargetItemsForSelection([]);
                                // 清除對抗檢定狀態
                                removePendingContest(needsTargetItemSelection.skillId);
                                // 清除目標選擇狀態
                                clearTargetState(needsTargetItemSelection.skillId);
                                // 關閉 dialog
                                setTimeout(() => {
                                  handleCloseDialog();
                                }, 0);
                                // 刷新頁面資料
                                router.refresh();
                              } else {
                                toast.error(result.message || '選擇目標道具失敗');
                              }
                            } catch (error) {
                              console.error('[skill-list] 選擇目標道具錯誤:', error);
                              toast.error('選擇目標道具時發生錯誤');
                            } finally {
                              setIsSelectingTargetItem(false);
                            }
                          }}
                          disabled={!selectedTargetItemForContest || isSelectingTargetItem}
                          className="flex-1"
                        >
                          {isSelectingTargetItem ? '處理中...' : '確認選擇'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setNeedsTargetItemSelection(null);
                            setSelectedTargetItemForContest('');
                            setTargetItemsForSelection([]);
                            // 清除對抗檢定狀態
                            if (needsTargetItemSelection) {
                              removePendingContest(needsTargetItemSelection.skillId);
                              clearTargetState(needsTargetItemSelection.skillId);
                            }
                          }}
                          disabled={isSelectingTargetItem}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-blue-600">目標角色沒有道具</p>
                  )}
                </div>
              )}
            </div>
            );
            })()}

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  const isPendingContest = hasPendingContest(selectedSkill.id);
                  if (!isPendingContest) {
                    setSelectedSkill(null);
                    setCheckResult(undefined);
                    setUseResult(null);
                  }
                }}
                disabled={hasPendingContest(selectedSkill.id)}
              >
                關閉
              </Button>
              <Button
                onClick={handleUseSkill}
                disabled={(() => {
                  if (!selectedSkill) return true;
                  if (isUsing) return true;
                  // Phase 8: 如果有正在進行的對抗檢定，禁用按鈕
                  if (hasPendingContest(selectedSkill.id)) return true;
                  // Phase 7: 對抗檢定需要目標角色
                  if (selectedSkill.checkType === 'contest' && !selectedTargetId) return true;
                  // Phase 8: 檢查是否需要確認目標角色和選擇目標道具
                  // 注意：對抗檢定時，不需要在初始使用時選擇目標道具
                  const effect = selectedSkill.effects?.find((e: SkillEffect) => e.type === 'item_take' || e.type === 'item_steal');
                  const isContest = selectedSkill.checkType === 'contest';
                  if (effect && !isContest && selectedTargetId && (!isTargetConfirmed || !selectedTargetItemId)) return true;
                  const { canUse } = canUseSkill(selectedSkill);
                  return !canUse;
                })()}
              >
                {isUsing ? '使用中...' : 
                 (() => {
                   if (!selectedSkill) return '使用技能';
                   // Phase 8: 如果有正在進行的對抗檢定
                   if (hasPendingContest(selectedSkill.id)) {
                     return '等待對抗檢定結果...';
                   }
                   // Phase 7: 對抗檢定需要目標角色時的提示
                   if (selectedSkill.checkType === 'contest' && !selectedTargetId) {
                     return '請選擇目標角色';
                   }
                   // Phase 8: 檢查目標道具選擇（非對抗檢定時才需要）
                   const effect = selectedSkill.effects?.find((e: SkillEffect) => e.type === 'item_take' || e.type === 'item_steal');
                   const isContest = selectedSkill.checkType === 'contest';
                   if (effect && !isContest) {
                     if (!selectedTargetId) {
                       return '請選擇目標角色';
                     }
                     if (!isTargetConfirmed) {
                       return '請確認目標角色';
                     }
                     if (!selectedTargetItemId) {
                       return '請選擇目標道具';
                     }
                   }
                   const { canUse, reason } = canUseSkill(selectedSkill);
                   if (!canUse && reason) {
                     return `使用技能 (${reason})`;
                   }
                   return '使用技能';
                 })()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

