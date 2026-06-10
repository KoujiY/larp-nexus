/**
 * loadtest/.env 的共用解析器（Node 腳本用）
 *
 * 明確以 UTF-8 讀取（教訓：cmd for /f 與 PS 5.1 的預設 ANSI 解碼
 * 都曾把中文註解後的換行吃掉），容忍 `=` 兩側空格與引號。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOADTEST_DIR = dirname(fileURLToPath(import.meta.url));

const REQUIRED_KEYS = ['STAGING_URL', 'LOADTEST_TOKEN', 'VERCEL_BYPASS'];

/**
 * 讀取並解析 loadtest/.env，回傳 key-value 物件
 * @returns {Record<string, string>}
 */
export function loadEnv() {
  const envPath = join(LOADTEST_DIR, '.env');
  let text;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    console.error('[env] loadtest/.env not found. Run: copy loadtest\\env.example loadtest\\.env');
    process.exit(1);
  }

  const vars = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    vars[key] = val;
  }

  const missing = REQUIRED_KEYS.filter((k) => !vars[k]);
  if (missing.length > 0) {
    console.error(`[env] missing keys in loadtest/.env: ${missing.join(', ')}`);
    console.error(`[env] keys found: ${Object.keys(vars).join(', ')}`);
    process.exit(1);
  }

  vars.STAGING_URL = vars.STAGING_URL.replace(/\/+$/, '');
  return vars;
}

/**
 * 組出帶兩道閘門 header 的 fetch headers
 * @param {Record<string, string>} vars
 * @returns {Record<string, string>}
 */
export function gateHeaders(vars) {
  return {
    'x-loadtest-token': vars.LOADTEST_TOKEN,
    'x-vercel-protection-bypass': vars.VERCEL_BYPASS,
    'Content-Type': 'application/json',
  };
}

export { LOADTEST_DIR };
