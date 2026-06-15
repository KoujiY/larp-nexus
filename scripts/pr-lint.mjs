/**
 * PR title / body 規範驗證器（純函式，無 I/O）
 *
 * 被 `.claude/hooks/pr-create-guard.mjs`（PreToolUse hook）與 vitest 共用。
 * 以 .mjs 撰寫，讓 hook 可直接 import、免 tsx 啟動開銷。
 *
 * 規則（使用者拍板）：
 * - title：`type: desc`、無 `(scope)`、ASCII（type 限下列集合）
 * - body：必填 5 章節（有序、非空），額外只允許 Notes，未知章節 fail closed
 */

/** @type {readonly string[]} 必填章節（順序即驗證順序） */
export const REQUIRED_SECTIONS = ['Summary', 'Changes', 'Testing', 'Risks', 'Sync'];
/** @type {readonly string[]} 選用章節 */
export const OPTIONAL_SECTIONS = ['Notes'];
/** @type {readonly string[]} 合法 commit/PR type */
export const TYPES = ['feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'perf', 'ci'];

/**
 * 驗證 PR title。
 * @param {string} title
 * @returns {string[]} 錯誤訊息（空陣列 = 合規）
 */
export function validateTitle(title) {
  const errors = [];
  if (!title || !title.trim()) {
    errors.push('title 為空');
    return errors;
  }
  if (/[^\x00-\x7F]/.test(title)) {
    errors.push('title 必須為英文（偵測到非 ASCII 字元）');
  }
  if (/^[a-z]+\([^)]*\)\s*:/.test(title)) {
    errors.push('title 不可含 scope 括號，請用 "type: description"');
  }
  const typeAlt = TYPES.join('|');
  if (!new RegExp(`^(${typeAlt}):\\s.+`).test(title)) {
    errors.push(`title 須為 "type: description"（type ∈ ${TYPES.join('|')}）`);
  }
  return errors;
}

/**
 * 解析 body 的 `## 標題` 章節。
 * @param {string} body
 * @returns {Array<{ name: string, content: string }>}
 */
function parseSections(body) {
  const lines = body.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      current = { name: m[1].trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
    // 第一個標題之前的文字忽略（不影響驗證）
  }
  return sections.map((s) => ({ name: s.name, content: s.lines.join('\n').trim() }));
}

/**
 * 驗證 PR body。
 * @param {string} body
 * @returns {string[]} 錯誤訊息（空陣列 = 合規）
 */
export function validateBody(body) {
  const errors = [];
  if (!body || !body.trim()) {
    errors.push('body 為空');
    return errors;
  }

  const sections = parseSections(body);
  const names = sections.map((s) => s.name);
  const allowed = new Set([...REQUIRED_SECTIONS, ...OPTIONAL_SECTIONS]);

  // 1. 未知章節（fail closed）
  for (const n of names) {
    if (!allowed.has(n)) {
      errors.push(`未知章節 "## ${n}"（只允許 ${[...REQUIRED_SECTIONS, ...OPTIONAL_SECTIONS].join(' / ')}）`);
    }
  }

  // 2. 重複章節
  const seen = new Set();
  for (const n of names) {
    if (seen.has(n)) errors.push(`重複章節 "## ${n}"`);
    seen.add(n);
  }

  // 3. 必填章節存在
  for (const req of REQUIRED_SECTIONS) {
    if (!names.includes(req)) errors.push(`缺少必填章節 "## ${req}"`);
  }

  // 4. 必填章節順序（皆存在時才檢查相對順序）
  const reqIndices = REQUIRED_SECTIONS.map((r) => names.indexOf(r));
  if (reqIndices.every((i) => i >= 0)) {
    const ascending = reqIndices.every((v, i) => i === 0 || reqIndices[i - 1] < v);
    if (!ascending) {
      errors.push(`必填章節順序須為 ${REQUIRED_SECTIONS.join(' → ')}`);
    }
  }

  // 5. 必填章節內容非空
  for (const s of sections) {
    if (REQUIRED_SECTIONS.includes(s.name) && !s.content) {
      errors.push(`章節 "## ${s.name}" 內容為空`);
    }
  }

  return errors;
}

/**
 * 驗證整個 PR（title + body）。
 * @param {{ title: string, body: string }} pr
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePr({ title, body }) {
  const errors = [...validateTitle(title), ...validateBody(body)];
  return { ok: errors.length === 0, errors };
}

/**
 * 判斷一條 shell 指令是否真的在執行 `gh pr create`。
 *
 * 先剝除引號內容再比對：避免 `git commit -m "...gh pr create..."` 這類
 * 在**引數字串內**提及該子字串的指令被誤判（dogfooding 實際踩到的 false positive）。
 *
 * @param {string} command
 * @returns {boolean}
 */
export function isGhPrCreate(command) {
  if (typeof command !== 'string') return false;
  const unquoted = command.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  // `gh(.exe)?` 涵蓋裸 `gh pr create` 與全路徑/`gh.exe pr create`（避免以絕對路徑繞過閘）
  return /\bgh(\.exe)?\s+pr\s+create\b/.test(unquoted);
}

/**
 * 從指令抽取 `--flag value` / `--flag "value"` / `--flag 'value'` / `--flag=value`。
 * 在**原始**指令上操作（保留引號內的值）。
 *
 * @param {string} command
 * @param {string} flag 例如 '--title'
 * @returns {string|null} 找不到回 null
 */
export function extractFlag(command, flag) {
  const m = command.match(new RegExp(`${flag}[= ]+("([^"]*)"|'([^']*)'|(\\S+))`));
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? '';
}
