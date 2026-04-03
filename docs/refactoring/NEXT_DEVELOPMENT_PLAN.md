# 下一階段開發規劃

> 本文件整理 Phase E 合併後需在獨立分支進行的功能開發項目。

## 分支策略

| 分支名稱 | 涵蓋項目 | 說明 |
|----------|---------|------|
| `feat/slogan-and-image` | #1 劇本標語 + #2 圖片上傳 | 獨立性高、變動範圍小 |
| `feat/equipment-system` | #3 裝備系統擴充 + #4 目標選擇改進 | 高度關聯、需一起設計 |
| `test/e2e` | #5 E2E 測試 | 可與功能分支平行進行 |

---

## 1. 劇本標語欄位（Slogan）

**目標**：為角色新增「劇本標語」欄位，用於在角色卡上方顯示一句話概括角色定位。

### 需求
- Character schema 新增 `slogan: string` 欄位
- GM 編輯頁面的基本資訊區塊新增輸入欄位
- 玩家角色卡 header 區域顯示 slogan
- Baseline / Runtime 均需同步

### 影響範圍
- `types/character.ts`
- `lib/db/schemas/` — Character / CharacterRuntime schema
- `components/gm/character-edit-form.tsx` — 基本資訊 tab
- `components/player/character-card-view.tsx` — header 區域
- `lib/character/field-updaters/` — 新增或擴充 basic-info updater

---

## 2. 圖片上傳系統

**目標**：建立統一的圖片上傳機制，取代目前各處分散的圖片 URL 輸入。

### 需求
- 建立共用的圖片上傳元件（支援裁切、壓縮、預覽）
- 整合 Vercel Blob 作為儲存後端
- 替換以下位置的圖片輸入：
  - 角色圖片（Character avatar）
  - 道具圖片（Item image）
  - 技能圖片（Skill image）
  - 劇本封面（Game cover）

### 影響範圍
- 新增 `components/shared/image-uploader.tsx`
- 新增 `app/api/upload/` — 上傳 API route
- `components/gm/character-edit-form.tsx` — 角色圖片
- `components/gm/ability-edit-wizard.tsx` — 道具/技能圖片
- `components/gm/game-info-tab.tsx` — 劇本封面
- `lib/db/schemas/` — 可能需要儲存 blob URL 和 metadata

### 技術考量
- Vercel Blob 有 4.5MB 限制（免費方案），需前端壓縮
- 考慮 `sharp` 後端壓縮作為備選
- 需處理圖片刪除（避免 orphan blobs）

---

## 3. 裝備系統擴充

**目標**：將現有的「道具」類型體系從 `消耗品 | 裝備` 擴充為 `消耗品 | 道具 | 裝備`，其中：
- **消耗品**（consumable）：維持現行行為，使用次數歸零後不可再使用
- **道具**（tool）：原本的「裝備」改名而來，保留原行為
- **裝備**（equipment）：全新類別，玩家可主動勾選啟用，啟用後持續生效

### 需求

#### Schema 變更
- Item type enum：`consumable | tool | equipment`
- Equipment 新增欄位：
  - `equipped: boolean` — 是否已裝備
  - `statBoosts: Array<{ statName: string; value: number }>` — 裝備提供的數值加成
- 資料遷移：現有 `equipment` type 改名為 `tool`

#### GM 側
- AbilityEditWizard 新增 equipment type 選項
- Equipment 編輯時可設定數值加成
- GM Dashboard 角色檢視中顯示裝備狀態

#### 玩家側
- 道具列表區分三種類型的視覺呈現
- Equipment 卡片新增「裝備/卸除」toggle
- 裝備時數值自動加成，卸除時自動移除
- 數值頁面顯示裝備加成的 breakdown

#### Runtime 邏輯
- 角色數值計算需考慮裝備加成
- 裝備狀態變更需觸發 WebSocket 事件通知 GM
- 裝備效果需與現有效果系統（時效性效果）共存

### 影響範圍
- `types/character.ts` — Item type 定義
- `lib/db/schemas/` — Item sub-schema
- `lib/item/` — 道具使用邏輯
- `app/actions/` — Server actions for equip/unequip
- `components/player/item-card.tsx` — 玩家道具卡
- `components/player/item-detail-dialog.tsx` — 道具詳情
- `components/gm/ability-edit-wizard.tsx` — GM 編輯
- `hooks/use-item-usage.ts` — 道具使用 hook
- WebSocket events — 新增 equip/unequip 事件

---

## 4. 目標選擇改進（自身效果）

**目標**：解決當前對抗檢定無法同時設定「影響對方」和「影響自己」效果的限制。

### 現況問題
目前技能設定對抗檢定後，效果目標只能是對方。無法實現「對抗成功後，除了扣對方血，同時補自己血」這類常見 RPG 技能。

### 需求
- 效果（Effect）新增 `target` 欄位：`opponent | self | both`
- 每個效果可獨立指定目標方向
- 對抗成功後，`opponent` 效果套用到對方，`self` 效果套用到自己
- GM 編輯界面需直覺地表達此設計

### 影響範圍
- `types/character.ts` — Effect type 定義
- `lib/db/schemas/` — Effect sub-schema
- `lib/contest/` — 對抗結算邏輯
- `lib/skill/` / `lib/item/` — 使用效果套用
- `components/gm/ability-edit-wizard.tsx` — 效果編輯步驟
- `app/actions/` — skill-usage / item-usage actions

### 技術考量
- 需向下相容：現有效果預設 `target: 'opponent'`（無 self 效果的行為不變）
- 資料遷移：為現有效果補上 `target: 'opponent'` 預設值
- 對抗失敗時 self 效果是否生效？建議預設不生效，但可設計為可配置

---

## 5. E2E 測試

**目標**：建立端對端測試覆蓋關鍵使用者流程。

### 優先測試流程
1. **GM 登入** → Magic Link 流程
2. **劇本建立** → 填寫基本資訊 → 儲存
3. **角色建立** → 基本資訊 → 數值 → 技能/道具 → 儲存
4. **玩家解鎖** → PIN 輸入 → 預覽模式 / 完整模式
5. **技能使用** → 無檢定 / 隨機檢定
6. **對抗流程** → 攻擊方發起 → 防守方回應 → 結果通知
7. **道具操作** → 使用 / 展示 / 轉移
8. **廣播訊息** → GM 發送 → 玩家接收

### 技術選型
- **Playwright** 作為 E2E 測試框架
- 需建立測試用 seed 資料
- 考慮 WebSocket 事件的等待策略

### 影響範圍
- 新增 `e2e/` 目錄
- 新增 `playwright.config.ts`
- 新增 `package.json` scripts（`test:e2e`）
- 可能需要測試用 API routes 或 seed scripts

---

## 優先順序建議

```
Phase 1: feat/slogan-and-image（1-2 天）
  ├── #1 Slogan 欄位（小改動）
  └── #2 圖片上傳（中等）

Phase 2: feat/equipment-system（3-5 天）
  ├── #3 裝備系統（大改動）
  └── #4 目標選擇改進（中等）

Phase 3: test/e2e（2-3 天，可與 Phase 1-2 平行）
  └── #5 E2E 測試建置
```

## 注意事項

- 每個分支合併前需確保：
  - TypeScript 無型別錯誤（`npm run type-check`）
  - 單元/元件測試全部通過（`npm run test`）
  - Production build 成功（`npm run build`）
  - 若涉及 schema 變更，需附帶 migration 腳本
- 裝備系統（#3）和目標選擇（#4）涉及 schema 變更，合併時需同步執行資料遷移
