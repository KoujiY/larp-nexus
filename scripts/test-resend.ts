import { resolve } from 'path';
import { config } from 'dotenv';
import { Resend } from 'resend';

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  config({ path: resolve(process.cwd(), '.env.local') });
}

console.log('🔍 測試 Resend 配置...\n');

// 檢查環境變數
console.log('1️⃣ 檢查環境變數：');
const apiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

if (!apiKey) {
  console.error('   ❌ RESEND_API_KEY 未設定');
  process.exit(1);
}

if (!emailFrom) {
  console.error('   ❌ EMAIL_FROM 未設定');
  process.exit(1);
}

console.log(`   ✅ RESEND_API_KEY: ${apiKey.substring(0, 10)}...`);
console.log(`   ✅ EMAIL_FROM: ${emailFrom}\n`);

// 測試 Resend 連線
console.log('2️⃣ 測試發送郵件：');
console.log('   請輸入您要測試發送的 Email 地址（按 Ctrl+C 取消）');

// 從命令列參數取得 Email
const testEmail = process.argv[2];

if (!testEmail) {
  console.log('\n   使用方式：pnpm test:resend your@email.com');
  console.log('   或者：tsx scripts/test-resend.ts your@email.com\n');
  process.exit(0);
}

console.log(`   目標 Email: ${testEmail}`);
console.log('   發送中...\n');

const resend = new Resend(apiKey);

async function sendTestEmail() {
  // TypeScript 類型保護：確保變數不是 undefined
  if (!emailFrom || !testEmail) {
    console.error('❌ 缺少必要參數');
    return;
  }

  try {
    const result = await resend.emails.send({
      from: emailFrom,
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
            <p>如果您收到這封郵件，代表 Resend 配置正確！</p>
            <p>現在可以使用 Magic Link 登入功能了。</p>
            <hr>
            <p style="color: #999; font-size: 12px;">這是一封測試郵件</p>
          </body>
        </html>
      `,
    });

    console.log('✅ 郵件發送成功！\n');
    console.log('   Email ID:', result.data?.id);
    console.log('\n📧 請檢查您的信箱（包含垃圾郵件）');
    console.log('\n⚠️ 重要提醒：');
    console.log('   如果使用 onboarding@resend.dev，只能發送給註冊 Resend 的 Email');
    console.log('\n✅ Resend 配置正確！可以使用 Magic Link 登入功能了。\n');
  } catch (error) {
    console.error('❌ 郵件發送失敗\n');
    console.error('錯誤訊息：', (error as Error).message);
    
    if ((error as Error).message.includes('API key')) {
      console.error('\n💡 可能原因：API Key 無效');
      console.error('   請檢查 .env.local 中的 RESEND_API_KEY 是否正確');
    } else if ((error as Error).message.includes('from')) {
      console.error('\n💡 可能原因：Email From 地址未驗證');
      console.error('   請在 Resend Dashboard 驗證您的 Domain');
    } else if ((error as Error).message.includes('to')) {
      console.error('\n💡 可能原因：收件人 Email 受限');
      console.error('   使用 onboarding@resend.dev 只能發送給註冊 Resend 的 Email');
    }
    
    process.exitCode = 1;
  }
}

sendTestEmail();

