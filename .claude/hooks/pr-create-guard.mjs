#!/usr/bin/env node
/**
 * PreToolUse hook：攔截 `gh pr create`，強制 PR title/body 合規。
 *
 * 機制（已向 claude-code-guide 查證現行 API）：
 * - stdin 收到 Claude 傳入的 JSON：`tool_input.command`（完整指令字串）、`cwd`
 * - 不合規時 stdout 印 JSON `{ hookSpecificOutput: { permissionDecision: "deny", ... } }`、exit 0
 *   → tool call 被擋、reason 以「Tool call blocked: …」回饋給模型
 *
 * fail 策略：
 * - 非 `gh pr create` 或無法解析 stdin → 放行（exit 0，不干擾其他指令）
 * - 是 `gh pr create` 但非標準形式（缺 --title / --body-file、或用 inline --body）→ 擋下
 *   （fail closed：強制 `gh pr create --title "type: desc" --body-file PR_BODY.md`）
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePr, isGhPrCreate, extractFlag } from '../../scripts/pr-lint.mjs';

/** 放行（不擋） */
function allow() {
  process.exit(0);
}

/** 擋下並回饋原因 */
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

// ── 讀取 stdin ──
let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  allow(); // 無法解析 → 不干擾
}

const cmd = input?.tool_input?.command;
if (!isGhPrCreate(cmd)) {
  allow(); // 非 gh pr create（含引號內提及者）→ 放行
}

// ── 標準形式檢查（fail closed）──
const formErrors = [];
const title = extractFlag(cmd, '--title');
const bodyFile = extractFlag(cmd, '--body-file');

if (title === null) formErrors.push('缺少 --title');
if (bodyFile === null) formErrors.push('缺少 --body-file（PR body 一律走檔案）');
if (/--body[= ]/.test(cmd) && !/--body-file/.test(cmd)) {
  formErrors.push('不可用 inline --body，請改 --body-file');
}

if (formErrors.length > 0) {
  deny(
    'PR 建立被擋（須用標準形式）：\n' +
      formErrors.map((e) => '• ' + e).join('\n') +
      '\n\n標準：gh pr create --title "type: desc" --body-file PR_BODY.md',
  );
}

// ── 讀 body 檔 ──
const cwd = input.cwd || process.cwd();
let body;
try {
  body = readFileSync(resolve(cwd, bodyFile), 'utf8');
} catch {
  deny(`讀不到 body 檔案：${bodyFile}（請確認 --body-file 路徑，相對於專案根目錄）`);
}

// ── 內容驗證 ──
const { ok, errors } = validatePr({ title, body });
if (!ok) {
  deny('PR 內容不合規範：\n' + errors.map((e) => '• ' + e).join('\n'));
}

allow();
