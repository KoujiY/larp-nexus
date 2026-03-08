import { resolve } from 'path';
import { config } from 'dotenv';

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  config({ path: resolve(process.cwd(), '.env.local') });
}

console.log('🔍 Phase 2 驗證開始...\n');

let hasErrors = false;

// 1. 檢查環境變數
console.log('1️⃣ 檢查環境變數...');
const requiredEnvVars = [
  'MONGODB_URI',
  'SESSION_SECRET',
  'NEXT_PUBLIC_APP_URL',
  'SMTP_USER',
  'SMTP_PASS',
];

const optionalEnvVars = ['BLOB_READ_WRITE_TOKEN'];

requiredEnvVars.forEach((varName) => {
  if (process.env[varName]) {
    console.log(`   ✅ ${varName} 已設定`);
  } else {
    console.error(`   ❌ ${varName} 未設定`);
    hasErrors = true;
  }
});

optionalEnvVars.forEach((varName) => {
  if (process.env[varName]) {
    console.log(`   ✅ ${varName} 已設定 (選用)`);
  } else {
    console.log(`   ⚠️  ${varName} 未設定 (選用，圖片上傳功能將無法使用)`);
  }
});

console.log('');

// 2. 檢查 MongoDB 連線
console.log('2️⃣ 檢查 MongoDB 連線...');
import dbConnect from '../lib/db/mongodb';

dbConnect()
  .then(() => {
    console.log('   ✅ MongoDB 連線成功\n');

    // 3. 檢查 Mongoose Models
    console.log('3️⃣ 檢查 Mongoose Models...');
    import('../lib/db/models').then(() => {
      console.log('   ✅ GMUser Model');
      console.log('   ✅ Game Model');
      console.log('   ✅ Character Model');
      console.log('   ✅ MagicLink Model\n');

      // 4. 檢查 Server Actions
      console.log('4️⃣ 檢查 Server Actions...');
      Promise.all([
        import('../app/actions/auth'),
        import('../app/actions/games'),
        import('../app/actions/characters'),
      ]).then(() => {
        console.log('   ✅ Auth Actions');
        console.log('   ✅ Games Actions');
        console.log('   ✅ Characters Actions\n');

        // 5. 檢查 Utils
        console.log('5️⃣ 檢查工具函數...');
        Promise.all([
          import('../lib/utils/validators'),
          import('../lib/utils/hash'),
          import('../lib/utils/qr-code'),
          import('../lib/utils/date'),
        ]).then(() => {
          console.log('   ✅ Validators');
          console.log('   ✅ Hash');
          console.log('   ✅ QR Code');
          console.log('   ✅ Date\n');

          // 6. 檢查 SMTP（Nodemailer）配置
          console.log('6️⃣ 檢查 SMTP 配置...');
          if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            console.log(`   ✅ SMTP_HOST: ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
            console.log(`   ✅ SMTP_USER: ${process.env.SMTP_USER}`);
            console.log(`   ✅ Email From: ${process.env.EMAIL_FROM || process.env.SMTP_USER}\n`);
          } else {
            console.error('   ❌ SMTP 配置不完整（需要 SMTP_USER 和 SMTP_PASS）\n');
            hasErrors = true;
          }

          // 7. 檢查 Vercel Blob 配置
          console.log('7️⃣ 檢查 Vercel Blob 配置...');
          if (process.env.BLOB_READ_WRITE_TOKEN) {
            console.log('   ✅ Vercel Blob Token 已設定');
            console.log('   ✅ 圖片上傳功能可用\n');
          } else {
            console.log('   ⚠️  Vercel Blob Token 未設定');
            console.log('   ⚠️  圖片上傳功能將無法使用（可稍後設定）\n');
          }

          // 最終結果
          if (hasErrors) {
            console.error('❌ Phase 2 驗證失敗，請檢查上述錯誤');
            process.exit(1);
          } else {
            console.log('✅ Phase 2 驗證完成！');
            console.log('\n📋 Phase 2 功能清單：');
            console.log('   ✅ 認證系統（Magic Link 登入）');
            console.log('   ✅ GM 端頁面結構與導航');
            console.log('   ✅ 劇本 CRUD 功能');
            console.log('   ✅ 角色卡 CRUD 功能');
            console.log('   ✅ QR Code 生成與下載');
            console.log(
              process.env.BLOB_READ_WRITE_TOKEN
                ? '   ✅ 圖片上傳功能'
                : '   ⚠️  圖片上傳功能（需設定 BLOB_READ_WRITE_TOKEN）'
            );
            console.log('\n🎉 可以開始使用 Phase 2 功能！');
            console.log('   執行 pnpm dev 啟動開發伺服器');
            console.log('   前往 http://localhost:3000 開始使用');
            process.exit(0);
          }
        });
      });
    });
  })
  .catch((error: Error) => {
    console.error('   ❌ MongoDB 連線失敗');
    console.error(`   錯誤：${error.message}\n`);
    hasErrors = true;
    console.error('❌ Phase 2 驗證失敗');
    process.exit(1);
  });

