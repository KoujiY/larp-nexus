# 對抗一致性修復計畫（Contest Consistency）

> 分支：`fix/contest-consistency`
> 來源：BACKLOG「Code review 殘留發現 → 正確性」表的最後兩項
> 狀態：**已結案（2026-06-13）— 三項全數實作完成、逐項手動驗收通過、已封存**

## 背景與範圍

本包處理以下三項（第 3 項為拍板時決議納入），其餘 BACKLOG 項目不動：

1. **對抗效果 emit 先於 temporaryEffects 寫入**（`lib/contest/contest-effect-executor.ts:292`）
2. **isActive 快取放大既有 TOCTOU**（`lib/game/game-request-cache.ts` + `lib/game/end-game.ts`）
3. **startGame 鏡像 race**（D3 拍板「本包一併修」；設計見問題 2 末節）

### 前置脈絡：「攻擊方 pending 等待狀態」驗證項

BACKLOG 驗證項「攻擊方 pending 等待狀態被跳過 / dialog 提前消失」**尚未重驗**（原場景依賴真實團務負載，難以人工重現）。依開工規則，本計畫的 emit 順序修法分析需把「該症狀是獨立 bug」與「已隨效能修復消失」**兩種情境都納入**，並優先選擇兩種情境下都正確的修法。

---

## 問題 1：對抗效果 emit 先於 temporaryEffects 寫入

### 縱向分析

**向上（呼叫端）**：`executeContestEffects` 共 3 個呼叫點，全部在 `runWithGameCache` 內：
- `app/actions/contest-respond.ts:391`（attacker_wins 立即執行）
- `app/actions/contest-respond.ts:431`（defender_wins 立即執行）
- `app/actions/contest-select-item.ts:234`（選擇目標物品後延遲執行）

**向下（executor 內部時序，批 2 平行化後）**：
1. 效果迴圈中，`effect.duration > 0` 時 `createTemporaryEffectRecord()` **立即啟動**（promise push 進 `tempEffectWrites`，不 await）→ 內部走獨立的 `updateCharacterData({$push: temporaryEffects})`（`lib/effects/create-temporary-effect.ts:78`）
2. 迴圈後，每個 bucket 的 IIFE：`await updateCharacterData({$set: stats})` → 隨即 `emitCharacterAffected()`（`contest-effect-executor.ts:286-306`）
3. 最後 `await Promise.all([...bucketWrites, ...tempEffectWrites])`（line 310）

**Race**：同一角色的 `$set`（數值）與 `$push`（倒數條目）是兩個獨立 DB op 平行進行，emit 只等了 `$set`。

**client 端（事件消費者）**：
- 玩家端：`hooks/use-character-websocket-handler.ts:168-171` 收到 `character.affected` 即 `router.refresh()` → server 重新 render、`getCharacterData` 重讀角色 → 若 `$push` 未落地，看到**數值已變但無倒數條目**，且此錯誤畫面會持續到下一次任何刷新
- GM 端：`runtime-console-ws-listener` 直接從 payload 解析 stat 變動（零 DB 查詢）→ **不受影響**
- pending events 補送：離線玩家重連時寫入早已落地 → **不受影響**

**對照組（證明 bug 是對抗路徑專屬）**：非對抗路徑 `lib/effects/shared-effect-executor.ts:409` 對 `createTemporaryEffectRecord` 是 inline `await`，且通知由呼叫端在之後發送 → 無此 race。`lib/preset-event/execute-preset-event.ts:239` 同樣 inline `await` → 無此 race。

### 修法路線比較

