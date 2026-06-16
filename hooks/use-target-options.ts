import { useState, useEffect } from 'react';
import { getTransferTargets, type TransferTargetCharacter } from '@/app/actions/public';

export interface UseTargetOptionsProps {
  gameId: string;
  characterId: string;
  characterName: string;
  requiresTarget?: boolean;
  targetType?: 'self' | 'other' | 'any';
  enabled?: boolean;
  /**
   * 外部提供的目標清單（perf 去重）：呼叫端（如 item-list）已抓過同一份
   * getTransferTargets 時傳入，hook 直接使用、不再自行抓取，成為單一來源。
   * 未提供（undefined）時維持原本的自抓行為（向後相容 skill-list 等呼叫端）。
   */
  externalTargets?: TransferTargetCharacter[];
  /** 外部清單是否仍在載入（搭配 externalTargets，用於正確回報 isLoading） */
  externalTargetsLoading?: boolean;
}

/**
 * 依 targetType 組出目標選項（'any' 時於首位插入「自己」）
 */
function buildTargetOptions(
  rawTargets: TransferTargetCharacter[],
  targetType: 'self' | 'other' | 'any' | undefined,
  characterId: string,
  characterName: string,
): TransferTargetCharacter[] {
  const targets = [...rawTargets];
  if (targetType === 'any') {
    const alreadyHasSelf = targets.some((t) => t.id === characterId);
    if (!alreadyHasSelf) {
      targets.unshift({ id: characterId, name: `${characterName}（自己）`, imageUrl: undefined });
    }
  }
  return targets;
}

export interface UseTargetOptionsReturn {
  targetOptions: TransferTargetCharacter[];
  selectedTargetId: string | undefined;
  setSelectedTargetId: (id: string | undefined) => void;
  isLoading: boolean;
}

/**
 * 共用 hook：處理目標選擇邏輯
 * 用於技能和物品的目標角色載入和選擇
 */
export function useTargetOptions({
  gameId,
  characterId,
  characterName,
  requiresTarget = false,
  targetType,
  enabled = true,
  externalTargets,
  externalTargetsLoading,
}: UseTargetOptionsProps): UseTargetOptionsReturn {
  const [targetOptions, setTargetOptions] = useState<TransferTargetCharacter[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 如果不需要目標或未啟用，清除選項
    if (!requiresTarget || !enabled || !gameId || !characterId) {
      setTargetOptions([]);
      setSelectedTargetId(undefined);
      return;
    }

    // perf 去重路徑：呼叫端已提供 externalTargets（item-list 的 sharedTargets），
    // 直接使用、不自行抓取
    if (externalTargets !== undefined) {
      setIsLoading(externalTargetsLoading ?? false);
      if (externalTargetsLoading) return; // 等外部載入完成再 populate
      setTargetOptions(buildTargetOptions(externalTargets, targetType, characterId, characterName));
      setSelectedTargetId(undefined);
      return;
    }

    // 向後相容路徑：未提供 externalTargets 時自行抓取（skill-list 等呼叫端）
    const loadTargetOptions = async () => {
      setIsLoading(true);

      try {
        const result = await getTransferTargets(gameId, characterId);

        if (result.success && result.data) {
          setTargetOptions(buildTargetOptions(result.data, targetType, characterId, characterName));
          setSelectedTargetId(undefined);
        } else {
          // 即便查詢失敗，若允許自己為目標，至少提供自己選項
          if (targetType === 'any') {
            setTargetOptions([
              { id: characterId, name: `${characterName}（自己）`, imageUrl: undefined },
            ]);
          } else {
            setTargetOptions([]);
          }
          setSelectedTargetId(undefined);
        }
      } catch (error) {
        console.error('Failed to load target options:', error);
        setTargetOptions([]);
        setSelectedTargetId(undefined);
      } finally {
        setIsLoading(false);
      }
    };

    loadTargetOptions();
  }, [gameId, characterId, characterName, requiresTarget, targetType, enabled, externalTargets, externalTargetsLoading]);

  return {
    targetOptions,
    selectedTargetId,
    setSelectedTargetId,
    isLoading,
  };
}
