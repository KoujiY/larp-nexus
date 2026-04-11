/**
 * E2E 專用的 in-process event bus
 *
 * 僅供 E2E 測試使用（Pusher stub 機制）。production 不會匯入此檔——
 * 由於沒有任何 production code 會 `import` 此路徑，Next.js build 會
 * 自然將其 tree-shake 掉。
 *
 * 設計：
 * - 單例 EventEmitter，所有「模擬 Pusher trigger」透過 `emit('message', payload)`
 * - SSE route（`app/api/test/events/route.ts`）訂閱此 bus，把事件 stream 給 browser
 * - `globalThis` 保險：避免 Next.js dev server HMR 造成 module re-instantiate
 *   導致 bus 分裂成多個 emitter，進而丟失事件
 */

import { EventEmitter } from 'node:events';

export interface E2EBusPayload {
  channel: string;
  event: string;
  data: unknown;
}

type GlobalWithBus = typeof globalThis & { __LARP_E2E_BUS__?: EventEmitter };
const g = globalThis as GlobalWithBus;

function createBus(): EventEmitter {
  const emitter = new EventEmitter();
  // 每個 SSE 連線會註冊一個 listener；預設上限 10 個，測試情境可能有多 tab
  emitter.setMaxListeners(0);
  return emitter;
}

export function getE2EBus(): EventEmitter {
  if (!g.__LARP_E2E_BUS__) {
    g.__LARP_E2E_BUS__ = createBus();
  }
  return g.__LARP_E2E_BUS__;
}

export function publishE2EEvent(payload: E2EBusPayload): void {
  getE2EBus().emit('message', payload);
}