| | 路線 A：await 順序 | 路線 B：寫入併入同 bucket | 路線 C：client 不依賴順序 |
|---|---|---|---|
| **做法** | `tempEffectWrites` 按角色分組；bucket IIFE 內先 await 該角色的 temp 寫入再 emit | temp effect record 收集進 bucket，與 `$set` 合併為**單一** `updateCharacterData({$set, $push: {temporaryEffects: {$each: [...]}}})`，emit 自然在落地後 | `character.affected` payload 攜帶 temp effect 資訊，client 不靠 refetch 取得倒數條目 |
| **DB ops（單角色 K 個時效效果）** | K 次 `$push` + 1 次 `$set`（不變） | **1 次**（省 K 次 roundtrip） | K+1 次（不變） |
| **平行度** | 寫入仍平行啟動，僅 emit 延後等待 → 損失極小 | 無損失（反而減少 op 數） | 無損失 |
| **複雜度** | 低-中（分組邏輯） | 中（executor 收集邏輯改寫 + `createTemporaryEffectRecord` 拆出 pure 的 record 建構函數，舊介面保留給其他 3 個呼叫端） | 高（payload 型別擴充、所有訂閱端配合、`router.refresh()` 模式被打破） |
| **正確性保證來源** | 應用層 await 順序（仍是兩個 op，依賴程式紀律） | **MongoDB 單文件原子性**（$set+$push 同 op，不可能被觀察到中間態） | client 容錯（治標；GM 端/補送端各自要處理） |
| **風險** | 未來改動 executor 時序易再引入 race | 偏離既有 helper 介面（以保留舊介面緩解）；`$push.$each` 順序語意需測試確認 | 與「事件→重抓」既有架構衝突；**改動 client 對抗事件處理區域，與 pending 症狀（若為真）的病灶重疊，有交互風險** |
| **pending 症狀兩情境** | 兩情境均安全（不動 client） | 兩情境均安全（不動 client） | 若症狀為真 bug，C 動到同一片 client 邏輯，可能遮蔽或加劇 |

### 推薦：路線 B

理由：
1. 正確性由 **DB 單文件原子性**保證，而非應用層時序紀律——這是結構性消除，不是縮小視窗
2. 效能淨改善（合併 roundtrip），與批 2 平行化的初衷一致
3. 不動 client，與 pending 症狀驗證項完全解耦——無論該症狀日後證實與否，本修法都不需重做

實作要點：
- `lib/effects/create-temporary-effect.ts` 拆出 `buildTemporaryEffectRecord()`（pure，無 DB），`createTemporaryEffectRecord()` 保留為 build + 寫入的組合（其他 3 個呼叫端不動）
- executor 的 `TargetBucket` 增加 `tempEffects: TemporaryEffect[]` 欄位，迴圈內改為 build 後入桶
- bucket IIFE 的 update 改為 `{$set, ...(tempEffects.length ? {$push: {temporaryEffects: {$each: tempEffects}}} : {})}`
- 倒數起點語意不變：`appliedAt`/`expiresAt` 在 build 時計算，與現行 `createTemporaryEffectRecord` 在迴圈內立即啟動的時間點等價（差異 < 數十 ms，且現行本就有 ms 級漂移）

### 測試策略（問題 1）

- **新建** `lib/contest/__tests__/contest-effect-executor.test.ts`（目前不存在，TDD 從零建立）：
  - 回歸：同角色「$set 數值 + $push 倒數條目」必須在**同一次** `updateCharacterData` 呼叫中（mock 斷言呼叫參數同時含 `$set` 與 `$push`）
  - 回歸：`emitCharacterAffected` 在該角色的 `updateCharacterData` resolve 之後才被呼叫（mock 時序斷言）
  - 既有行為保護：self/other bucket 分派、defender_wins 來源切換、無 duration 效果不產生 $push
- `lib/effects/__tests__/create-temporary-effect.test.ts`：`buildTemporaryEffectRecord` pure 函數的欄位/expiresAt 計算；舊介面 `createTemporaryEffectRecord` 行為不變

### E2E 影響評估（問題 1）

行為唯一可觀察差異：玩家端收到通知後重抓，倒數條目保證同時出現。既有 E2E 若有對抗+時效效果 flow，應仍通過（修復只會讓它更穩定）；無需新增 E2E（race 視窗毫秒級，E2E 無法穩定重現，正確性由 unit 層時序斷言保護）。

---

## 問題 2：isActive 快取放大既有 TOCTOU

### 縱向分析

**結構**：`runWithGameCache` 包裝 13 個 action 檔案的入口（contest-respond、skill-use、item-use、character-update…）。`resolveIsActive`（`lib/game/resolve-is-active.ts`）首次解析後，`isActive` 在**整個 action 期間**沿用快取。

**根因（快取之前就存在）**：`endGame`（`lib/game/end-game.ts:106-196`）三步無交易：
1. snapshot 建立（GameRuntime.create + CharacterRuntime.insertMany **複製** runtime 內容）
2. `deleteMany` 刪除 runtime
3. `Game.updateOne({isActive: false})`

**Race 視窗（endGame ∥ 玩家 action）**：

