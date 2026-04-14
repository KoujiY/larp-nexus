#!/usr/bin/env node
/**
 * Phase 10.8.1: 資料遷移腳本 - Phase 10 Game Code 與 PIN 唯一性
 *
 * 功能：
 * 1. 為所有現有遊戲生成 Game Code（如果不存在）
 * 2. 檢查所有角色的 PIN，找出同 gameId 下的重複 PIN
 * 3. 輸出遷移報告和衝突清單
 *
 * 執行方式：
 * ```bash
 * npm run migrate:phase10
 * ```
 *
 * 注意：
 * - 此腳本使用 TypeScript 編寫，需透過 tsx 執行
 * - 執行前請確保已設定正確的 MongoDB 連線環境變數
 * - 建議先在測試環境執行，確認無誤後再於正式環境執行
 */

import fs from 'fs';
import path from 'path';
import dbConnect from '@/lib/db/mongodb';
import Game from '@/lib/db/models/Game';
import Character from '@/lib/db/models/Character';
import { generateUniqueGameCode } from '@/lib/game/generate-game-code';

/**
 * 遷移統計資訊
 */
interface MigrationStats {
  totalGames: number;
  gamesUpdated: number;
  gameCodeConflicts: number;
  pinConflicts: number;
  errors: string[];
}

/**
 * PIN 衝突資訊
 */
interface PinConflict {
  gameId: string;
  gameName: string;
  pin: string;
  characterIds: string[];
  characterNames: string[];
}

/**
 * 主要遷移函數
 */
async function migratePhase10(): Promise<MigrationStats> {
  console.log('='.repeat(60));
  console.log('Phase 10 資料遷移開始');
  console.log('='.repeat(60));
  console.log('');

  const stats: MigrationStats = {
    totalGames: 0,
    gamesUpdated: 0,
    gameCodeConflicts: 0,
    pinConflicts: 0,
    errors: [],
  };

  try {
    // ========== 步驟 1：連接資料庫 ==========
    console.log('[1/5] 連接資料庫...');
    await dbConnect();
    console.log('  ✅ 資料庫連接成功');
    console.log('');

    // ========== 步驟 2：查詢所有遊戲 ==========
    console.log('[2/5] 查詢所有遊戲...');
    const games = await Game.find({}).select('_id name gameCode');
    stats.totalGames = games.length;
    console.log(`  找到 ${games.length} 個遊戲`);
    console.log('');

    // ========== 步驟 3：為缺少 Game Code 的遊戲生成 ==========
    console.log('[3/5] 為缺少 Game Code 的遊戲生成唯一代碼...');
    const gamesWithoutCode = games.filter((game) => !game.gameCode);
    console.log(`  需要生成 Game Code 的遊戲：${gamesWithoutCode.length} 個`);

    for (const game of gamesWithoutCode) {
      try {
        const newGameCode = await generateUniqueGameCode();
        await Game.findByIdAndUpdate(game._id, { gameCode: newGameCode });
        stats.gamesUpdated++;
        console.log(`  ✅ 遊戲 "${game.name}" (${game._id}) → Game Code: ${newGameCode}`);
      } catch (error) {
        const errorMsg = `無法為遊戲 "${game.name}" (${game._id}) 生成 Game Code: ${error instanceof Error ? error.message : 'Unknown error'}`;
        stats.errors.push(errorMsg);
        stats.gameCodeConflicts++;
        console.error(`  ❌ ${errorMsg}`);
      }
    }
    console.log('');

    // ========== 步驟 4：檢查 PIN 衝突 ==========
    console.log('[4/5] 檢查角色 PIN 衝突（同遊戲內重複）...');
    const duplicates = await Character.aggregate([
      {
        // 只檢查有 PIN 的角色
        $match: {
          pin: { $exists: true, $nin: [null, ''] },
        },
      },
      {
        // 按 gameId 和 pin 分組，計算數量
        $group: {
          _id: { gameId: '$gameId', pin: '$pin' },
          count: { $sum: 1 },
          characterIds: { $push: '$_id' },
          characterNames: { $push: '$name' },
        },
      },
      {
        // 只保留數量 > 1 的（重複）
        $match: {
          count: { $gt: 1 },
        },
      },
    ]);

    stats.pinConflicts = duplicates.length;
    console.log(`  找到 ${duplicates.length} 組 PIN 衝突`);

    const conflicts: PinConflict[] = [];

    for (const dup of duplicates) {
      const game = await Game.findById(dup._id.gameId).select('name');
      const conflict: PinConflict = {
        gameId: dup._id.gameId.toString(),
        gameName: game?.name || '未知遊戲',
        pin: dup._id.pin,
        characterIds: dup.characterIds.map((id: unknown) => String(id)),
        characterNames: dup.characterNames,
      };
      conflicts.push(conflict);
      console.log(`  ⚠️  遊戲 "${conflict.gameName}" (${conflict.gameId})`);
      console.log(`      PIN: ${conflict.pin} (重複 ${dup.count} 次)`);
      console.log(`      角色: ${conflict.characterNames.join(', ')}`);
    }
    console.log('');

    // ========== 步驟 5：輸出遷移報告 ==========
    console.log('[5/5] 輸出遷移報告...');
    const reportPath = path.join(process.cwd(), 'migration-phase10-report.json');
    const conflictsPath = path.join(process.cwd(), 'migration-conflicts.json');

    const report = {
      migrationDate: new Date().toISOString(),
      stats,
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`  📄 遷移報告已儲存至: ${reportPath}`);

    if (conflicts.length > 0) {
      fs.writeFileSync(conflictsPath, JSON.stringify(conflicts, null, 2), 'utf-8');
      console.log(`  📄 PIN 衝突清單已儲存至: ${conflictsPath}`);
      console.log(`  ⚠️  請手動解決 ${conflicts.length} 組 PIN 衝突`);
    }
    console.log('');

    // ========== 最終報告 ==========
    console.log('='.repeat(60));
    console.log('遷移完成');
    console.log('='.repeat(60));
    console.log(`總計遊戲數量：${stats.totalGames}`);
    console.log(`成功生成 Game Code：${stats.gamesUpdated}`);
    console.log(`Game Code 生成失敗：${stats.gameCodeConflicts}`);
    console.log(`PIN 衝突數量：${stats.pinConflicts}`);
    console.log(`錯誤數量：${stats.errors.length}`);
    console.log('='.repeat(60));

    return stats;
  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('❌ 遷移過程中發生嚴重錯誤');
    console.error('='.repeat(60));
    console.error(error);
    throw error;
  }
}

/**
 * 腳本入口點
 */
async function main() {
  try {
    const stats = await migratePhase10();

    // 如果有錯誤，退出碼為 1
    if (stats.errors.length > 0 || stats.gameCodeConflicts > 0 || stats.pinConflicts > 0) {
      console.log('');
      console.log('⚠️  遷移完成，但有部分問題需要處理');
      process.exit(1);
    }

    console.log('');
    console.log('✅ 遷移成功完成');
    process.exit(0);
  } catch {
    console.error('');
    console.error('❌ 遷移失敗');
    process.exit(1);
  }
}

// 執行主函數
main();
