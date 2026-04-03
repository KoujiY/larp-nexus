'use server';

import { Character, Game } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import { getCharacterData } from '@/lib/game/get-character-data'; // Phase 10.4: 統一讀取
import type { ApiResponse } from '@/types/api';
import type { CharacterData, CharacterBaselineSnapshot, TemporaryEffect } from '@/types/character';
import type { GamePublicData } from '@/types/game';
import { cleanSkillData, cleanItemData, cleanStatData, cleanTaskData, cleanSecretData } from '@/lib/character-cleanup';
import { checkExpiredEffects } from './temporary-effects'; // Phase 8: 過期效果檢查
import { fetchPendingEvents } from './pending-events'; // Phase 9: 離線事件拉取

/**
 * 取得公開角色資料（玩家端使用）
 * Phase 4: 回傳完整資料（含 publicInfo、secretInfo、tasks、items、stats）
 * 不需要認證，但如果有 PIN 鎖會隱藏部分資訊
 * secretInfo 只回傳已揭露的隱藏資訊（isRevealed === true）
 */
export async function getPublicCharacter(
  characterId: string
): Promise<ApiResponse<CharacterData>> {
  try {
    await dbConnect();

    // Phase 10.4: 使用統一的讀取函數（自動判斷 Baseline/Runtime）
    // Mongoose Document → 純物件，避免巢狀子文件的 toJSON 造成 Server→Client 序列化失敗
    const characterDoc = await getCharacterData(characterId);
    const character = JSON.parse(JSON.stringify(characterDoc));

    // Phase 8: 檢查並處理過期的時效性效果
    await checkExpiredEffects(characterId);

    // Phase 9: 拉取離線事件（graceful degradation: 失敗不影響主流程）
    const pendingEventsResult = await fetchPendingEvents(characterId, character.gameId.toString());
    const pendingEvents = pendingEventsResult.success ? pendingEventsResult.data?.events : [];

    // Phase 3.5: 過濾出已揭露的隱藏資訊（清理 _id）
    // Phase 7.7: 排除 GM 專用欄位（revealCondition、autoRevealCondition）
    const allSecrets = cleanSecretData(character.secretInfo?.secrets);
    const revealedSecrets = allSecrets
      .filter((secret) => secret.isRevealed === true)
      .map((secret) => ({
        id: secret.id,
        title: secret.title,
        content: secret.content,
        isRevealed: secret.isRevealed,
        revealedAt: secret.revealedAt,
      }));

    // Phase 4.5: 過濾任務（一般任務 + 已揭露的隱藏任務），清理 _id 和 GM 專用欄位
    // Phase 7.7: 排除 GM 專用欄位（gmNotes、revealCondition、autoRevealCondition）
    const visibleTasks = cleanTaskData(character.tasks)
      .filter((task) => {
        // 一般任務總是可見（isHidden 為 false 或 undefined）
        if (task.isHidden !== true) return true;
        // 隱藏任務只有在已揭露時才可見
        return task.isRevealed === true;
      })
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        isHidden: task.isHidden,
        isRevealed: task.isRevealed,
        revealedAt: task.revealedAt,
        status: task.status,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
      }));

    // Phase 4.5: 清理道具的 _id
    const cleanItems = cleanItemData(character.items);

    // Phase 5: 清理技能的 _id
    const cleanSkills = cleanSkillData(character.skills);

    // Phase 7.6: 獲取劇本的 randomContestMaxValue 和 isActive
    const game = await Game.findById(character.gameId).select('randomContestMaxValue isActive gameCode').lean();
    const randomContestMaxValue = game?.randomContestMaxValue || 100;

    // Phase 8: 重新載入角色以取得最新的 temporaryEffects（過期檢查後）
    // Phase 10.4: 使用統一的讀取函數
    const updatedCharacterDoc = await getCharacterData(characterId);
    const updatedCharacter = JSON.parse(JSON.stringify(updatedCharacterDoc));

    // Phase 8: 使用過期檢查後的最新 stats（確保恢復後的數值正確反映）
    const cleanStats = cleanStatData(updatedCharacter?.stats || character.stats);

    // Phase 8: 過濾出未過期的 temporaryEffects
    const now = new Date();
    const allTemporaryEffects = updatedCharacter?.temporaryEffects || [];
    const activeTemporaryEffects = allTemporaryEffects
      .filter((effect: TemporaryEffect) => !effect.isExpired && new Date(effect.expiresAt) > now)
      .map((effect: TemporaryEffect) => ({
        // 顯式映射欄位，避免 .lean() 子文件的 _id (ObjectId) 造成序列化失敗
        id: effect.id,
        sourceType: effect.sourceType,
        sourceId: effect.sourceId,
        sourceCharacterId: effect.sourceCharacterId,
        sourceCharacterName: effect.sourceCharacterName,
        sourceName: effect.sourceName,
        effectType: effect.effectType,
        targetStat: effect.targetStat,
        deltaValue: effect.deltaValue,
        deltaMax: effect.deltaMax,
        statChangeTarget: effect.statChangeTarget,
        syncValue: effect.syncValue,
        duration: effect.duration,
        appliedAt: new Date(effect.appliedAt).toISOString(),
        expiresAt: new Date(effect.expiresAt).toISOString(),
        isExpired: effect.isExpired,
      }));
    // Phase 10: 遊戲進行中時，額外讀取 Baseline 資料供唯讀預覽模式使用
    // 唯讀模式（PIN-only）應顯示原始角色設定（Baseline），而非 Runtime 修改後的數值
    let baselineData: CharacterData['baselineData'] = undefined;
    if (game?.isActive) {
      const baselineCharacter = await Character.findById(characterId).lean();
      if (baselineCharacter) {
        const bl = JSON.parse(JSON.stringify(baselineCharacter));

        // 對 Baseline 資料套用與 Runtime 相同的清理和過濾邏輯
        // 注意：bl 經過 JSON.parse(JSON.stringify(...)) 處理，所有 Date 已轉為 string
        // 因此使用 as unknown as 進行安全的類型轉換
        const blSecrets = cleanSecretData(bl.secretInfo?.secrets)
          .filter((s: { isRevealed?: boolean }) => s.isRevealed === true);

        const blVisibleTasks = cleanTaskData(bl.tasks)
          .filter((t: { isHidden?: boolean; isRevealed?: boolean }) => {
            if (t.isHidden !== true) return true;
            return t.isRevealed === true;
          });

        baselineData = {
          stats: cleanStatData(bl.stats) as unknown as CharacterBaselineSnapshot['stats'],
          items: cleanItemData(bl.items) as unknown as CharacterBaselineSnapshot['items'],
          skills: cleanSkillData(bl.skills) as unknown as CharacterBaselineSnapshot['skills'],
          tasks: blVisibleTasks as unknown as CharacterBaselineSnapshot['tasks'],
          secretInfo: blSecrets.length > 0
            ? { secrets: blSecrets as unknown as NonNullable<CharacterBaselineSnapshot['secretInfo']>['secrets'] }
            : undefined,
        };
      }
    }

    return {
      success: true,
      data: {
        // Phase 10: 永遠使用 Baseline Character ID（傳入的 characterId）
        // 當遊戲進行中時 getCharacterData 回傳 Runtime，其 _id 是 Runtime 的 ID
        // 但玩家端 API（unlock、verify-game-code）使用 Baseline ID 查詢
        id: characterId,
        gameId: character.gameId.toString(),
        name: character.name,
        description: character.description,
        slogan: character.slogan || undefined,
        imageUrl: character.imageUrl,
        hasPinLock: character.hasPinLock,
        publicInfo: character.publicInfo,
        // 只有已揭露的秘密才會回傳給玩家
        secretInfo: revealedSecrets.length > 0
          ? { secrets: revealedSecrets }
          : undefined,
        tasks: visibleTasks,
        items: cleanItems,
        stats: cleanStats,
        skills: cleanSkills,
        isGameActive: game?.isActive ?? false, // Phase 10: 遊戲是否進行中
        gameCode: game?.isActive ? game.gameCode : undefined, // Phase 11.5: Runtime Banner 用
        randomContestMaxValue, // Phase 7.6: 隨機對抗檢定上限值
        temporaryEffects: activeTemporaryEffects, // Phase 8: 時效性效果
        pendingEvents, // Phase 9: 離線事件佇列
        baselineData, // Phase 10: 唯讀預覽模式用 Baseline 快照
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
      },
    };
  } catch (error) {
    console.error('Error fetching public character:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得角色資料',
    };
  }
}

