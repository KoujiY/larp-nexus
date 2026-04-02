# Character Card (角色卡)

## Overview
A character card is the core unit of LARP Nexus. Each character belongs to one game and represents a single player's role. The character card is the exclusive interface for that player — each player only sees their own card.

## Character Card Editor (GM Side)

The character edit page (`components/gm/character-edit-tabs.tsx`) has **7 tabs** split into two groups:

**Narrative Group（敘事）**
| Tab | Component | Content |
|-----|-----------|---------|
| 基本設定 | `basic-settings-tab.tsx` | Name, description, personality, PIN lock |
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

## Core Data Model

```typescript
interface CharacterData {
  id: string;
  gameId: string;
  name: string;
  description: string;
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
- [basic-info.md](./basic-info.md) — name, description, PIN
- [public-info.md](./public-info.md) — player's pre-game knowledge
- [hidden-info.md](./hidden-info.md) — what character doesn't know about themselves
- [stats.md](./stats.md) — numeric stats and temporary effects
- [../tasks/task-management.md](../tasks/task-management.md) — tasks
- [../items/item-concepts.md](../items/item-concepts.md) — items
- [../skills/skill-concepts.md](../skills/skill-concepts.md) — skills
