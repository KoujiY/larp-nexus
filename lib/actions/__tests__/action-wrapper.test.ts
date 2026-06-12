/**
 * withAction 包裝器契約測試（perf 包裝統一後的新簽名）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}))

const runWithPerfMock = vi.fn(
  (_name: string, fn: () => Promise<unknown>) => fn()
)
vi.mock('@/lib/perf/perf-context', () => ({
  runWithPerf: (name: string, fn: () => Promise<unknown>) => runWithPerfMock(name, fn),
}))

import { withAction } from '../action-wrapper'
import dbConnect from '@/lib/db/mongodb'

describe('withAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('成功時回傳 handler 結果，perf 名稱正確傳遞', async () => {
    const result = await withAction('test-action', async () => ({
      success: true as const,
      data: { value: 42 },
    }))

    expect(result.success).toBe(true)
    expect((result as { success: true; data: { value: number } }).data.value).toBe(42)
    expect(runWithPerfMock).toHaveBeenCalledWith('test-action', expect.any(Function))
  })

  it('dbConnect 在 handler 之前、perf 計時窗之內執行', async () => {
    const order: string[] = []
    vi.mocked(dbConnect).mockImplementation(async () => {
      order.push('dbConnect')
      return undefined as never
    })

    await withAction('test-order', async () => {
      order.push('handler')
      return { success: true as const, data: null }
    })

    expect(order).toEqual(['dbConnect', 'handler'])
    // dbConnect 由 runWithPerf 內的 fn 觸發 → 在計時窗內
    expect(runWithPerfMock).toHaveBeenCalledOnce()
  })

  it('handler 拋出例外時回傳 INTERNAL_ERROR，log 含 action 名稱', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await withAction('test-throw', async () => {
      throw new Error('DB 連線失敗')
    })

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toBe('INTERNAL_ERROR')
    expect(String(errorSpy.mock.calls[0][0])).toContain('test-throw')
    errorSpy.mockRestore()
  })

  it('回傳的 error message 為使用者可讀說明', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await withAction('test-message', async () => {
      throw new Error('anything')
    }) as { success: false; error: string; message: string }

    expect(result.message).toBeTruthy()
    vi.restoreAllMocks()
  })

  it('dbConnect 失敗時同樣回傳 INTERNAL_ERROR', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(dbConnect).mockRejectedValueOnce(new Error('connection refused'))

    const result = await withAction('test-db-fail', async () => ({
      success: true as const,
      data: null,
    })) as { success: false; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toBe('INTERNAL_ERROR')
    vi.restoreAllMocks()
  })

  it('Next.js 控制流錯誤（digest NEXT_ 前綴）原樣重拋，不被吞掉', async () => {
    const redirectError = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/auth/login;307;',
    })

    await expect(
      withAction('test-redirect', async () => {
        throw redirectError
      }),
    ).rejects.toBe(redirectError)
  })
})
