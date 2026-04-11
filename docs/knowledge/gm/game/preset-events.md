# Preset Events (預設事件系統)

## Overview
GM 在準備階段（Baseline）預先編排事件腳本，遊戲進行時（Runtime）從控制台一鍵觸發。支援廣播通知、數值變更、隱藏資訊/任務揭露等操作。

## Data Model

### Baseline（Game.presetEvents）
```typescript
interface PresetEvent {
  id: string;
  name: string;
  description?: string;
  showName?: boolean; // 玩家端是否顯示事件名稱
  actions: PresetEventAction[];
}
```

### Runtime（GameRuntime.presetEvents）
```typescript
interface PresetEventRuntime extends PresetEvent {
  executedAt?: Date;
  executionCount: number;
  runtimeOnly?: boolean; // true = 遊戲進行中新增，不寫回 Baseline
}
```

### Action Types
| Type | 用途 | 目標型態 |
|------|------|---------|
| `broadcast` | 廣播通知 | `'all'` 或 `string[]`（characterIds） |
| `stat_change` | 數值變更 | `'all'` 或 `string[]`（characterIds） |
| `reveal_secret` | 揭露隱藏資訊 | 單一 characterId + secretId |
| `reveal_task` | 揭露隱藏任務 | 單一 characterId + taskId |

### stat_change 欄位（對齊 Item/Skill Effect）
| 欄位 | 說明 |
|------|------|
| `statChangeTarget` | `'value'`（當前值）或 `'maxValue'`（最大值） |
| `statChangeValue` | 變更量（正負整數，相對值） |
| `syncValue` | 修改最大值時是否同步調整當前值 |
| `duration` | 持續時間（秒）；`0`/`undefined` = 永久，`>0` = 時效性 |

時效性效果使用 `createTemporaryEffectRecord()`，`sourceType: 'preset_event'`。過期後由 `check-expired-effects.ts` 自動恢復數值。

## Baseline vs Runtime Strategy
| Layer | 行為 |
|-------|------|
| **Baseline (Game)** | GM 編輯事件定義（CRUD），無執行狀態 |
| **Runtime (GameRuntime)** | 開始遊戲時從 Baseline 複製，加上 executedAt / executionCount |

複製邏輯位於 `lib/game/start-game.ts`，將 Baseline 事件初始化為 `executionCount: 0`。

## GM UI

### 獨立 Tab
預設事件有專屬的 Tab（`game-edit-tabs.tsx` 的「預設事件」分頁），不再嵌在劇本資訊 Tab 底部。

### 元件結構
| 元件 | 用途 |
|------|------|
| `components/gm/preset-events-edit-form.tsx` | 統一的預設事件管理（Baseline + Runtime 共用） |
| `components/gm/preset-event-card.tsx` | 事件卡片（展開/收合，對齊 AbilityCard 風格） |
| `components/gm/preset-event-editor.tsx` | 事件編輯 Dialog（master-detail：左欄動作列表 + 右欄編輯器） |
| `components/gm/preset-event-action-editor.tsx` | 單一動作編輯器（依類型顯示不同欄位） |

### 卡片佈局
- Grid 佈局（1/2/3 欄 RWD），對齊技能/物品分頁
- 收合時：動作類型 badges + 名稱 + 描述 line-clamp-1 + 動作數 footer
- 展開時：完整描述 + 動作列表（左側邊線卡片風格，同 AbilityCard EffectCard）
- Runtime 額外顯示：已執行次數、runtimeOnly badge（執行功能僅在控制台快速面板）

### 編輯 Dialog
- Master-Detail 佈局（對齊 AbilityEditWizard Step 4 效果設計）
- 上方：事件名稱 + 備註說明
- 左側欄：動作列表（可新增/刪除/選擇）
- 右側欄：選中動作的編輯器
- 動作無順序性，不使用拖拽排序

### Baseline vs Runtime 模式
同一元件 `PresetEventsEditForm` 透過 `isRuntime` prop 切換行為：
- **Baseline**：CRUD 寫入 Game，使用 `createPresetEvent` / `updatePresetEvent` / `deletePresetEvent`
- **Runtime**：CRUD 寫入 GameRuntime，使用 `createRuntimePresetEvent` / `updateRuntimePresetEvent` / `deleteRuntimePresetEvent`
- **Runtime 額外功能**：執行按鈕呼叫 `runPresetEvent`，顯示執行結果

