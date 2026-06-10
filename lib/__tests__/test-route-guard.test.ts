/**
 * test-route-guard 單元測試
 *
 * 驗證四種環境組合：
 * 1. 兩者皆未設（production 常態）→ 一律拒絕
 * 2. E2E=1、無 LOADTEST_TOKEN（本機 E2E）→ 一律放行（行為不變）
 * 3. 僅設 LOADTEST_TOKEN（staging 壓測，無 E2E）→ 只放行 header 相符的請求
 * 4. 兩者同時設定 → token 檢查優先
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isTestRouteAllowed } from '../test-route-guard';

function makeRequest(token?: string): Request {
  return new Request('http://localhost/api/test/login', {
    headers: token ? { 'x-loadtest-token': token } : {},
  });
}

describe('isTestRouteAllowed', () => {
  const originalE2E = process.env.E2E;
  const originalToken = process.env.LOADTEST_TOKEN;

  beforeEach(() => {
    delete process.env.E2E;
    delete process.env.LOADTEST_TOKEN;
  });

  afterEach(() => {
    if (originalE2E === undefined) delete process.env.E2E;
    else process.env.E2E = originalE2E;
    if (originalToken === undefined) delete process.env.LOADTEST_TOKEN;
    else process.env.LOADTEST_TOKEN = originalToken;
  });

  it('兩者皆未設時一律拒絕（production 常態）', () => {
    expect(isTestRouteAllowed(makeRequest())).toBe(false);
    expect(isTestRouteAllowed()).toBe(false);
  });

  it('E2E=1 且未設 LOADTEST_TOKEN 時一律放行（本機 E2E 行為不變）', () => {
    process.env.E2E = '1';
    expect(isTestRouteAllowed(makeRequest())).toBe(true);
    expect(isTestRouteAllowed()).toBe(true);
  });

  it('僅設 LOADTEST_TOKEN 時（staging 壓測模式），只放行 header 相符的請求', () => {
    process.env.LOADTEST_TOKEN = 'secret';
    expect(isTestRouteAllowed(makeRequest('secret'))).toBe(true);
    expect(isTestRouteAllowed(makeRequest('wrong'))).toBe(false);
    expect(isTestRouteAllowed(makeRequest())).toBe(false);
    expect(isTestRouteAllowed()).toBe(false);
  });

  it('E2E=1 且設了 LOADTEST_TOKEN 時，token 檢查優先', () => {
    process.env.E2E = '1';
    process.env.LOADTEST_TOKEN = 'secret';
    expect(isTestRouteAllowed(makeRequest('secret'))).toBe(true);
    expect(isTestRouteAllowed(makeRequest('wrong'))).toBe(false);
    expect(isTestRouteAllowed(makeRequest())).toBe(false);
  });
});
