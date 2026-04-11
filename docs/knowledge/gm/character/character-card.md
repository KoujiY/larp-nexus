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

### WebSocket 衝突解決策略（character-edit-tabs.tsx）

當 GM 正在編輯角色卡的同時，玩家的動作（穿脫裝備、使用道具/技能、效果過期等）會透過 WebSocket 推送過來。若直接 `router.refresh()` 會覆蓋 GM 未儲存的編輯，因此採用兩層維度的衝突解決策略：

**維度 1 — Affected Tabs**（事件會影響哪些 tab 的資料顯示）：
| 事件 | 影響的 tab |
|-----|-----------|
| `equipment.toggled` | stats, items |
| `character.affected` | stats |
| `effect.expired` | stats |
| `skill.used` | stats |
| `role.updated` silentSync | stats（彙整入口） |
| `role.inventoryUpdated` | items |
| `item.transferred` | items |

**維度 2 — Tab Policy**（該 tab 正在編輯時如何處理）：
| Tab | Policy | 行為 |
|-----|--------|------|
| **stats** | **Trump** | 主動 `discardOne('stats')` + toast 告知，玩家動作優先。helper: `discardStatsAndRefresh` |
| **items** | **Guard** | dirty 時擋下 `router.refresh`，保留 GM 編輯不覆蓋 |
| **items**（例外） | **Trump** | `item.transferred` 特別走 discardOne，因為玩家已分裂 items 陣列，GM 儲存會產生兩端重複 |
| secrets / tasks / skills / basic / background | **Guard**（隱式） | 本階段未主動處理，影響較低 |

**Items tab 的 live overlay 例外**（`items-edit-form.tsx`）：
- Items tab guard policy 會讓 items dirty 時 `router.refresh` 被擋 → 「裝備中」badge 無法跟上玩家動作
- 解法：items-edit-form **直接訂閱** `equipment.toggled`，寫入 `liveEquippedByWs: Map<itemId, boolean>` overlay
- Overlay **不寫入 items state**（避免歷史偽 dirty bug — WS payload 與 RSC payload 序列化差異會被 `useFormGuard` 判成 dirty）
- Render 時透過 `displayItems` 投影 overlay、save 時合併進 payload（避免 GM 儲存把 server 的 equipped 倒回去）、RSC refresh 或 discard 時清空

**未來擴充方向**：若要擴到 secrets / tasks 的 trump policy，可把當前的 `STATS_AFFECTING_EVENTS` / `ITEMS_ONLY_EVENTS` 分類陣列升級為顯式的 `Record<EventType, TabKey[]>` + `Record<TabKey, 'trump' | 'guard'>`。參考 `docs/refactoring/NEXT_DEVELOPMENT_PLAN.md` §3.5-followup。

## Image Upload

所有圖片透過 `components/shared/image-upload-dialog.tsx` 上傳，流程：選圖 → 前端壓縮（Canvas API, `lib/image/compress.ts`）→ 上傳至 Vercel Blob（`lib/image/upload.ts`）→ 寫入 DB。

| 圖片類型 | Server Action | Blob 路徑 | 壓縮 Preset |
|---------|--------------|-----------|------------|
| 角色頭像 | `uploadCharacterImage` | `characters/{id}/...` | `characterImage` 1200×1200 |
| 道具圖片 | `uploadAbilityImage` mode='item' | `items/{charId}/{itemId}/...` | `itemImage` 600×600 |
| 技能圖片 | `uploadAbilityImage` mode='skill' | `skills/{charId}/{skillId}/...` | `skillImage` 600×600 |

**寫入策略**：圖片永遠寫入 Baseline，遊戲進行中額外同步到 Runtime。詳見 `docs/knowledge/architecture/data-models.md`。

**清理策略**：上傳新圖時自動刪除舊圖；刪除角色時批次清理所有關聯圖片；GM 編輯移除道具/技能時清理其圖片。詳見 `data-models.md` Vercel Blob 圖片生命週期。

## Runtime 限制
遊戲進行中（`isActive`）禁止新增或刪除角色：
- `createCharacter` / `deleteCharacter` server action 偵測 `game.isActive` 直接回傳錯誤（`GAME_ACTIVE`）
- UI：新增角色卡片改為「遊戲進行中無法新增角色」提示；刪除按鈕隱藏
- 原因：`createCharacter` 只建立 Baseline，不建立 Runtime document，導致玩家端看不到新角色

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
