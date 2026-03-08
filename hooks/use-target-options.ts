import { useState, useEffect } from 'react';
import { getTransferTargets, type TransferTargetCharacter } from '@/app/actions/public';

export interface UseTargetOptionsProps {
  gameId: string;
  characterId: string;
  characterName: string;
  requiresTarget?: boolean;
  targetType?: 'self' | 'other' | 'any';
  enabled?: boolean;
}

export interface UseTargetOptionsReturn {
  targetOptions: TransferTargetCharacter[];
  selectedTargetId: string | undefined;
  setSelectedTargetId: (id: string | undefined) => void;
  isLoading: boolean;
}

/**
 * 共用 hook：處理目標選擇邏輯
 * 用於技能和道具的目標角色載入和選擇
 */
export function useTargetOptions({
  gameId,
  characterId,
  characterName,
  requiresTarget = false,
  targetType,
  enabled = true,
}: UseTargetOptionsProps): UseTargetOptionsReturn {
  const [targetOptions, setTargetOptions] = useState<TransferTargetCharacter[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadTargetOptions = async () => {
      // 如果不需要目標或未啟用，清除選項
      if (!requiresTarget || !enabled || !gameId || !characterId) {
        setTargetOptions([]);
        setSelectedTargetId(undefined);
        return;
      }

      setIsLoading(true);

      try {
        const result = await getTransferTargets(gameId, characterId);

        if (result.success && result.data) {
          const targets = [...result.data];

          // 根據 targetType 決定是否包含自己
          const shouldIncludeSelf = targetType === 'any';

          if (shouldIncludeSelf) {
            const alreadyHasSelf = targets.some((t) => t.id === characterId);
            if (!alreadyHasSelf) {
              targets.unshift({
                id: characterId,
                name: `${characterName}（自己）`,
                imageUrl: undefined,
              });
            }
          }

          setTargetOptions(targets);
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
  }, [gameId, characterId, characterName, requiresTarget, targetType, enabled]);

  return {
    targetOptions,
    selectedTargetId,
    setSelectedTargetId,
    isLoading,
  };
}
