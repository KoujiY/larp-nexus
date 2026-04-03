#!/usr/bin/env node
/**
 * Phase E 資料遷移腳本：Schema 結構對齊
 *
 * 變更內容：
 * 1. Character / CharacterRuntime: publicInfo.background string → BackgroundBlock[]
 * 2. Character / CharacterRuntime: secretInfo.secrets[].content string → string[]
 * 3. Character / CharacterRuntime: tasks[].gmNotes 移除
 * 4. Game / GameRuntime: publicInfo { intro, worldSetting, chapters } → { blocks }
 *
 * 執行方式：
 * ```bash
 * # Dry-run（僅顯示影響範圍，不寫入）
 * npx tsx scripts/migrate-phase-e.ts --dry-run
 *
 * # 正式執行
 * npx tsx scripts/migrate-phase-e.ts
 * ```
 *
 * 冪等設計：可安全重複執行，已遷移的文件會被跳過。
 */

import dotenv from 'dotenv';
// 優先載入 .env.production.local（production migration 用），回退到 .env.local
dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
import dbConnect from '@/lib/db/mongodb';
import mongoose from 'mongoose';

// ─── CLI 參數 ────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

// ─── 型別 ────────────────────────────────────────────────────────────────────

type BackgroundBlock = { type: 'title' | 'body'; content: string };

