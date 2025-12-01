import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from 'dotenv';
import { resolve } from 'path';

// 載入 .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const execPromise = promisify(exec);

console.log('🚀 開始 Phase 1 驗證...\n');

async function runTest(name: string, command: string) {
  console.log(`⏳ ${name}...`);
  try {
    const { stdout } = await execPromise(command);
    console.log(`✅ ${name} - 通過`);
    if (stdout) console.log(stdout);
    return true;
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    console.log(`❌ ${name} - 失敗`);
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.log(err.stderr);
    return false;
  }
}

async function verify() {
  const results = [];
  
  console.log('📋 執行驗證測試...\n');
  
  // 1. TypeScript 類型檢查
  results.push(await runTest('TypeScript 類型檢查', 'pnpm type-check'));
  console.log('');
  
  // 2. ESLint 檢查
  results.push(await runTest('ESLint 檢查', 'pnpm lint'));
  console.log('');
  
  // 3. MongoDB 連線測試
  results.push(await runTest('MongoDB 連線測試', 'pnpm test:connection'));
  console.log('');
  
  // 統計結果
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('='.repeat(50));
  console.log(`\n📊 驗證結果: ${passed}/${total} 項測試通過\n`);
  
  if (passed === total) {
    console.log('🎉 Phase 1 驗證全部通過！');
    console.log('✨ 可以開始 Phase 2 開發了！\n');
    process.exit(0);
  } else {
    console.log('⚠️  部分測試失敗，請檢查上方錯誤訊息\n');
    process.exit(1);
  }
}

verify();

