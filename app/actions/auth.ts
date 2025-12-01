'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import {
  generateMagicLinkToken,
  sendMagicLinkEmail,
  verifyMagicLinkToken,
} from '@/lib/auth/magic-link';
import { GMUser } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';
import type { ApiResponse } from '@/types/api';

/**
 * Email 驗證 Schema
 */
const emailSchema = z.string().email('請輸入有效的 Email 地址');

/**
 * 發送 Magic Link
 * @param email GM Email
 */
export async function sendMagicLink(
  email: string
): Promise<ApiResponse<undefined>> {
  try {
    // 驗證 Email 格式
    const validatedEmail = emailSchema.parse(email.toLowerCase().trim());

    // 生成 Token
    const token = await generateMagicLinkToken(validatedEmail);

    // 發送 Email
    await sendMagicLinkEmail(validatedEmail, token);

    return {
      success: true,
      message: '登入連結已發送至您的信箱，請檢查您的收件匣',
    };
  } catch (error) {
    console.error('Error sending magic link:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'INVALID_EMAIL',
        message: '請輸入有效的 Email 地址',
      };
    }

    // 開發模式下顯示詳細錯誤訊息
    const errorMessage = error instanceof Error ? error.message : '未知錯誤';
    const isDevelopment = process.env.NODE_ENV !== 'production';

    return {
      success: false,
      error: 'SEND_FAILED',
      message: isDevelopment
        ? `無法發送登入連結：${errorMessage}`
        : '無法發送登入連結，請稍後再試',
    };
  }
}

/**
 * 驗證 Magic Link Token 並建立 Session
 * @param token Magic Link Token
 */
export async function verifyMagicLink(
  token: string
): Promise<ApiResponse<undefined>> {
  try {
    // 驗證 Token
    const email = await verifyMagicLinkToken(token);

    if (!email) {
      return {
        success: false,
        error: 'INVALID_TOKEN',
        message: '登入連結無效或已過期',
      };
    }

    // 確保資料庫連線
    await dbConnect();

    // 查詢或建立 GM User
    let gmUser = await GMUser.findOne({ email });

    if (!gmUser) {
      // 首次登入，建立新 GM User
      gmUser = await GMUser.create({
        email,
        displayName: email.split('@')[0], // 預設使用 Email 前綴作為顯示名稱
      });
    } else {
      // 更新最後登入時間
      gmUser.lastLoginAt = new Date();
      await gmUser.save();
    }

    // 建立 Session
    const session = await getSession();
    session.gmUserId = gmUser._id.toString();
    session.email = gmUser.email;
    session.isLoggedIn = true;
    await session.save();

    return {
      success: true,
      message: '登入成功',
    };
  } catch (error) {
    console.error('Error verifying magic link:', error);
    return {
      success: false,
      error: 'VERIFY_FAILED',
      message: '驗證失敗，請稍後再試',
    };
  }
}

/**
 * 登出
 */
export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect('/auth/login');
}

/**
 * 取得當前已登入的 GM User 資料
 */
export async function getCurrentGMUser() {
  try {
    const session = await getSession();

    if (!session.isLoggedIn || !session.gmUserId) {
      return null;
    }

    await dbConnect();
    const gmUser = await GMUser.findById(session.gmUserId).lean();

    if (!gmUser) {
      return null;
    }

    return {
      id: gmUser._id.toString(),
      email: gmUser.email,
      displayName: gmUser.displayName,
      createdAt: gmUser.createdAt,
      lastLoginAt: gmUser.lastLoginAt,
    };
  } catch (error) {
    console.error('Error getting current GM user:', error);
    return null;
  }
}

