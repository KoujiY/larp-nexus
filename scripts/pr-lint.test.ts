/**
 * PR title/body 規範驗證器測試
 *
 * 規則來源（與使用者拍板的標準一致）：
 * - title：`type: desc`、無 `(scope)`、ASCII（type ∈ feat|fix|docs|refactor|test|chore|perf|ci）
 * - body：必填 5 章節 Summary/Changes/Testing/Risks/Sync，存在 + 非空 + 有序；
 *   額外只允許 Notes；其餘未知 `## 標題` 擋下（fail closed）
 */

import { describe, it, expect } from 'vitest';
// validator 以 .mjs 撰寫，讓 PreToolUse hook 可直接 import（免 tsx 啟動開銷）
import { validateTitle, validateBody, validatePr, isGhPrCreate, extractFlag } from './pr-lint.mjs';

const goodBody = [
  '## Summary',
  '修了一個東西。',
  '',
  '## Changes',
  '- 改了 a',
  '',
  '## Testing',
  '- 單元通過',
  '',
  '## Risks',
  'None — 純內部重構。',
  '',
  '## Sync',
  'N/A — 無知識庫/BACKLOG/E2E 影響。',
  '',
].join('\n');

describe('validateTitle', () => {
  it('合規 title 無錯誤', () => {
    expect(validateTitle('fix: write GM log for transfers')).toEqual([]);
  });

  it('非 ASCII（中文）→ 錯誤', () => {
    const errs = validateTitle('fix: 修復轉移');
    expect(errs.some((e) => /ASCII|英文/.test(e))).toBe(true);
  });

  it('含 scope 括號 → 錯誤', () => {
    const errs = validateTitle('fix(gm): add foo');
    expect(errs.some((e) => /scope/.test(e))).toBe(true);
  });

  it('缺 type 前綴 → 錯誤', () => {
    expect(validateTitle('add foo').length).toBeGreaterThan(0);
  });

  it('未知 type → 錯誤', () => {
    expect(validateTitle('wip: foo').length).toBeGreaterThan(0);
  });

  it('空 title → 錯誤', () => {
    expect(validateTitle('').length).toBeGreaterThan(0);
  });
});

describe('validateBody', () => {
  it('合規 body（5 必填章節有序非空）無錯誤', () => {
    expect(validateBody(goodBody)).toEqual([]);
  });

  it('允許選用 Notes 章節', () => {
    expect(validateBody(goodBody + '\n## Notes\n- 後續事項\n')).toEqual([]);
  });

  it('允許尾端 attribution 行（非標題不影響）', () => {
    expect(validateBody(goodBody + '\n🤖 Generated with Claude Code\n')).toEqual([]);
  });

  it('缺必填章節 → 錯誤', () => {
    const noSync = goodBody.replace('## Sync\nN/A — 無知識庫/BACKLOG/E2E 影響。\n', '');
    expect(validateBody(noSync).some((e) => /Sync/.test(e))).toBe(true);
  });

  it('必填章節內容為空 → 錯誤', () => {
    const emptyRisks = [
      '## Summary', 'x', '## Changes', '- a', '## Testing', '- t', '## Risks', '', '## Sync', 'N/A',
    ].join('\n');
    expect(validateBody(emptyRisks).some((e) => /Risks/.test(e) && /空/.test(e))).toBe(true);
  });

  it('未知章節 → 擋下', () => {
    expect(validateBody(goodBody + '\n## Random\n內容\n').some((e) => /未知|Random/.test(e))).toBe(true);
  });

  it('章節亂序 → 錯誤', () => {
    const reordered = [
      '## Changes', '- a', '## Summary', 'x', '## Testing', '- t', '## Risks', 'None', '## Sync', 'N/A',
    ].join('\n');
    expect(validateBody(reordered).some((e) => /順序/.test(e))).toBe(true);
  });

  it('空 body → 錯誤', () => {
    expect(validateBody('').length).toBeGreaterThan(0);
  });
});

describe('isGhPrCreate', () => {
  it('真的在跑 gh pr create → true', () => {
    expect(isGhPrCreate('gh pr create --title "fix: x" --body-file PR_BODY.md')).toBe(true);
  });

  it('rtk 前綴 → true', () => {
    expect(isGhPrCreate('rtk gh pr create --title "fix: x" --body-file PR_BODY.md')).toBe(true);
  });

  it('指令串接中的 gh pr create → true', () => {
    expect(isGhPrCreate('cd /x && gh pr create --title "fix: x" --body-file PR_BODY.md')).toBe(true);
  });

  it('回歸：commit message 引號內提及 gh pr create → false（不誤判）', () => {
    expect(isGhPrCreate('git commit -m "intercepts gh pr create and blocks it"')).toBe(false);
  });

  it('單引號參數內提及 → false', () => {
    expect(isGhPrCreate("git commit -m 'gh pr create mentioned'")).toBe(false);
  });

  it('gh.exe pr create → true（不可用 .exe 後綴繞過）', () => {
    expect(isGhPrCreate('gh.exe pr create --title "fix: x" --body-file PR_BODY.md')).toBe(true);
  });

  it('無空格路徑前綴 gh.exe pr create → true', () => {
    expect(isGhPrCreate('/usr/bin/gh.exe pr create --title "fix: x" --body-file PR_BODY.md')).toBe(true);
  });

  // 已知限制：含空格的全路徑（如 "C:\\Program Files\\GitHub CLI\\gh.exe"）因必須加引號、
  // 而偵測會剝除引號內容，故偵測不到。緩解：一律以裸 `gh`（PATH 解析）呼叫，不走引號全路徑。

  it('無關指令 → false', () => {
    expect(isGhPrCreate('ls -la')).toBe(false);
  });
});

describe('extractFlag', () => {
  it('抽取雙引號值', () => {
    expect(extractFlag('gh pr create --title "fix: x" --body-file b.md', '--title')).toBe('fix: x');
  });

  it('抽取 --body-file 裸值', () => {
    expect(extractFlag('gh pr create --title "x" --body-file PR_BODY.md', '--body-file')).toBe('PR_BODY.md');
  });

  it('找不到 → null', () => {
    expect(extractFlag('gh pr create --title "x"', '--body-file')).toBeNull();
  });
});

describe('validatePr', () => {
  it('title + body 皆合規 → ok', () => {
    const r = validatePr({ title: 'fix: foo', body: goodBody });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('任一不合規 → not ok 並彙整錯誤', () => {
    const r = validatePr({ title: 'fix: 中文', body: '## Summary\nx' });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
