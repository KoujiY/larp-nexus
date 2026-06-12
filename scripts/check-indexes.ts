/**
 * Index 檢查 / 同步腳本（PERF_INCIDENT_2026-06 批 3）
 *
 * 用途：production / loadtest 關閉 autoIndex 後，schema 的 index 變更
 * 需要手動落地。本腳本比對「schema 宣告」與「DB 實際 index」，
 * 並可選擇性同步。
 *
 * 用法：
 *   pnpm check-indexes              # 僅報告差異（不動 DB）
 *   pnpm check-indexes --sync       # 對有差異的 model 執行 syncIndexes
 *   pnpm check-indexes --ci         # CI 模式：僅報告，有差異時 exit 1（擋 PR）
 *                                   # （--ci 優先於 --sync，CI 永不寫 DB）
 *
 * 指定目標 DB（預設讀 .env.local 的 MONGODB_URI）：
 *   $env:MONGODB_URI="<目標 URI>"; pnpm check-indexes
 *
 * ⚠️ --sync 行為說明（syncIndexes 的語意）：
 *   - 建立 schema 有宣告、DB 缺少的 index
 *   - **drop schema 未宣告的 index**（本專案以 schema 為 SSOT，屬預期行為；
 *     輸出會列出被 drop 的項目）
 *   - 同 key 不同選項（如普通 index → TTL）會先 drop 再重建
 *
 * 安全防護：建立 Character {gameId, pin} unique index 前，
 * 先檢查重複資料 —— 有重複時列出明細並跳過該 model 的同步。
 */

import mongoose from 'mongoose';
import { config } from 'dotenv';
import { resolve } from 'path';
import { findMissingIndexes, type ExistingIndex } from '../lib/db/index-check';
// 透過 barrel 註冊所有 model（schema 即 index 宣告的 SSOT）
import '../lib/db/models';

config({ path: resolve(process.cwd(), '.env.local') });

const CI = process.argv.includes('--ci');
// CI 模式永不寫 DB：--ci 存在時忽略 --sync
const SYNC = !CI && process.argv.includes('--sync');

/** 遮蔽 URI 中的密碼供輸出 */
function maskUri(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

/**
 * Character {gameId, pin} unique index 的前置查重
 *
 * @returns 重複的 (gameId, pin) 群組（空陣列 = 可安全建立）
 */
async function findDuplicateGamePins(): Promise<
  Array<{ gameId: string; pin: string; count: number; characterIds: string[] }>
> {
  const Character = mongoose.model('Character');
  const groups = await Character.aggregate([
    // 與 partialFilterExpression 相同的範圍：pin 為非空字串
    { $match: { pin: { $type: 'string', $gt: '' } } },
    {
      $group: {
        _id: { gameId: '$gameId', pin: '$pin' },
        count: { $sum: 1 },
        characterIds: { $push: '$_id' },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  return groups.map((g: {
    _id: { gameId: unknown; pin: string };
    count: number;
    characterIds: unknown[];
  }) => ({
    gameId: String(g._id.gameId),
    pin: g._id.pin,
    count: g.count,
    characterIds: g.characterIds.map(String),
  }));
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ 未設定 MONGODB_URI（.env.local 或環境變數）');
    process.exit(1);
  }

  // 顯式關閉 autoIndex：避免連線時 Mongoose 自動建 index，
  // 繞過本腳本的查重防護與差異報告
  await mongoose.connect(uri, { autoIndex: false, bufferCommands: false });
  const dbName = mongoose.connection.db?.databaseName;
  console.info(`🔗 目標：${maskUri(uri)}`);
  console.info(`📦 資料庫：${dbName}\n`);

  let totalProblems = 0;
  const modelsToSync: string[] = [];

  for (const name of mongoose.modelNames()) {
    const model = mongoose.model(name);
    const declared = model.schema.indexes() as Array<
      [Record<string, unknown>, Record<string, unknown> | undefined]
    >;
    if (declared.length === 0) continue;

    let existing: ExistingIndex[];
    try {
      existing = (await model.collection.listIndexes().toArray()) as ExistingIndex[];
    } catch {
      existing = []; // collection 尚不存在
    }

    const problems = findMissingIndexes(declared, existing);
    if (problems.length === 0) {
      console.info(`✅ ${model.collection.name}：index 與 schema 一致`);
      continue;
    }

    totalProblems += problems.length;
    console.warn(`⚠️ ${model.collection.name}：${problems.length} 項差異`);
    for (const p of problems) console.warn(`   - ${p}`);

    // Character 的 unique index 需要前置查重
    if (name === 'Character') {
      const duplicates = await findDuplicateGamePins();
      if (duplicates.length > 0) {
        console.error(
          `   ❌ 偵測到 ${duplicates.length} 組重複的 (gameId, pin)，` +
          '無法建立 unique index —— 請先處理重複資料：'
        );
        for (const d of duplicates) {
          console.error(
            `      gameId=${d.gameId} pin=${d.pin} × ${d.count}：${d.characterIds.join(', ')}`
          );
        }
        console.error(`   ⏭️ 已跳過 ${model.collection.name} 的同步`);
        continue;
      }
      console.info('   ✅ (gameId, pin) 查重通過，可安全建立 unique index');
    }

    modelsToSync.push(name);
  }

  if (totalProblems === 0) {
    console.info('\n🎉 全部 collection 的 index 與 schema 一致');
  } else if (CI) {
    // CI 治理：schema 的 index 變更必須先在目標 DB 落地（Atlas UI 或
    // 手動 --sync）再 merge——確保大 collection 的 index 建立不被部署綁架
    console.error(
      `\n❌ CI 模式：共 ${totalProblems} 項差異——schema 的 index 宣告與目標 DB 不一致。` +
      '\n   請先在目標 DB 建立/同步 index（pnpm check-indexes --sync 或 Atlas UI）後重跑此檢查。'
    );
    process.exitCode = 1;
  } else if (!SYNC) {
    console.info(
      `\n共 ${totalProblems} 項差異。執行同步：pnpm check-indexes --sync` +
      '\n（注意：--sync 會 drop schema 未宣告的 index）'
    );
  } else {
    console.info(`\n🔧 開始同步 ${modelsToSync.length} 個 model ...`);
    for (const name of modelsToSync) {
      const model = mongoose.model(name);
      try {
        // syncIndexes 回傳被 drop 的 index 名稱
        const dropped = await model.syncIndexes();
        console.info(
          `   ✅ ${model.collection.name} 同步完成` +
          (dropped.length > 0 ? `（drop：${dropped.join(', ')}）` : '')
        );
      } catch (error) {
        console.error(`   ❌ ${model.collection.name} 同步失敗：`, error);
        process.exitCode = 1;
      }
    }

    // 同步後複查
    console.info('\n🔁 同步後複查：');
    for (const name of modelsToSync) {
      const model = mongoose.model(name);
      const declared = model.schema.indexes() as Array<
        [Record<string, unknown>, Record<string, unknown> | undefined]
      >;
      const existing = (await model.collection.listIndexes().toArray()) as ExistingIndex[];
      const remaining = findMissingIndexes(declared, existing);
      if (remaining.length === 0) {
        console.info(`   ✅ ${model.collection.name}：一致`);
      } else {
        console.error(`   ❌ ${model.collection.name}：仍有差異 —— ${remaining.join('；')}`);
        process.exitCode = 1;
      }
    }
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('❌ 執行失敗：', error);
  process.exit(1);
});