/**
 * 取得劇本公開資訊（玩家端使用）
 * 包含世界觀 blocks 和角色列表（名稱 + 描述 + 頭像）
 */
export async function getPublicGame(
  gameId: string
): Promise<ApiResponse<GamePublicData>> {
  try {
    await dbConnect();

    const [game, characters] = await Promise.all([
      Game.findById(gameId).lean(),
      Character.find({ gameId }).select('_id name description imageUrl').sort({ name: 1 }).lean(),
    ]);

    if (!game) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此劇本',
      };
    }

    return {
      success: true,
      data: {
        id: game._id.toString(),
        name: game.name,
        description: game.description,
        publicInfo: game.publicInfo,
        characters: characters.map((char) => ({
          id: char._id.toString(),
          name: char.name,
          description: char.description || '',
          imageUrl: char.imageUrl,
        })),
      },
    };
  } catch (error) {
    console.error('Error fetching public game:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得劇本資料',
    };
  }
}

/**
 * Phase 4.5: 取得同劇本內的其他角色列表（用於道具轉移）
 * 只回傳基本資訊（id、name、imageUrl），排除當前角色
 */
export interface TransferTargetCharacter {
  id: string;
  name: string;
  imageUrl?: string;
}

export async function getTransferTargets(
  gameId: string,
  excludeCharacterId: string
): Promise<ApiResponse<TransferTargetCharacter[]>> {
  try {
    await dbConnect();

    // 取得同劇本內的所有角色（排除當前角色）
    const characters = await Character.find({
      gameId,
      _id: { $ne: excludeCharacterId },
    })
      .select('_id name imageUrl')
      .sort({ name: 1 })
      .lean();

    return {
      success: true,
      data: characters.map((char) => ({
        id: char._id.toString(),
        name: char.name,
        imageUrl: char.imageUrl,
      })),
    };
  } catch (error) {
    console.error('Error fetching transfer targets:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得角色列表',
    };
  }
}

/**
 * Phase 7: 取得目標角色的道具清單（用於 item_take 和 item_steal 效果）
 * 只回傳基本資訊（id、name、quantity），用於選擇目標道具
 */
export interface TargetItemInfo {
  id: string;
  name: string;
  quantity: number;
}

export async function getTargetCharacterItems(
  targetCharacterId: string
): Promise<ApiResponse<TargetItemInfo[]>> {
  try {
    await dbConnect();

    // Phase 10.4: 使用統一的讀取函數（自動判斷 Baseline/Runtime）
    const character = await getCharacterData(targetCharacterId);

    const items = character.items || [];
    const cleanItems = cleanItemData(items);

    return {
      success: true,
      data: cleanItems.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
      })),
    };
  } catch (error) {
    console.error('Error fetching target character items:', error);
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: '無法取得目標角色的道具清單',
    };
  }
}

