# Data Models (資料模型)

## Collections Overview
| Collection | Purpose |
|-----------|---------|
| `gm_users` | GM accounts (email + displayName + avatarUrl) |
| `games` | Game (劇本) baseline data |
| `characters` | Character baseline data |
| `character_runtimes` | Live character state during active game |
| `game_runtimes` | Live game state during active game |
| `magic_links` | Short-lived auth tokens |
| `pending_events` | Offline event queue for reconnecting players |
| `logs` | Operation audit log |

## Key Model Files
- `lib/db/models/Character.ts` — Character mongoose model（Phase A 已重構，共用 `createBaseCharacterSchemaFields()` factory）
- `lib/db/models/CharacterRuntime.ts` — CharacterRuntime mongoose model（與 Character.ts 共用 schema factory）
- `lib/db/models/Game.ts` / `GameRuntime.ts` — Game mongoose model（`publicInfo.blocks: BackgroundBlock[]`）
- TypeScript types: `types/character.ts`（含 `BackgroundBlock`）、`types/game.ts`（含 `PresetEvent`）、`types/event.ts`

## Baseline vs Runtime
- **Baseline** (`characters`): GM's designed state. Editable anytime.
- **Runtime** (`character_runtimes`): Created from Baseline snapshot when game starts. Receives all in-game changes. Deleted when game ends.
- Player in Full Access mode reads from Runtime. Player in Preview mode reads from Baseline.

### 寫入策略差異
| 欄位類型 | 遊戲未進行 | 遊戲進行中 | 原因 |
|---------|-----------|-----------|------|
| 一般欄位（名稱、數值等） | Baseline | Runtime（via `getCharacterData`） | Runtime 為遊戲中的 source of truth |
| 圖片 URL（外部資源） | Baseline | **Baseline + Runtime 同步** | 圖片存於 Vercel Blob，若只寫 Runtime，遊戲結束後 URL 遺失且 Blob 檔案成為 orphan |

## Vercel Blob 圖片生命週期

所有圖片存放於 Vercel Blob，清理邏輯集中在 `lib/image/upload.ts`：

| 事件 | 清理機制 | 函數 |
|------|---------|------|
| 上傳新圖（替換舊圖） | `uploadImageToBlob` 的 `oldImageUrl` 參數 | `del(oldUrl)` |
| 刪除遊戲 | `deleteGame` 收集遊戲封面 + 所有角色圖片 | `deleteImagesFromBlob` |
| 刪除角色 | `deleteCharacter` 收集頭像 + 道具/技能圖 | `collectCharacterImageUrls` → `deleteImagesFromBlob` |
| GM 編輯移除道具/技能 | `updateCharacter` 從 diff 收集被刪除項目的 `imageUrl` | fire-and-forget `deleteImagesFromBlob` |
| 玩家端偷竊/移除道具 | **不清理** — 道具移轉或減少數量，圖片跟隨道具 | N/A |
| 結束遊戲（刪除 Runtime） | **不清理** — 圖片永遠存於 Baseline | N/A |

## 歷史變更備註
- Phase A：Character/CharacterRuntime schema 透過 `createBaseCharacterSchemaFields()` factory 共用，消除 ~1292 行重複。
- Phase D：Game `publicInfo` 從 `{ worldSetting, intro, chapters }` 改為 `{ blocks: BackgroundBlock[] }`，Character `publicInfo.background` 從 `string` 改為 `BackgroundBlock[]`，兩者共用同一段落結構。PIN 為固定 4 位數字。
