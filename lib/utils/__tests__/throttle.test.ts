import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createThrottledCallback } from '../throttle'

describe('createThrottledCallback（PERF_INCIDENT_2026-06 批 3）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('閒置時首次呼叫立即執行（leading）', () => {
    const fn = vi.fn()
    const throttled = createThrottledCallback(fn, 500)

    throttled()

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('窗口內的多次呼叫合併為一次尾端執行（trailing）', () => {
    const fn = vi.fn()
    const throttled = createThrottledCallback(fn, 500)

    throttled() // leading：立即執行
    throttled()
    throttled()
    throttled()
    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(2) // trailing：窗口結束補一次
  })

  it('窗口內無後續呼叫時不觸發尾端執行', () => {
    const fn = vi.fn()
    const throttled = createThrottledCallback(fn, 500)

    throttled()
    vi.advanceTimersByTime(1000)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('持續事件流收斂為每窗口至多一次', () => {
    const fn = vi.fn()
    const throttled = createThrottledCallback(fn, 500)

    // 模擬 2 秒內每 50ms 一個事件（共 40 個）
    for (let t = 0; t < 2000; t += 50) {
      throttled()
      vi.advanceTimersByTime(50)
    }
    vi.advanceTimersByTime(500) // 收尾窗口

    // leading 1 次 + 每 500ms 窗口的 trailing：總次數應遠小於 40
    expect(fn.mock.calls.length).toBeLessThanOrEqual(6)
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(4)
  })

  it('窗口結束後的新呼叫再次立即執行', () => {
    const fn = vi.fn()
    const throttled = createThrottledCallback(fn, 500)

    throttled()
    vi.advanceTimersByTime(600) // 窗口已過、無 pending

    throttled()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('cancel 取消排程中的尾端執行', () => {
    const fn = vi.fn()
    const throttled = createThrottledCallback(fn, 500)

    throttled()
    throttled() // 排入 trailing
    throttled.cancel()

    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1) // 只有 leading 那次
  })

  it('cancel 後可重新使用（重置為閒置狀態）', () => {
    const fn = vi.fn()
    const throttled = createThrottledCallback(fn, 500)

    throttled()
    throttled.cancel()

    throttled() // 重置後視為閒置 → leading 立即執行
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
