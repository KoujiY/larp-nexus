import dbConnect from '@/lib/db/mongodb';
import Character from '@/lib/db/models/Character';

/**
 * Phase 10.4.5: 根據 PIN 查詢所有角色（只查詢 Baseline）
 *
 * 使用場景：
 * - 玩家只輸入 PIN（沒有 Game Code）時，顯示所有使用該 PIN 的角色列表
 * - 用於玩家預覽或選擇角色
 *
 * 設計說明：
 * - 只查詢 Baseline Character（不查詢 Runtime），因為需要跨多個遊戲查詢
 * - 同一 PIN 可能對應多個遊戲的不同角色（PIN 只在同遊戲內唯一）
 * - 返回簡化的角色資訊（characterId, characterName, gameId, gameName）
 *
 * @param pin - 角色 PIN 碼
 * @returns 所有匹配的角色列表
 */
export async function getCharactersByPinOnly(
  pin: string
): Promise<
  Array<{
    characterId: string;
    characterName: string;
    gameId: string;
    gameName: string;
  }>
> {
  await dbConnect();

  // 查詢所有匹配的 Baseline Character，並 populate Game 資料
  const characters = await Character.find({ pin: pin.trim() })
    .populate('gameId', 'name') // 只取得 Game 的 name 欄位
    .select('_id name gameId') // 只選擇需要的欄位
    .lean();

  // 轉換為簡化的格式
  return characters.map((char) => {
    // 處理 populate 後的 gameId（可能是物件或 ObjectId）
    const game = char.gameId as unknown as { _id: string; name: string } | undefined;

    return {
      characterId: char._id.toString(),
      characterName: char.name,
      gameId: game?._id?.toString() || char.gameId.toString(),
      gameName: game?.name || '未知遊戲',
    };
  });
}