| 玩家寫入落地時間點 | 結果 | 嚴重度 |
|---|---|---|
| snapshot 複製**之前** | 寫入被快照保存 | ✅ 正常 |
| snapshot 複製後、deleteMany 前 | 寫入成功回報，但**不在快照中**，隨後被刪 → **silent data loss** | 🔴 最嚴重 |
| deleteMany 之後 | `findOneAndUpdate` 回 null → throw「找不到 Runtime Character」 | 🟡 loud failure，可接受 |

**快取的「放大」**：無快取時視窗 ≈ 單次 resolve→write 的間隙（ms 級）；快取後視窗 = 整個 action 期間（對抗 action 含多次寫入、可達數百 ms）。

**鏡像 race（startGame ∥ 玩家 action）**：玩家 action 快取 `isActive=false` → 寫 Baseline；同時 GM `startGame` 已複製 Baseline→Runtime → 該寫入只存在 Baseline，遊戲中看不到。影響面小（遊戲未開始時玩家僅 Preview mode，可寫操作極少），但修法應一併評估是否覆蓋。

**關鍵事實（影響方案選型）**：
- snapshot 在整個 codebase 中**只有 end-game.ts 寫入，無任何讀取端**（無快照檢視/還原 UI）——純封存資料
- `CharacterRuntime` 的 `{refId, type}` 索引**非 unique**——同一 refId 可存在多份 snapshot
- Atlas M0 是 replica set，技術上支援 multi-document transactions，但有效能/oplog 限制

### 修法方案比較

| | 方案 1：條件寫入（lifecycle 標記） | 方案 2：版本欄位 | 方案 3：convert-in-place（分析中新發現） | 方案 4：MongoDB transaction |
|---|---|---|---|---|
| **做法** | CharacterRuntime 加 `lifecycle: 'active' \| 'closing'`；endGame 第一步先 `updateMany` 標 closing，再 snapshot、再刪；玩家寫入 query 加 `lifecycle: 'active'` 條件，落空 throw | Game/Runtime 加 epoch，resolve 時記住、寫入時比對 | endGame 不做「複製＋刪除」，改為**原地** `updateMany` 把 runtime 轉成 snapshot（`type: 'runtime'→'snapshot'` + snapshotName + 關聯欄位） | endGame 三步包進 session transaction |
| **silent loss 視窗** | **閉合**（closing 標記後所有寫入被拒，快照內容穩定） | 無法閉合——版本號跨 collection 無法原子比對；要有效必須把版本放在被寫文件上 → **退化為方案 1 的變體** | **結構性消除**（轉換是 per-doc 原子操作，不存在「已拍快照但仍可寫」狀態；寫入要嘛進入成為快照的文件、要嘛 loud throw） | 閉合（但玩家寫入不在交易內，靠 write conflict 拒絕，需處理 TransientTransactionError） |
| **失敗模式** | 視窗內寫入 → loud throw（玩家重試即可） | 同左（若採文件內版本） | 轉換後寫入 → 既有「找不到 Runtime」loud throw（**零新增錯誤路徑**） | 交易衝突 → retry 邏輯複雜 |
| **影響面** | `end-game.ts` + `update-character-data.ts`（query 加條件）+ schema + **既有資料 migration**（補 lifecycle 欄位） | 同左 + `resolve-is-active.ts` | **只動 `end-game.ts`**；update/resolve/快取**零修改** | `end-game.ts` 大改 + 所有玩家寫入路徑的衝突重試 |
| **DB 寫入量（endGame）** | 現行 + 1 次 updateMany | 同左 | **減半**（原地轉換取代複製＋刪除） | 不變 |
| **新欄位/migration** | 需要 | 需要 | **不需要**（snapshot 沿用 runtime `_id`，無讀取端依賴） | 不需要 |
| **複雜度** | 中 | 中-高 | **低** | 高 |
| **風險** | lifecycle 欄位成為新的不變量，所有未來寫入路徑都要記得帶條件 | 同左且更抽象 | snapshot `_id` 語意改變（runtime `_id` 延續成 snapshot `_id`）——經查無讀取端，唯一引用是 endGame 回傳的 `snapshotId`（僅顯示用）；`startGame` 的 upsert 邏輯需確認與殘留 runtime 的交互 | M0 交易效能未知；玩家 action 改動面最大 |
| **startGame 鏡像覆蓋** | 不覆蓋（Baseline 無 lifecycle） | 可覆蓋（epoch 在 Game 上）但寫入端仍無法原子比對 | 不覆蓋（鏡像視窗的根因不同：Baseline 寫入 vs Runtime 複製） | 可覆蓋 |
| **TOCTOU 後快取語意** | 快取仍可 stale，但 stale 寫入會被條件擋下 | 同左 | 快取仍可 stale，但 stale 寫入撞上的是「文件已轉型」→ loud throw（與現行 deleteMany 後的行為一致，只是視窗中段不再 silent） | 快取不變 |

