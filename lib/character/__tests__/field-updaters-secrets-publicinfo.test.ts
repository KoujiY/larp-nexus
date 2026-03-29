import { describe, it, expect } from 'vitest'
import { updateCharacterSecrets } from '../field-updaters/secrets'
import { updateCharacterPublicInfo } from '../field-updaters/public-info'
import type { MongoSecret } from '@/lib/db/types/mongo-helpers'

// ─── updateCharacterSecrets ──────────────────────────────────────────────────

const baseSecret = () => ({
  id: 'secret-1',
  title: '秘密身份',
  content: '我其實是國王',
  isRevealed: false,
  revealCondition: '',
})

describe('updateCharacterSecrets', () => {
  it('returns empty array for empty input', () => {
    expect(updateCharacterSecrets([])).toEqual([])
  })

  it('maps basic secret fields', () => {
    const [result] = updateCharacterSecrets([baseSecret()]) as unknown as MongoSecret[]
    expect(result.id).toBe('secret-1')
    expect(result.title).toBe('秘密身份')
    expect(result.isRevealed).toBe(false)
  })

  it('sets revealedAt when secret transitions from hidden to revealed', () => {
    const secret = { ...baseSecret(), isRevealed: true }
    const [result] = updateCharacterSecrets([secret], [])
    expect(result.revealedAt).toBeInstanceOf(Date)
  })

  it('preserves existing revealedAt from old secret', () => {
    const existingDate = new Date('2026-02-01')
    const oldSecret: MongoSecret = {
      ...baseSecret(),
      isRevealed: true,
      revealedAt: existingDate,
    }
    const newSecret = { ...baseSecret(), isRevealed: true }
    const [result] = updateCharacterSecrets([newSecret], [oldSecret])
    expect(result.revealedAt).toEqual(existingDate)
  })

  it('does not set revealedAt when secret stays hidden', () => {
    const [result] = updateCharacterSecrets([baseSecret()], [])
    expect(result.revealedAt).toBeUndefined()
  })

  it('sets autoRevealCondition when provided and type is not none', () => {
    const condition = { type: 'items_viewed', itemIds: ['item-1'] }
    const secret = { ...baseSecret(), autoRevealCondition: condition }
    const [result] = updateCharacterSecrets([secret])
    expect(result.autoRevealCondition).toEqual(condition)
  })

  it('clears autoRevealCondition when type is none', () => {
    const oldSecret: MongoSecret = {
      ...baseSecret(),
      autoRevealCondition: { type: 'items_viewed', itemIds: ['item-1'] },
    }
    const newSecret = { ...baseSecret(), autoRevealCondition: { type: 'none' } }
    const [result] = updateCharacterSecrets([newSecret], [oldSecret])
    expect(result.autoRevealCondition).toBeUndefined()
  })

  it('preserves old autoRevealCondition when new secret has no condition', () => {
    const oldCondition = { type: 'items_viewed', itemIds: ['item-2'] }
    const oldSecret: MongoSecret = {
      ...baseSecret(),
      autoRevealCondition: oldCondition as MongoSecret['autoRevealCondition'],
    }
    const [result] = updateCharacterSecrets([baseSecret()], [oldSecret])
    expect(result.autoRevealCondition).toEqual(oldCondition)
  })
})

// ─── updateCharacterPublicInfo ───────────────────────────────────────────────

describe('updateCharacterPublicInfo', () => {
  it('returns provided fields', () => {
    const blocks = [{ type: 'body' as const, content: '流浪騎士' }]
    const result = updateCharacterPublicInfo({
      background: blocks,
      personality: '正直',
      relationships: [{ targetName: 'Alice', description: '朋友' }],
    })
    expect(result.background).toEqual(blocks)
    expect(result.personality).toBe('正直')
    expect(result.relationships).toHaveLength(1)
  })

  it('falls back to currentPublicInfo for missing fields', () => {
    const current = { background: [{ type: 'body' as const, content: '皇家騎士' }], personality: '驕傲', relationships: [] }
    const result = updateCharacterPublicInfo({}, current)
    expect(result.background).toEqual(current.background)
    expect(result.personality).toBe('驕傲')
  })

  it('normalizes legacy string background from currentPublicInfo', () => {
    const current = { background: '舊字串背景' as unknown as import('@/types/character').BackgroundBlock[], personality: '冷酷', relationships: [] }
    const result = updateCharacterPublicInfo({}, current)
    expect(result.background).toEqual([{ type: 'body', content: '舊字串背景' }])
  })

  it('returns empty array and empty string as defaults', () => {
    const result = updateCharacterPublicInfo({})
    expect(result.background).toEqual([])
    expect(result.personality).toBe('')
    expect(result.relationships).toEqual([])
  })

  it('new value overrides currentPublicInfo', () => {
    const current = { background: [{ type: 'body' as const, content: '舊背景' }], personality: '冷酷', relationships: [] }
    const newBlocks = [{ type: 'title' as const, content: '新章節' }, { type: 'body' as const, content: '新背景' }]
    const result = updateCharacterPublicInfo({ background: newBlocks }, current)
    expect(result.background).toEqual(newBlocks)
    expect(result.personality).toBe('冷酷') // 未提供，從 current 繼承
  })
})