type MigrationStats = {
  charactersScanned: number;
  charactersUpdated: number;
  gamesScanned: number;
  gamesUpdated: number;
  errors: string[];
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[migrate] ${msg}`);
}

function logSection(title: string) {
  console.log('');
  console.log('─'.repeat(60));
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

/**
 * 將舊版 Game publicInfo 轉換為 blocks 結構
 *
 * 轉換規則：
 * - intro（前導故事）→ body block
 * - worldSetting（世界觀）→ body block
 * - chapters（章節）→ 依 order 排序，每章產生 title + body blocks
 */
function convertGamePublicInfoToBlocks(publicInfo: Record<string, unknown>): BackgroundBlock[] {
  const blocks: BackgroundBlock[] = [];

  // intro → body block
  const intro = publicInfo.intro as string | undefined;
  if (intro && intro.trim()) {
    blocks.push({ type: 'body', content: intro.trim() });
  }

  // worldSetting → body block
  const worldSetting = publicInfo.worldSetting as string | undefined;
  if (worldSetting && worldSetting.trim()) {
    blocks.push({ type: 'body', content: worldSetting.trim() });
  }

  // chapters → title + body blocks（依 order 排序）
  const chapters = publicInfo.chapters as Array<{
    title?: string;
    content?: string;
    order?: number;
  }> | undefined;

  if (chapters && Array.isArray(chapters) && chapters.length > 0) {
    const sorted = [...chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const chapter of sorted) {
      if (chapter.title && chapter.title.trim()) {
        blocks.push({ type: 'title', content: chapter.title.trim() });
      }
      if (chapter.content && chapter.content.trim()) {
        blocks.push({ type: 'body', content: chapter.content.trim() });
      }
    }
  }

  return blocks;
}

// ─── Migration 1: Character / CharacterRuntime ───────────────────────────────

async function migrateCharacterCollections(stats: MigrationStats) {
  const collectionNames = ['characters', 'characterruntimes'];

  for (const collName of collectionNames) {
    logSection(`Migration: ${collName}`);
    const collection = mongoose.connection.db!.collection(collName);
    const docs = await collection.find({}).toArray();
    log(`找到 ${docs.length} 個文件`);

    let updated = 0;

    for (const doc of docs) {
      const updates: Record<string, unknown> = {};
      const unsets: Record<string, unknown> = {};
      const reasons: string[] = [];

      // ── 1. publicInfo.background: string → BackgroundBlock[] ──
      const bg = doc.publicInfo?.background;
      if (typeof bg === 'string') {
        // 冪等：只有是 string 時才轉換，已經是 array 則跳過
        if (bg.trim()) {
          updates['publicInfo.background'] = [{ type: 'body', content: bg }];
        } else {
          updates['publicInfo.background'] = [];
        }
        reasons.push('background: string→blocks');
      }

      // ── 2. secretInfo.secrets[].content: string → string[] ──
      const secrets = doc.secretInfo?.secrets;
      if (Array.isArray(secrets)) {
        let secretsChanged = false;
        const newSecrets = secrets.map((s: Record<string, unknown>) => {
          if (typeof s.content === 'string') {
            secretsChanged = true;
            return { ...s, content: s.content ? [s.content] : [''] };
          }
          // 已經是 array 或其他型別 → 不動
          return s;
        });
        if (secretsChanged) {
          updates['secretInfo.secrets'] = newSecrets;
          reasons.push('secrets.content: string→string[]');
        }
      }

      // ── 3. tasks[].gmNotes: 移除 ──
      const tasks = doc.tasks;
      if (Array.isArray(tasks)) {
        const hasGmNotes = tasks.some((t: Record<string, unknown>) => t.gmNotes !== undefined);
        if (hasGmNotes) {
          // 移除每個 task 的 gmNotes
          const cleanedTasks = tasks.map((t: Record<string, unknown>) => {
            const { gmNotes: _, ...rest } = t;
            return rest;
          });
          updates['tasks'] = cleanedTasks;
          reasons.push('tasks: remove gmNotes');
        }
      }

      // ── 寫入 ──
      if (Object.keys(updates).length > 0 || Object.keys(unsets).length > 0) {
        const updateOp: Record<string, unknown> = {};
        if (Object.keys(updates).length > 0) updateOp.$set = updates;
        if (Object.keys(unsets).length > 0) updateOp.$unset = unsets;

        if (DRY_RUN) {
          log(`  [DRY-RUN] ${doc._id} → ${reasons.join(', ')}`);
        } else {
          await collection.updateOne({ _id: doc._id }, updateOp);
          log(`  ✓ ${doc._id} (${doc.name || 'unnamed'}) → ${reasons.join(', ')}`);
        }
        updated++;
      }
    }

    log(`${collName}: ${updated}/${docs.length} 需更新`);
    stats.charactersScanned += docs.length;
    stats.charactersUpdated += updated;
  }
}

// ─── Migration 2: Game / GameRuntime ─────────────────────────────────────────

async function migrateGameCollections(stats: MigrationStats) {
  const collectionNames = ['games', 'gameruntimes'];

  for (const collName of collectionNames) {
    logSection(`Migration: ${collName}`);
    const collection = mongoose.connection.db!.collection(collName);
    const docs = await collection.find({}).toArray();
    log(`找到 ${docs.length} 個文件`);

    let updated = 0;

    for (const doc of docs) {
      const publicInfo = doc.publicInfo as Record<string, unknown> | undefined;
      if (!publicInfo) continue;

      // 冪等檢查：如果已有 blocks 欄位且沒有 intro/worldSetting/chapters → 已遷移
      const hasOldStructure =
        publicInfo.intro !== undefined ||
        publicInfo.worldSetting !== undefined ||
        publicInfo.chapters !== undefined;
      const hasNewStructure = publicInfo.blocks !== undefined;

      if (!hasOldStructure && hasNewStructure) {
        // 已遷移，跳過
        continue;
      }

      if (!hasOldStructure && !hasNewStructure) {
        // 空 publicInfo，設為 { blocks: [] }
        if (DRY_RUN) {
          log(`  [DRY-RUN] ${doc._id} → empty publicInfo → { blocks: [] }`);
        } else {
          await collection.updateOne(
            { _id: doc._id },
            { $set: { publicInfo: { blocks: [] } } },
          );
          log(`  ✓ ${doc._id} (${doc.name || 'unnamed'}) → empty → { blocks: [] }`);
        }
        updated++;
        continue;
      }

      // 有舊結構 → 轉換
      const blocks = convertGamePublicInfoToBlocks(publicInfo);

      if (DRY_RUN) {
        log(`  [DRY-RUN] ${doc._id} → ${blocks.length} blocks`);
      } else {
        // 用 $set 覆寫整個 publicInfo（移除 intro/worldSetting/chapters，換成 blocks）
        await collection.updateOne(
          { _id: doc._id },
          { $set: { publicInfo: { blocks } } },
        );
        log(`  ✓ ${doc._id} (${doc.name || 'unnamed'}) → ${blocks.length} blocks`);
      }
      updated++;
    }

    log(`${collName}: ${updated}/${docs.length} 需更新`);
    stats.gamesScanned += docs.length;
    stats.gamesUpdated += updated;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log(`  Phase E 資料遷移${DRY_RUN ? ' (DRY-RUN 模式)' : ''}`);
  console.log('═'.repeat(60));

  if (DRY_RUN) {
    log('⚠ DRY-RUN 模式：不會寫入任何變更');
  }

  await dbConnect();
  log('MongoDB 連線成功');

  const stats: MigrationStats = {
    charactersScanned: 0,
    charactersUpdated: 0,
    gamesScanned: 0,
    gamesUpdated: 0,
    errors: [],
  };

  try {
    await migrateCharacterCollections(stats);
    await migrateGameCollections(stats);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    stats.errors.push(msg);
    console.error('[migrate] 錯誤:', msg);
  }

  // ── 結果報告 ──
  logSection('遷移結果');
  log(`角色文件：掃描 ${stats.charactersScanned}，更新 ${stats.charactersUpdated}`);
  log(`遊戲文件：掃描 ${stats.gamesScanned}，更新 ${stats.gamesUpdated}`);

  if (stats.errors.length > 0) {
    log(`❌ 錯誤 ${stats.errors.length} 個：`);
    stats.errors.forEach((e) => log(`  - ${e}`));
  } else {
    log(DRY_RUN ? '✓ DRY-RUN 完成，無錯誤' : '✓ 遷移完成，無錯誤');
  }

  console.log('═'.repeat(60));

  await mongoose.disconnect();
  process.exit(stats.errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('[migrate] 未預期的錯誤:', error);
  process.exit(1);
});
