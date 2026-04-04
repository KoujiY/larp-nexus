# Character Card (角色卡)

## Overview
A character card is the core unit of LARP Nexus. Each character belongs to one game and represents a single player's role. The character card is the exclusive interface for that player — each player only sees their own card.

## Character Card Editor (GM Side)

The character edit page (`components/gm/character-edit-tabs.tsx`) has **7 tabs** split into two groups:

**Narrative Group（敘事）**
| Tab | Component | Content |
|-----|-----------|---------|
| 基本設定 | `basic-settings-tab.tsx` | Name, description, slogan, personality, PIN lock |
| 背景故事 | `background-story-tab.tsx` | Background blocks + relationships |
| 隱藏資訊 | `secrets-tab.tsx` | Secrets with reveal conditions |

**Mechanic Group（機制）**
| Tab | Component | Content |
|-----|-----------|---------|
| 數值 | `stats-edit-form.tsx` | Stats grid with percentage watermark |
| 任務 | `tasks-edit-form.tsx` | Dual-column layout (normal + hidden) |
| 道具 | `items-edit-form.tsx` | AbilityCard grid with expand/collapse |
| 技能 | `skills-edit-form.tsx` | AbilityCard grid (shared with items) |

### Shared Patterns（所有 Tab 共用）

- **Soft-delete**: `deletedIds: Set<string>` + `effectiveData` filtered for `useFormGuard` / save
- **Status badges**: NEW (`primary-solid`) / MODIFIED (`primary`) via `GM_STATUS_BADGE_BASE`
- **Empty states**: `GmEmptyState` component with icon + title + action button
- **Shared styles**: `lib/styles/gm-form.ts` — label, input, badge, scrollbar, section, accent card
- **Shared components**: `GmInfoLine` (label:value), `GmEmptyState`, `DashedAddButton`, `IconActionButton`
- **Form guard**: `useFormGuard` hook（`hooks/use-form-guard.ts`）— 所有 Tab 共用。透過 module-level ref-counting + `history.pushState` monkey-patch 攔截 Next.js client-side 導航。已知限制：若引入會 patch pushState 的第三方 SDK 可能衝突；瀏覽器 Navigation API 成熟後可替代（截至 2026-04 Firefox 尚未支持）

## Image Upload

所有圖片透過 `components/shared/image-upload-dialog.tsx` 上傳，流程：選圖 → 前端壓縮（Canvas API, `lib/image/compress.ts`）→ 上傳至 Vercel Blob（`lib/image/upload.ts`）→ 寫入 DB。

| 圖片類型 | Server Action | Blob 路徑 | 壓縮 Preset |
|---------|--------------|-----------|------------|
| 角色頭像 | `uploadCharacterImage` | `characters/{id}/...` | `characterImage` 1200×1200 |
| 道具圖片 | `uploadAbilityImage` mode='item' | `items/{charId}/{itemId}/...` | `itemImage` 600×600 |
| 技能圖片 | `uploadAbilityImage` mode='skill' | `skills/{charId}/{skillId}/...` | `skillImage` 600×600 |

**寫入策略**：圖片永遠寫入 Baseline，遊戲進行中額外同步到 Runtime。詳見 `docs/knowledge/architecture/data-models.md`。

**清理策略**：上傳新圖時自動刪除舊圖；刪除角色時批次清理所有關聯圖片；GM 編輯移除道具/技能時清理其圖片。詳見 `data-models.md` Vercel Blob 圖片生命週期。

## Core Data Model

```typescript
interface CharacterData {
  id: string;
  gameId: string;
  name: string;
  description: string;
  slogan?: string;
  imageUrl?: string;
  hasPinLock: boolean;
  publicInfo?: PublicInfo;
  secretInfo?: SecretInfo;      // hidden info (隱藏資訊)
  tasks?: Task[];
  items?: Item[];
  stats?: Stat[];
  skills?: Skill[];
  temporaryEffects?: TemporaryEffect[];
  isGameActive?: boolean;
}
```

## Related Knowledge
- [basic-info.md](./basic-info.md) — name, description, slogan, personality, PIN
- [public-info.md](./public-info.md) — player's pre-game knowledge
- [hidden-info.md](./hidden-info.md) — what character doesn't know about themselves
- [stats.md](./stats.md) — numeric stats and temporary effects
- [../tasks/task-management.md](../tasks/task-management.md) — tasks
- [../items/item-concepts.md](../items/item-concepts.md) — items
- [../skills/skill-concepts.md](../skills/skill-concepts.md) — skills
