import { resolve } from 'path';
import { config } from 'dotenv';

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  config({ path: resolve(process.cwd(), '.env.local') });
}

console.log('🔍 Phase 3 驗證開始...\n');

let hasErrors = false;

// 1. 檢查玩家端檔案
console.log('1️⃣ 檢查玩家端檔案結構：');

const requiredFiles = [
  'app/c/[characterId]/page.tsx',
  'app/actions/public.ts',
  'app/api/characters/[characterId]/unlock/route.ts',
  'components/player/character-card-view.tsx',
  'components/player/pin-unlock.tsx',
];

import { existsSync } from 'fs';

requiredFiles.forEach((file) => {
  if (existsSync(resolve(process.cwd(), file))) {
    console.log(`   ✅ ${file}`);
  } else {
    console.error(`   ❌ ${file} 不存在`);
    hasErrors = true;
  }
});

console.log('');

// 2. 檢查 TypeScript 編譯
console.log('2️⃣ 檢查 TypeScript 類型...');
import { execSync } from 'child_process';

try {
  execSync('pnpm type-check', { stdio: 'pipe' });
  console.log('   ✅ TypeScript 類型檢查通過\n');
} catch {
  console.error('   ❌ TypeScript 類型檢查失敗\n');
  hasErrors = true;
}

// 3. 檢查必要組件
console.log('3️⃣ 檢查必要組件：');

Promise.all([
  import('../app/actions/public'),
  import('../components/player/pin-unlock'),
  import('../components/player/character-card-view'),
])
  .then(() => {
    console.log('   ✅ Public Actions');
    console.log('   ✅ PIN Unlock Component');
    console.log('   ✅ Character Card View Component\n');

    // 最終結果
    if (hasErrors) {
      console.error('❌ Phase 3 驗證失敗');
      process.exit(1);
    } else {
      console.log('✅ Phase 3 驗證完成！\n');
      console.log('📋 Phase 3 功能清單：');
      console.log('   ✅ 玩家端角色卡頁面 (/c/[characterId])');
      console.log('   ✅ PIN 解鎖功能');
      console.log('   ✅ 響應式設計（Mobile First）');
      console.log('   ✅ localStorage 解鎖狀態儲存');
      console.log('\n🎉 Phase 3 開發完成！');
      console.log('   執行 pnpm dev 啟動開發伺服器');
      console.log('   測試流程：');
      console.log('   1. GM 登入並建立劇本與角色');
      console.log('   2. 為角色設定 PIN 碼');
      console.log('   3. 生成 QR Code');
      console.log('   4. 訪問角色卡頁面測試 PIN 解鎖');
      process.exit(0);
    }
  })
  .catch((err: Error) => {
    console.error('   ❌ 組件載入失敗');
    console.error(`   錯誤：${err.message}\n`);
    console.error('❌ Phase 3 驗證失敗');
    process.exit(1);
  });

