/**
 * Leading + trailing 節流（PERF_INCIDENT_2026-06 批 3）
 *
 * 行為：
 * - 閒置時的第一次呼叫**立即執行**（leading —— 單發事件保持即時感）
 * - 之後 intervalMs 窗口內的呼叫合併為**一次尾端執行**（trailing —— burst 收斂）
 * - 尾端執行後重新開窗，持續的事件流穩定收斂為「每窗口至多一次」
 *
 * 用途：GM 控制台的 log 刷新 —— WebSocket 事件 burst 時將數十次
 * `getGameLogs` 查詢收斂為每 500ms 至多一次（假設 #8 的自我放大器）。
 */

export interface ThrottledCallback {
  (): void;
  /** 取消排程中的尾端執行並重置狀態（unmount 時呼叫） */
  cancel: () => void;
}

/**
 * 建立 leading + trailing 節流函式
 *
 * @param fn 被節流的函式
 * @param intervalMs 窗口長度（毫秒）
 */
export function createThrottledCallback(fn: () => void, intervalMs: number): ThrottledCallback {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let hasPendingCall = false;

  const fire = () => {
    fn();
    timer = setTimeout(() => {
      timer = null;
      if (hasPendingCall) {
        hasPendingCall = false;
        fire();
      }
    }, intervalMs);
  };

  const throttled = () => {
    if (timer) {
      hasPendingCall = true;
      return;
    }
    fire();
  };

  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    hasPendingCall = false;
  };

  return throttled;
}