## Server Actions
- Baseline CRUD：`app/actions/preset-events.ts` — `createPresetEvent` / `updatePresetEvent` / `deletePresetEvent`
- Runtime CRUD：`createRuntimePresetEvent` / `updateRuntimePresetEvent` / `deleteRuntimePresetEvent`（只寫 GameRuntime）
- 查詢：`getRuntimePresetEvents` — 從 GameRuntime 讀取含執行狀態的事件列表
- 執行：`runPresetEvent` → `lib/preset-event/execute-preset-event.ts`

## Execution Logic

### 策略：Best-effort
每個動作依序執行，單一失敗不阻斷後續。執行結果分為：
- `success`：成功執行
- `skipped`：目標不存在、已揭露等（跳過）
- `failed`：執行過程發生錯誤

### 複用的既有系統
| 動作類型 | 複用 |
|---------|------|
| broadcast | Pusher trigger（全體用 game channel，指定角色用 character channel） |
| stat_change | `computeStatChange()` + `createTemporaryEffectRecord()`（時效性）+ `emitRoleUpdated()` |
| reveal_secret | `CharacterRuntime.updateOne` + `emitSecretRevealed()` |
| reveal_task | `CharacterRuntime.updateOne` + `emitTaskRevealed()` |

## Referential Integrity（參照完整性）

採 C+D 混合策略：
- **編輯時**：`lib/preset-event/validate-action.ts` 掃描動作引用有效性，無效的標上 ⚠️ badge
- **執行時**：找不到目標直接跳過，回報 reason
- **不阻擋 GM 編輯角色**：刪除角色/數值/隱藏資訊/任務不會阻止也不會自動清理事件動作

## Runtime 限制

### 角色新增/刪除禁用
遊戲進行中（`isActive`）禁止新增或刪除角色，防止 Baseline/Runtime 不一致：
- Server action 層：`createCharacter` / `deleteCharacter` 偵測 `game.isActive` 回傳錯誤
- UI 層：新增角色卡片改為提示文字；刪除按鈕隱藏

### Runtime-only 事件
Runtime 中新增的事件標記 `runtimeOnly: true`：
- 只寫 GameRuntime，不回寫 Baseline
- 遊戲結束/重啟後不會保留
- UI 顯示「僅本場次」badge 提醒 GM

## showName（玩家端名稱顯示）

編輯 Dialog 中事件名稱旁有一個 Eye icon + Switch toggle，控制 `showName`：
- **啟用**：玩家在時效性效果面板和通知中看到事件名稱
- **關閉**（預設）：玩家看到「未知來源」

實作方式：`sourceName` 欄位以 `'預設事件'` 作為 sentinel value（Mongoose `required` 不允許空字串），玩家端檢查 `sourceType === 'preset_event'` 且 `sourceName === '預設事件'` 時顯示為「未知來源」。

相關檔案：
- `components/player/active-effects-panel.tsx` — 效果面板顯示邏輯
- `lib/utils/event-mappers/misc-events.ts` — 效果過期通知映射

## Runtime 控制台快速面板

執行功能僅在 Runtime 控制台的 `PresetEventQuickPanel` 提供（卡片頁面不含執行按鈕）：
- Select 下拉選單 + 執行按鈕
- 執行前彈出確認 Dialog（Zap icon + 動作數說明）
- 執行結果 Toast：成功/跳過/失敗分組顯示，使用 `PRESET_ACTION_TYPE_LABELS` 顯示中文動作類型

## Effect Expiration Log

效果過期時（`check-expired-effects.ts`）會同時：
1. 推送 `effect.expired` WebSocket 事件給玩家
2. 寫入 `writeLog()` 記錄（`action: 'effect_expired'`）供 GM 歷史紀錄顯示
3. GM 控制台的 `RuntimeConsoleWsListener` 收到 `effect.expired` 後觸發 `onLogRefresh` 刷新歷史紀錄

## Shared Utilities

| 模組 | 用途 | 使用處 |
|------|------|--------|
| `lib/utils/format-stat-delta.ts` | 數值 delta 格式化 | GM event-log、player role-events/character-affected mappers |
| `lib/utils/format-duration.ts` | 持續時間格式化（`'short'`/`'long'`） | ability-card、preset-event-card、player effect-display |
| `lib/preset-event/constants.ts` | `PRESET_ACTION_TYPE_LABELS` 動作類型標籤 | editor、card、quick-panel |

## Future Extensibility
Action type 為 union type，未來可擴充 `grant_item`、`remove_item`、`use_skill` 等。
