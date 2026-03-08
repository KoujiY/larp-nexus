import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import { MagicLink } from '@/lib/db/models';
import dbConnect from '@/lib/db/mongodb';

/**
 * 建立 Nodemailer SMTP transporter（Gmail SMTP）
 * 使用環境變數 SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * 生成 Magic Link Token 並儲存至資料庫
 * @param email GM Email
 * @returns token string
 */
export async function generateMagicLinkToken(email: string): Promise<string> {
  await dbConnect();

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // 清除該 Email 的舊 Token（可選，但建議清理）
  await MagicLink.deleteMany({ email, used: false });

  // 建立新 Token
  await MagicLink.create({
    email,
    token,
    expiresAt,
    used: false,
  });

  return token;
}

/**
 * 驗證 Magic Link Token
 * @param token UUID token
 * @returns email or null
 */
export async function verifyMagicLinkToken(
  token: string
): Promise<string | null> {
  await dbConnect();

  const magicLink = await MagicLink.findOne({
    token,
    used: false,
    expiresAt: { $gt: new Date() },
  });

  if (!magicLink) {
    return null;
  }

  // 標記為已使用
  magicLink.used = true;
  await magicLink.save();

  return magicLink.email;
}

/**
 * 發送 Magic Link Email
 * @param email GM Email
 * @param token Magic Link Token
 */
export async function sendMagicLinkEmail(
  email: string,
  token: string
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const magicLink = `${appUrl}/auth/verify?token=${token}`;

  const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || '';

  const transporter = createTransporter();
  await transporter.sendMail({
    from: emailFrom,
    to: email,
    subject: 'LARP Nexus - 登入連結',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🎭 LARP Nexus</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">歡迎回來！</h2>
            <p style="font-size: 16px; color: #555;">
              點擊下方按鈕即可登入您的 GM 帳號：
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${magicLink}" 
                 style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                🔐 立即登入
              </a>
            </div>
            
            <p style="font-size: 14px; color: #888;">
              或複製以下連結到瀏覽器：<br>
              <a href="${magicLink}" style="color: #667eea; word-break: break-all;">${magicLink}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            
            <p style="font-size: 13px; color: #999; margin-bottom: 0;">
              ⏱️ 此連結將於 <strong>15 分鐘後</strong>失效<br>
              ⚠️ 如果您沒有要求此登入連結，請忽略此郵件
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; padding: 20px; color: #999; font-size: 12px;">
            <p>LARP Nexus - GM/玩家輔助系統</p>
          </div>
        </body>
      </html>
    `,
  });
}

/**
 * 檢查 SMTP 是否已設定
 * @returns 是否有完整的 SMTP 配置
 */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * 清理過期的 Magic Link Token（建議定期執行）
 */
export async function cleanupExpiredTokens(): Promise<void> {
  await dbConnect();
  await MagicLink.deleteMany({
    expiresAt: { $lt: new Date() },
  });
}

