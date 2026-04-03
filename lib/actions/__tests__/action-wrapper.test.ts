import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}))

import { withAction } from '../action-wrapper'
import dbConnect from '@/lib/db/mongodb'

describe('withAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('成功時回傳 handler 結果', async () => {
    const result = await withAction(async () => ({
      success: true as const,
      data: { value: 42 },
    }))

    expect(result.success).toBe(true)
    expect((result as { success: true; data: { value: number } }).data.value).toBe(42)
  })

  it('呼叫前先執行 dbConnect', async () => {
    await withAction(async () => ({ success: true as const, data: null }))
    expect(dbConnect).toHaveBeenCalledOnce()
  })

  it('handler 拋出例外時回傳 INTERNAL_ERROR', async () => {
    const result = await withAction(async () => {
      throw new Error('DB 連線失敗')
    })

    expect(result.success).toBe(false)
    expect((result as { success: false; error: string }).error).toBe('INTERNAL_ERROR')
  })

  it('回傳的 error message 為繁體中文說明', async () => {
    const result = await withAction(async () => {
      throw new Error('anything')
    }) as { success: false; error: string; message: string }

    expect(result.message).toBeTruthy()
  })

  it('dbConnect 失敗時同樣回傳 INTERNAL_ERROR', async () => {
    vi.mocked(dbConnect).mockRejectedValueOnce(new Error('connection refused'))

    const result = await withAction(async () => ({
      success: true as const,
      data: null,
    })) as { success: false; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toBe('INTERNAL_ERROR')
  })
})
