'use server';

import dbConnect from '@/lib/db/mongodb';
import { getCharacterData } from '@/lib/game/get-character-data';
import { emitItemShowcased, emitRoleUpdated } from '@/lib/websocket/events';
import { executeAutoReveal } from '@/lib/reveal/auto-reveal-evaluator';
import type { ApiResponse } from '@/types/api';

/**
 * Phase 7.7: 展示道具給其他角色
 *
 * 展示方選擇道具和目標角色 → 被展示方收到唯讀道具 Dialog。
 * 同時記錄被展示方的 viewedItems，觸發自動揭露評估。
 *
 * Phase 11: 使用 getCharacterData 自動判斷 Baseline/Runtime，
 * 確保遊戲進行中讀取和寫入 Runtime 資料。
 *
 * @param characterId - 展示方角色 ID（Baseline ID）
 * @param itemId - 要展示的道具 ID
 * @param targetCharacterId - 被展示方角色 ID（Baseline ID）
 */
export async function showcaseItem(
  characterId: string,
  itemId: string,
  targetCharacterId: string
): Promise<ApiResponse<{
  showcased: boolean;
  revealTriggered?: boolean;
  revealedCount?: number;
}>> {
  try {
    await dbConnect();

    // 1. 驗證展示方角色存在（自動判斷 Baseline/Runtime）
    let character;
    try {
      character = await getCharacterData(characterId);
    } catch {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到展示方角色',
      };
    }

    // 2. 找到要展示的道具（從 Runtime 道具清單中查找）
    const items = character.items || [];
    const item = items.find((i: { id: string }) => i.id === itemId);
    if (!item) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此道具',
      };
    }

    // 3. 驗證不是展示給自己
    if (characterId === targetCharacterId) {
      return {
        success: false,
        error: 'SELF_TARGET',
        message: '不能展示給自己',
      };
    }

    // 4. 驗證目標角色存在且在同一劇本（自動判斷 Baseline/Runtime）
    let targetCharacter;
    try {
      targetCharacter = await getCharacterData(targetCharacterId);
    } catch {
      return {
        success: false,
        error: 'INVALID_TARGET',
        message: '目標角色不存在',
      };
    }

    if (character.gameId.toString() !== targetCharacter.gameId.toString()) {
      return {
        success: false,
        error: 'INVALID_TARGET',
        message: '目標角色不在同一劇本內',
      };
    }

    // 5. 記錄被展示方的 viewedItems（去重：同一 itemId + sourceCharacterId 不重複）
    // Phase 11: 直接修改 document 再 save，確保寫入正確的 collection（Baseline 或 Runtime）
    const existingViewedItems = targetCharacter.viewedItems || [];
    const alreadyViewed = existingViewedItems.some(
      (v: { itemId: string; sourceCharacterId: string }) =>
        v.itemId === itemId && v.sourceCharacterId === characterId
    );

    if (!alreadyViewed) {
      const viewedItems = [...existingViewedItems, {
        itemId,
        sourceCharacterId: characterId,
        viewedAt: new Date(),
      }];
      targetCharacter.set('viewedItems', viewedItems);
      targetCharacter.markModified('viewedItems');
      await targetCharacter.save();
    }

    // 6. 無論是否已記錄，都重新評估自動揭露條件（針對被展示方）
    //    （GM 可能已將揭露狀態重設為未揭露，需要重新觸發）
    const revealResults = await executeAutoReveal(targetCharacterId, {
      type: 'items_viewed',
      itemIds: [itemId],
    });

    // 7. 發送 item.showcased 事件給雙方
    const showcasePayload = {
      fromCharacterId: characterId,
      fromCharacterName: character.name,
      toCharacterId: targetCharacterId,
      toCharacterName: targetCharacter.name,
      item: {
        id: item.id,
        name: item.name,
        description: item.description || '',
        imageUrl: item.imageUrl,
        type: item.type as 'consumable' | 'equipment',
        quantity: item.quantity,
        tags: item.tags,
      },
    };

    emitItemShowcased(characterId, targetCharacterId, showcasePayload).catch(
      (error) => console.error('[item-showcase] Failed to emit item.showcased', error)
    );

    // 8. 若有觸發揭露，也發送 role.updated 事件讓前端刷新資料
    if (revealResults.length > 0) {
      emitRoleUpdated(targetCharacterId, {
        characterId: targetCharacterId,
        updates: {},
      }).catch((error) =>
        console.error('[item-showcase] Failed to emit role.updated after reveal', error)
      );
    }

    return {
      success: true,
      data: {
        showcased: true,
        revealTriggered: revealResults.length > 0,
        revealedCount: revealResults.length,
      },
      message: `已向 ${targetCharacter.name} 展示了「${item.name}」`,
    };
  } catch (error) {
    console.error('[item-showcase] Error showcasing item:', error);
    return {
      success: false,
      error: 'SHOWCASE_FAILED',
      message: `無法展示道具：${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}

/**
 * Phase 7.7: 記錄角色自行檢視道具
 *
 * 玩家點開自己的道具詳情 Dialog 時呼叫（fire-and-forget，不阻塞 UI）。
 * 記錄 viewedItems 後觸發自動揭露評估。
 *
 * Phase 11: 使用 getCharacterData 自動判斷 Baseline/Runtime，
 * 確保遊戲進行中讀取和寫入 Runtime 資料。
 *
 * @param characterId - 檢視方角色 ID（Baseline ID）
 * @param itemId - 被檢視的道具 ID
 */
export async function recordItemView(
  characterId: string,
  itemId: string
): Promise<ApiResponse<{
  recorded: boolean;
  revealTriggered?: boolean;
  revealedCount?: number;
}>> {
  try {
    await dbConnect();

    // 1. 驗證角色存在（自動判斷 Baseline/Runtime）
    let character;
    try {
      character = await getCharacterData(characterId);
    } catch {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此角色',
      };
    }

    // 2. 驗證道具存在（從 Runtime 道具清單中查找）
    const items = character.items || [];
    const item = items.find((i: { id: string }) => i.id === itemId);
    if (!item) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '找不到此道具',
      };
    }

    // 3. 去重：同一 itemId 不重複記錄（self-view 只關心是否「看過」）
    const existingViewedItems = character.viewedItems || [];
    const alreadyViewed = existingViewedItems.some(
      (v: { itemId: string }) => v.itemId === itemId
    );

    // 4. 僅在首次檢視時記錄 viewedItems（避免重複寫入 DB）
    // Phase 11: 直接修改 document 再 save，確保寫入正確的 collection
    if (!alreadyViewed) {
      const viewedItems = [...existingViewedItems, {
        itemId,
        sourceCharacterId: characterId,
        viewedAt: new Date(),
      }];
      character.set('viewedItems', viewedItems);
      character.markModified('viewedItems');
      await character.save();
    }

    // 5. 無論是否已記錄，都重新評估自動揭露條件
    //    （GM 可能已將揭露狀態重設為未揭露，需要重新觸發）
    const revealResults = await executeAutoReveal(characterId, {
      type: 'items_viewed',
      itemIds: [itemId],
    });

    // 6. 若有觸發揭露，發送 role.updated 事件讓前端刷新資料
    if (revealResults.length > 0) {
      emitRoleUpdated(characterId, {
        characterId,
        updates: {},
      }).catch((error) =>
        console.error('[item-showcase] Failed to emit role.updated after self-view reveal', error)
      );
    }

    return {
      success: true,
      data: {
        recorded: !alreadyViewed,
        revealTriggered: revealResults.length > 0,
        revealedCount: revealResults.length,
      },
    };
  } catch (error) {
    console.error('[item-showcase] Error recording item view:', error);
    return {
      success: false,
      error: 'RECORD_FAILED',
      message: `無法記錄道具檢視：${error instanceof Error ? error.message : '未知錯誤'}`,
    };
  }
}
