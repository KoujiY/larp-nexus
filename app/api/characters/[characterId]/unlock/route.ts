import { NextRequest, NextResponse } from 'next/server';
import { Character } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { PIN_REGEX, PIN_ERROR_MESSAGE } from '@/lib/character/character-validator';

interface RouteContext {
  params: Promise<{
    characterId: string;
  }>;
}

/**
 * POST /api/characters/[characterId]/unlock
 * 驗證 PIN 碼並返回解鎖結果
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { characterId } = await context.params;
    const body = await request.json();
    const { pin } = body;

    // 驗證輸入
    if (!pin || typeof pin !== 'string') {
      return NextResponse.json(
        { success: false, message: '請輸入 PIN 碼' },
        { status: 400 }
      );
    }

    if (!PIN_REGEX.test(pin)) {
      return NextResponse.json(
        { success: false, message: PIN_ERROR_MESSAGE },
        { status: 400 }
      );
    }

    // 連接資料庫
    await dbConnect();

    // 查詢角色
    const character = await Character.findById(characterId);

    if (!character) {
      return NextResponse.json(
        { success: false, message: '角色不存在' },
        { status: 404 }
      );
    }

    // 檢查是否需要 PIN
    if (!character.hasPinLock) {
      return NextResponse.json({
        success: true,
        message: '此角色無需解鎖',
      });
    }

    // 驗證 PIN
    if (!character.pin) {
      return NextResponse.json(
        { success: false, message: '角色 PIN 未設定' },
        { status: 500 }
      );
    }

    // 簡單字串比對（明文比對）
    if (pin !== character.pin) {
      return NextResponse.json(
        { success: false, message: 'PIN 碼錯誤' },
        { status: 401 }
      );
    }

    // PIN 正確：將 characterId 寫入 session，供 Server Action（useItem / useSkill / transferItem）授權驗證
    const session = await getSession();
    const existing = session.unlockedCharacterIds ?? [];
    if (!existing.includes(characterId)) {
      session.unlockedCharacterIds = [...existing, characterId];
      await session.save();
    }

    return NextResponse.json({
      success: true,
      message: '解鎖成功',
    });
  } catch (error) {
    console.error('Error unlocking character:', error);
    return NextResponse.json(
      { success: false, message: '伺服器錯誤' },
      { status: 500 }
    );
  }
}

