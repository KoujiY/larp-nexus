import { describe, it, expect } from 'vitest'
import { findMissingIndexes, type ExistingIndex } from '../index-check'

describe('findMissingIndexes（PERF_INCIDENT_2026-06 批 2）', () => {
  const existing: ExistingIndex[] = [
    { key: { _id: 1 } },
    { key: { targetCharacterId: 1, isDelivered: 1, expiresAt: 1 } },
    { key: { id: 1 }, unique: true },
    { key: { expiresAt: 1 } },
  ]

  it('宣告的 index 都存在時回傳空陣列', () => {
    const problems = findMissingIndexes(
      [
        [{ targetCharacterId: 1, isDelivered: 1, expiresAt: 1 }, undefined],
        [{ id: 1 }, { unique: true }],
      ],
      existing
    )
    expect(problems).toEqual([])
  })

  it('偵測缺少的 index（key 不存在）', () => {
    const problems = findMissingIndexes(
      [[{ targetGameId: 1, isDelivered: 1 }, undefined]],
      existing
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('缺少 index')
    expect(problems[0]).toContain('targetGameId')
  })

  it('偵測 unique 約束缺失（key 存在但 DB 端非 unique）', () => {
    const problems = findMissingIndexes(
      [[{ expiresAt: 1 }, { unique: true }]],
      existing
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('unique')
  })

  it('偵測 TTL 不符（同 key 的普通 index 不等於 TTL index）', () => {
    // 批 3 關鍵場景：pending_events 的 expiresAt 從普通 index 轉 TTL，
    // key 相同但 expireAfterSeconds 不同，必須被視為不符
    const problems = findMissingIndexes(
      [[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]],
      existing
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('TTL')
  })

  it('TTL 秒數一致時通過', () => {
    const problems = findMissingIndexes(
      [[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]],
      [{ key: { expiresAt: 1 }, expireAfterSeconds: 0 }]
    )
    expect(problems).toEqual([])
  })

  it('全新空 DB（existing 為空）時宣告的 index 全數列為缺失', () => {
    const problems = findMissingIndexes(
      [
        [{ id: 1 }, { unique: true }],
        [{ createdAt: 1 }, undefined],
      ],
      []
    )
    expect(problems).toHaveLength(2)
    expect(problems.every((p) => p.includes('缺少 index'))).toBe(true)
  })
})
