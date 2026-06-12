/**
 * Index 缺失檢查（PERF_INCIDENT_2026-06 批 2）
 *
 * production/loadtest 關閉 autoIndex 後，「schema 新增 index」「新增 model」
 * 「指向全新空 DB」三種情況下 index 不會自動建立，且 MongoDB 對缺失 index
 * 完全靜默（查詢退化為全表掃描、unique / TTL 約束不生效）。
 *
 * 本模組在連線建立後以 fire-and-forget 方式比對各已註冊 model 的
 * schema 宣告與 DB 實際 index，缺漏或屬性不符（unique / expireAfterSeconds）
 * 時輸出 console.warn 提示維運者手動建立（建立方式見
 * docs/knowledge/architecture/deployment-and-env.md）。
 *
 * 成本：每個 process 僅執行一次，每個 model 一次 listIndexes（背景執行，
 * 不在請求關鍵路徑上）。
 */

import mongoose from 'mongoose';

/** schema.indexes() 的單筆型別：[key 定義, 選項] */
type DeclaredIndex = [Record<string, unknown>, Record<string, unknown> | undefined];

/** listIndexes() 回傳的單筆（僅取用比對所需欄位） */
export interface ExistingIndex {
  key: Record<string, unknown>;
  unique?: boolean;
  expireAfterSeconds?: number;
}

/**
 * 比對 schema 宣告與 DB 實際 index，回傳缺漏/不符項目的描述
 *
 * 比對規則：
 * 1. key 定義（欄位 + 方向）必須存在於 DB
 * 2. 宣告 unique 時，DB 對應 index 也必須是 unique
 * 3. 宣告 expireAfterSeconds（TTL）時，DB 對應 index 的秒數必須一致
 *    （同 key 的普通 index 不等於 TTL index —— 批 3 TTL 轉換的關鍵場景）
 */
export function findMissingIndexes(
  declared: DeclaredIndex[],
  existing: ExistingIndex[]
): string[] {
  const problems: string[] = [];

  for (const [keyDef, opts] of declared) {
    const keyJson = JSON.stringify(keyDef);
    const match = existing.find((ix) => JSON.stringify(ix.key) === keyJson);

    if (!match) {
      problems.push(`缺少 index ${keyJson}`);
      continue;
    }
    if (opts?.unique && !match.unique) {
      problems.push(`index ${keyJson} 存在但缺少 unique 約束`);
      continue;
    }
    if (
      opts?.expireAfterSeconds !== undefined &&
      match.expireAfterSeconds !== opts.expireAfterSeconds
    ) {
      problems.push(
        `index ${keyJson} 存在但 TTL 不符（宣告 ${String(opts.expireAfterSeconds)}s、實際 ${String(match.expireAfterSeconds ?? '無 TTL')}）`
      );
    }
  }

  return problems;
}

let hasRun = false;

/**
 * 排程一次性的 index 檢查（fire-and-forget，不阻塞呼叫端）
 *
 * 由 connectDB 在連線建立後、且 autoIndex 關閉時呼叫。
 * 僅檢查呼叫當下已註冊的 model（actions 透過 models barrel 匯入，
 * 實務上全部 model 都已註冊）。
 */
export function scheduleIndexCheck(): void {
  if (hasRun) return;
  hasRun = true;

  void runIndexCheck().catch((error) => {
    console.error('[index-check] 檢查執行失敗（不影響服務）', error);
  });
}

async function runIndexCheck(): Promise<void> {
  for (const name of mongoose.modelNames()) {
    const model = mongoose.model(name);
    const declared = model.schema.indexes() as DeclaredIndex[];
    if (declared.length === 0) continue;

    let existing: ExistingIndex[];
    try {
      existing = (await model.collection.listIndexes().toArray()) as ExistingIndex[];
    } catch {
      // collection 尚不存在（全新 DB、首筆資料未寫入）→ 宣告的 index 全數缺失
      existing = [];
    }

    const problems = findMissingIndexes(declared, existing);
    if (problems.length > 0) {
      console.warn(
        `[index-check] ⚠️ collection "${model.collection.name}" 與 schema 宣告不符（共 ${problems.length} 項）：\n` +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\n  autoIndex 已關閉，這些 index 不會自動建立 —— 查詢將退化為全表掃描、unique/TTL 約束不生效。' +
        '\n  建立方式見 docs/knowledge/architecture/deployment-and-env.md「MongoDB 連線設定」。'
      );
    }
  }
}
