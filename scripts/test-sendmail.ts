import { resolve } from 'path';
import { config } from 'dotenv';
import nodemailer from 'nodemailer';

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  config({ path: resolve(process.cwd(), '.env.local') });
}

console.log('🔍 測試 SMTP（Nodemailer）配置...\n');

// 檢查環境變數
console.log('1️⃣ 檢查環境變數：');
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = process.env.SMTP_PORT || '465';
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const emailFrom = process.env.EMAIL_FROM;

if (!smtpUser) {
  console.error('   ❌ SMTP_USER 未設定');
  process.exit(1);
}

if (!smtpPass) {
  console.error('   ❌ SMTP_PASS 未設定');
  process.exit(1);
}

console.log(`   ✅ SMTP_HOST: ${smtpHost}`);
console.log(`   ✅ SMTP_PORT: ${smtpPort}`);
console.log(`   ✅ SMTP_USER: ${smtpUser}`);
console.log(`   ✅ SMTP_PASS: ${'*'.repeat(8)}`);
console.log(`   ✅ EMAIL_FROM: ${emailFrom || smtpUser}\n`);

// 從命令列參數取得 Email
const testEmail = process.argv[2];

if (!testEmail) {
  console.log('   使用方式：pnpm test:sendmail your@email.com');
  console.log('   或者：tsx scripts/test-sendmail.ts your@email.com\n');
  process.exit(0);
}

console.log('2️⃣ 測試發送郵件：');
console.log(`   目標 Email: ${testEmail}`);
console.log('   發送中...\n');

/**
 * 發送測試郵件
 */
async function sendTestEmail() {
  if (!smtpUser || !smtpPass) {
    console.error('❌ 缺少必要參數');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: true,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  try {
    const result = await transporter.sendMail({
      from: emailFrom || smtpUser,
      to: testEmail,
      subject: 'LARP Nexus - 測試郵件',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
          </head>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h1>🎭 LARP Nexus 測試郵件</h1>
            <p>如果您收到這封郵件，代表 SMTP（Nodemailer）配置正確！</p>
            <p>現在可以使用 Magic Link 登入功能了。</p>
            <hr>
            <p style="color: #999; font-size: 12px;">這是一封測試郵件</p>
          </body>
        </html>
      `,
    });

    console.log('✅ 郵件發送成功！\n');
    console.log('   Message ID:', result.messageId);
    console.log('\n📧 請檢查您的信箱（包含垃圾郵件）');
    console.log('\n✅ SMTP 配置正確！可以使用 Magic Link 登入功能了。\n');
  } catch (error) {
    console.error('❌ 郵件發送失敗\n');
    console.error('錯誤訊息：', (error as Error).message);

    if ((error as Error).message.includes('auth')) {
      console.error('\n💡 可能原因：SMTP 認證失敗');
      console.error('   請確認 SMTP_USER 和 SMTP_PASS 是否正確');
      console.error('   Gmail 需使用 App Password（應用程式密碼）');
    } else if ((error as Error).message.includes('connect')) {
      console.error('\n💡 可能原因：無法連線到 SMTP 伺服器');
      console.error('   請確認 SMTP_HOST 和 SMTP_PORT 是否正確');
    }

    process.exitCode = 1;
  }
}

sendTestEmail();
