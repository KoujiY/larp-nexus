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

## GMUser（GM 帳戶）

基本欄位：

| 欄位 | 型別 | 說明 |
|------|------|------|
| email | string | 帳戶信箱（唯一、lowercase） |
| displayName | string | 顯示名稱（最多 50 字） |
| avatarUrl | string (optional) | 頭像 URL |
| aiConfig | object (optional) | AI 服務設定（見下表），首次設定前不存在 |

### aiConfig（optional）

AI 服務設定，首次設定前不存在。

| 欄位 | 型別 | 說明 |
|------|------|------|
| provider | string | AI 服務提供商（openai / gemini / custom） |
| baseUrl | string | API 端點 URL |
| model | string | 模型名稱 |
| encryptedApiKey | string | AES-256-GCM 加密的 API Key（格式：iv:encrypted:authTag） |
| keyProvider | string? | API Key 驗證成功時記錄的 provider，用於前端顯示 provider 不符提示 |

## Key Model Files
- `lib/db/models/GMUser.ts` — GMUser mongoose model（含 aiConfig 加密儲存）
- `lib/db/models/Character.ts` — Character mongoose model（Phase A 已重構，共用 `createBaseCharacterSchemaFields()` factory）
- `lib/db/models/CharacterRuntime.ts` — CharacterRuntime mongoose model（與 Character.ts 共用 schema factory）
- `lib/db/models/Game.ts` / `GameRuntime.ts` — Game mongoose model（`publicInfo.blocks: BackgroundBlock[]`）
- TypeScript types: `types/character.ts`（含 `BackgroundBlock`）、`types/game.ts`（含 `PresetEvent`）、`types/event.ts`

## Baseline vs Runtime
- **Baseline** (`characters`): GM's designed state. Editable anytime.
- **Runtime** (`character_runtimes`): Created from Baseline copy when game starts. Receives all in-game changes. **Converted in place to snapshot when game ends**（`updateMany` 改 `type: 'runtime'` → `'snapshot'`，沿用原 `_id`，非複製＋刪除——見 `lib/game/end-game.ts`）。
- Player in Full Access mode reads from Runtime. Player in Preview mode reads from Baseline.

### Snapshot 語意
- snapshot 是純封存資料：目前 codebase 無任何讀取端（無快照檢視/還原 UI），僅 endGame 寫入。
- `{refId, type}` 索引非 unique——同一角色可存在多份 snapshot（每次結束遊戲一份）。
- snapshot 的 `_id` 即原 runtime 的 `_id`（2026-06-13 起，convert-in-place）；CharacterRuntime snapshot 以 `snapshotGameRuntimeId` 關聯所屬的 GameRuntime snapshot。

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
| 刪除角色 | `deleteCharacter` 收集頭像 + 物品/技能圖 | `collectCharacterImageUrls` → `deleteImagesFromBlob` |
| GM 編輯移除物品/技能 | `updateCharacter` 從 diff 收集被刪除項目的 `imageUrl` | fire-and-forget `deleteImagesFromBlob` |
| 玩家端偷竊/移除物品 | **不清理** — 物品移轉或減少數量，圖片跟隨物品 | N/A |
| 結束遊戲（Runtime 轉型為 snapshot） | **不清理** — 圖片永遠存於 Baseline | N/A |

## Skill / Item 可見性欄位

技能（Skill）與物品（Item）子文件皆包含以下可見性欄位：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `isHidden` | boolean | 預設 `false`；`true` 時玩家端不可見 |
| `hiddenAt` | Date (optional) | 最後一次可見性狀態變更的時間戳 |
| `autoRevealCondition` | `AutoRevealCondition` (optional) | 自動揭露條件（reveal-only，與隱藏資訊 / 任務共用同一型別） |

```typescript
type AutoRevealConditionType =
  | 'none'
  | 'items_viewed'
  | 'items_acquired'
  | 'secrets_revealed'
  | 'skills_revealed'
  | 'items_revealed'
  | 'skill_used'
  | 'item_used';

interface AutoRevealCondition {
  type: AutoRevealConditionType;
  itemIds?: string[];      // items_viewed / items_acquired / item_used / items_revealed
  secretIds?: string[];    // secrets_revealed
  skillIds?: string[];     // skills_revealed / skill_used
  matchLogic?: 'and' | 'or';
}
```

這些欄位存在於 Baseline（`characters`）與 Runtime（`character_runtimes`）兩個 collection 中。

## 歷史變更備註
- Phase A：Character/CharacterRuntime schema 透過 `createBaseCharacterSchemaFields()` factory 共用，消除 ~1292 行重複。
- Phase D：Game `publicInfo` 從 `{ worldSetting, intro, chapters }` 改為 `{ blocks: BackgroundBlock[] }`，Character `publicInfo.background` 從 `string` 改為 `BackgroundBlock[]`，兩者共用同一段落結構。PIN 為固定 4 位數字。
