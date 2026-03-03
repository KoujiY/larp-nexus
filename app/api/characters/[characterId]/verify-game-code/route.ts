import { NextRequest, NextResponse } from 'next/server';
import { Character, Game } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';

interface RouteContext {
  params: Promise<{
    characterId: string;
  }>;
}

/**
 * POST /api/characters/[characterId]/verify-game-code
 * 驗證 Game Code 是否屬於此角色的遊戲
 *
 * Phase 10: 用於 PIN 解鎖頁面，區分完整互動與唯讀預覽
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { characterId } = await context.params;
    const body = await request.json();
    const { gameCode } = body;

    // 驗證輸入
    if (!gameCode || typeof gameCode !== 'string') {
      return NextResponse.json(
        { success: false, message: '請輸入遊戲代碼' },
        { status: 400 }
      );
    }

    await dbConnect();

    // 查詢角色取得 gameId
    const character = await Character.findById(characterId).select('gameId').lean();
    if (!character) {
      return NextResponse.json(
        { success: false, message: '角色不存在' },
        { status: 404 }
      );
    }

    // 查詢遊戲的 gameCode 和 isActive
    const game = await Game.findById(character.gameId).select('gameCode isActive').lean();
    if (!game) {
      return NextResponse.json(
        { success: false, message: '遊戲不存在' },
        { status: 404 }
      );
    }

    // 比對 Game Code（不區分大小寫）
    const isMatch = game.gameCode?.toUpperCase() === gameCode.trim().toUpperCase();

    if (!isMatch) {
      return NextResponse.json(
        { success: false, message: '遊戲代碼不正確' },
        { status: 401 }
      );
    }

    // Phase 10: 檢查遊戲是否已開始
    // Game Code 正確但遊戲尚未開始時，回傳特定狀態讓前端區分
    if (!game.isActive) {
      return NextResponse.json({
        success: false,
        message: '遊戲尚未開始，請等待 GM 開始遊戲後再試',
        gameNotStarted: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: '遊戲代碼驗證成功',
    });
  } catch (error) {
    console.error('Error verifying game code:', error);
    return NextResponse.json(
      { success: false, message: '伺服器錯誤' },
      { status: 500 }
    );
  }
}