### 推薦：方案 3（convert-in-place）

理由：
1. **根因層級的修復**：BACKLOG 寫明根因是「snapshot→deleteMany→isActive=false 三步無交易」。方案 3 直接把「複製＋刪除」這個兩步結構消滅成單一原子轉換，silent loss 視窗不是被擋住而是**不存在**
2. **影響面最小**：只動 `end-game.ts`；`resolveIsActive` / `updateCharacterData` / 快取完全不動（BACKLOG 預想的「動核心資料層」反而可避免）
3. **失敗模式收斂**：視窗內的玩家寫入落入既有的「找不到 Runtime Character」loud throw 路徑——這條路徑上一輪已加上 throw 保護，無需新增錯誤處理
4. 無 migration、無新不變量、endGame 寫入量減半

**順序設計（方案 3 內部）**：
1. `Game.updateOne({isActive: false})` **提前到第一步** → 新進 action 解析到 false、路由 Baseline（語意：遊戲已結束，後續操作屬於賽後）
2. GameRuntime 原地轉換為 snapshot
3. `CharacterRuntime.updateMany({gameId, type:'runtime'}, {$set: {type:'snapshot', snapshotGameRuntimeId, ...}})` 原地轉換
4. 殘留視窗只剩「已快取 isActive=true 的 in-flight action」：其寫入若在轉換前落地→保存進快照（資料不丟）；轉換後→loud throw。**兩種結局都無 silent loss**

**已驗證的前提**（選型時已 grep 確認，實作時需以測試固定）：
- snapshot 無讀取端、`{refId, type}` 非 unique、`startGame` 用 `findOneAndUpdate upsert` 建 runtime（與既存 snapshot 不衝突）

### startGame 鏡像 race（D3 拍板：本包一併修）

**現行順序**（`lib/game/start-game.ts`）：讀 Game → 讀全部 Baseline Characters（複製來源讀取點）→ upsert GameRuntime → deleteMany 舊 runtime → insertMany CharacterRuntime → `Game.isActive = true`（最後一步）→ writeLog + emitGameStarted。

**Race**：在「Baseline 讀取」到「isActive=true」之間落地的 Baseline 寫入（GM 編輯、Preview 期玩家操作），不會進入 runtime 複本——遊戲全程看不到該變更（資料不毀損，仍留在 Baseline，賽後可見，但「跳過了這場遊戲」）。

**修法（與 D2 同哲學的鏡像重排：flag-first）**：
1. `Game.isActive = true` **提前到複製之前**（權限/狀態檢查之後）
2. Baseline 讀取與複製在 flag 之後執行 → flag 後新進的寫入 action 解析 isActive=true、路由 Runtime：
   - 複製完成前寫入 → `findOneAndUpdate` null → **loud throw**「找不到 Runtime Character」（既有路徑，零新增錯誤處理）
   - 複製完成後寫入 → 正常進 Runtime
3. 複製失敗的回滾路徑**必須補 `isActive` 重設為 false**（現行回滾只刪已建文件）
4. 讀取路徑（`getCharacterData`）在複製完成前 runtime miss → 既有降級邏輯回 Baseline + console.warn，可接受的短暫降級（複製耗時約百 ms 級）

**殘留視窗（誠實揭露）**：已快取 `isActive=false` 的 in-flight action，其 Baseline 寫入若在複製讀取之後落地 → 仍然 silent invisible（非 loss——資料留在 Baseline）。徹底閉合需在 Character collection 加條件欄位 + migration，與症狀嚴重度（低頻、資料不毀損、賽後可見）不成比例 → **接受此殘留**，知識庫記載此語意。與 endGame 修法的差異：endGame 的殘留視窗結局是「進快照或 loud throw」（無 silent），startGame 殘留是「silent invisible but recoverable」。

### 測試策略（startGame）

- **新建** `lib/game/__tests__/start-game.test.ts`（目前不存在）：
  - 回歸：`isActive=true` 寫入先於 Baseline Characters 讀取/複製（mock 呼叫順序斷言）
  - 回歸：複製失敗的回滾把 `isActive` 重設為 false
  - 既有行為：權限檢查、已 active 的覆蓋警告、GameRuntime upsert、presetEvents 初始化

