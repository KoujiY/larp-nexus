import { NextRequest, NextResponse } from 'next/server';
import { getPublicGame } from '@/app/actions/public';

interface RouteContext {
  params: Promise<{
    gameId: string;
  }>;
}

/**
 * GET /api/games/[gameId]/public
 * 取得劇本公開資訊（世界觀、前導故事、章節）
 * 所有玩家可訪問，無需認證
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { gameId } = await context.params;

    const result = await getPublicGame(gameId);

    if (!result.success || !result.data) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          message: result.message || '找不到此劇本',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('Error fetching public game:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'FETCH_FAILED',
        message: '無法取得劇本資料',
      },
      { status: 500 }
    );
  }
}