### 測試策略（問題 2）

- **新建** `lib/game/__tests__/end-game.test.ts`（目前不存在）：
  - 回歸：endGame 後 runtime 文件「轉型」為 snapshot（同 `_id`、type 改變、snapshotName/關聯欄位齊備），而非「複製＋刪除」
  - 回歸：isActive=false 先於轉換（mock 呼叫順序斷言）
  - 既有行為：權限檢查、Runtime 不存在的降級路徑、writeLog、emitGameEnded
- **race 模擬測試**（mock 層交錯）：endGame 轉換完成後，`updateCharacterData` 對同角色的寫入 → 斷言 throw「找不到 Runtime Character」而非靜默成功
- 既有 `update-character-data.test.ts` / `get-character-data.test.ts` / `game-request-cache.test.ts` 全數維持綠燈（核心資料層零修改的證明）

### 壓測佐證評估

方案 3 **不動玩家熱路徑**（update/get/resolve/快取零修改），endGame 本身是低頻 GM 操作且寫入量減半 → **建議不需壓測**，以 unit 層時序/交錯測試 + 既有 E2E（遊戲結束 flow）佐證即可。若拍板選方案 1/2/4（動到熱路徑或交易），則需重新評估壓測。

### E2E 影響評估（問題 2）

`e2e/` 中涉及「結束遊戲」的 spec 需確認：結束後 GM 介面對快照的呈現（目前無快照 UI → 預期無影響）、結束後玩家端收 `game.ended` 行為不變。snapshot 資料形狀改變（沿用 runtime `_id`）無 UI 消費端。

---

## 需要拍板的決策點（2026-06-13 已全數拍板）

| # | 決策 | 選項 | 推薦 | **拍板結果** |
|---|------|------|------|------|
| D1 | 問題 1 修法路線 | A await 順序 / B 併入同 bucket / C client 端 | B | ✅ **B** |
| D2 | 問題 2 修法方案 | 1 lifecycle 條件寫入 / 2 版本欄位 / 3 convert-in-place / 4 transaction | 3 | ✅ **3** |
| D3 | startGame 鏡像 race | 本包一併修 / 記 BACKLOG 後續處理 | 記 BACKLOG | ✅ **本包一併修**（設計見專節） |
| D4 | 壓測佐證 | 需要 / 不需要（D2=3 時熱路徑零修改） | 不需要 | ✅ **不需要**（D2=3 且 D3 修法亦只動 start-game.ts 順序，玩家熱路徑零修改） |
| D5 | BACKLOG「攻擊方 pending 重驗」驗證項 | 改寫為「下次真實團務觀察」併入既有觀察項 / 維持原樣 | 併入觀察項 | ✅ **併入觀察項**（結案時改寫 BACKLOG） |

## 實作順序（Phase 2）— 全數完成

1. ✅ 問題 1（emit 順序，路線 B）：`fix: merge contest temp effects into atomic bucket update`，新測試 9 條
2. ✅ 問題 2（endGame convert-in-place）：`fix: convert runtime docs to snapshot in place on game end`，新測試 8 條
3. ✅ startGame flag-first：`fix: set game active flag before runtime copy on game start`，新測試 6 條（回滾不重設 flag 為 RED 階段抓到的真實缺口）
4. ✅ 知識庫同步：`contest-flow.md`（bucket 原子寫入決策）、`game-states.md`（lifecycle 順序不變量）、`data-models.md`（snapshot 語意）
5. ✅ 結案與封存（本文件封存時完成）

驗收紀錄：三項皆由使用者手動驗收通過（2026-06-13）。E2E 影響評估：`gm-game-lifecycle.spec.ts` 斷言「結束後無 type:'runtime' 殘留」與 convert-in-place 相容，無需更新；USER_GUIDE 的快照描述與新語意一致，無需更新。

## 殘留事項（結案時已搬 BACKLOG）

- startGame in-flight 殘留視窗（已快取 isActive=false 的 Baseline 寫入落在複製讀取後 → 留在 Baseline、該場不可見）→ 已記入 BACKLOG「未排程構想」，語意同步記載於 `docs/knowledge/gm/game/game-states.md`
- 驗收過程的兩個獨立發現（client 端重複抓取全面盤點、stale 開始按鈕邊緣情境）→ 開發期間已即時記入 BACKLOG
