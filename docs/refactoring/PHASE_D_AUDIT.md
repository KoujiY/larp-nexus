# LARP Nexus UI/UX 全面審計報告

**審計日期**：2026-03-24
**範圍**：GM 端（6 頁面 + 34 組件）+ 玩家端（1 頁面 + 27 組件）
**代碼量**：約 12,000+ 行
**設計參考**：`.impeccable.md`（品牌個性：優雅・精緻・有質感；風格：神秘奇幻）

---

## Anti-Patterns 判定

**判決：❌ 高度 AI Slop 特徵**

| 特徵 | 出現位置 | 嚴重程度 |
|------|---------|---------|
| 全站 emoji 作為 icon（📝📊✅🎒⚡🔒👁️🌍） | navigation、tabs、所有按鈕 | 🔴 致命 |
| 紫藍漸層背景（`from-purple-50 to-blue-50`、`from-gray-900 via-purple-900 to-violet-900`） | 角色卡、世界觀頁、角色圖片預設背景 | 🔴 AI 色票 |
| 未改動的 shadcn/ui 預設：純中性灰階，零視覺識別 | 全站 | 🔴 毫無品牌感 |
| 相同尺寸卡片網格重複堆疊 | 劇本列表、角色列表、道具列表 | 🔴 模板感 |
| 語義裝飾色 hard-code（`bg-green-600`、`bg-blue-50`、`text-red-900`） | 10+ 組件 | 🔴 無設計系統 |
| 所有卡片相同圓角 + 陰影 | 全站 | ⚠️ 無層次感 |

---

## Executive Summary

| 嚴重程度 | 數量 |
|---------|------|
| 🔴 Critical | 7 |
| 🟠 High | 5 |
| 🟡 Medium | 9 |
| ⚪ Low | 6 |
| **合計** | **27** |

**最關鍵的 5 個問題：**
1. **零視覺識別** — 整個系統沒有任何品牌色、品牌字體、設計語言，是純粹的 shadcn/ui 預設值
2. **對抗 Dialog 強制鎖定** — 玩家被困在無法關閉的 modal 中，嚴重破壞沉浸感與 UX
3. **GM 端行動版導航完全失效** — `lg:` 以下側邊欄隱藏但無漢堡選單替代
4. **Emoji 作為唯一 icon 系統** — 無障礙缺失，跨平台渲染不一致，風格廉價
5. **玩家端 5 個 Tab 在手機上觸控目標過小** — `grid-cols-5` 造成每個 tab 約 60px 寬

**整體品質分數：3 / 10**（功能完整但設計缺失）

---

## 工作流程分析

### GM 工作流程

```
登入（Magic Link）
  → 主畫面（功能 hub）
  → 劇本管理（建立/選擇劇本）
  → 管理劇本
    ├─ [Baseline 模式] 劇本資訊編輯 ←→ 角色列表
    │   └─ 角色編輯（5 個面向）
    │       ├─ 基本資訊 / 公開 / 隱藏
    │       ├─ 角色數值
    │       ├─ 任務管理
    │       ├─ 道具管理（新增/編輯含複雜 dialog）
    │       └─ 技能管理
    └─ [Runtime 模式] 遊戲進行中
        ├─ 即時廣播
        └─ ⚠️ 無玩家即時狀態監控（功能缺口）
```

**工作流程問題：**
- Baseline/Runtime 切換是最重要的狀態，但視覺區隔幾乎不存在（只有一個小 badge）
- GM 在 Runtime 模式下無法監控玩家即時狀態
- 角色編輯 5 個 tab 在桌面版資訊密度高，切換不直覺

### 玩家工作流程

```
進入公開頁面（世界觀/故事）
  → 掃描 QR Code 進入角色卡
  → PIN 解鎖畫面
    ├─ 僅 PIN → 預設模式（唯讀）
    └─ PIN + 遊戲代碼 + GM 已開始 → 完整模式

完整模式：
  角色卡（5 個 Tab）
  ├─ 資訊（基本 + 公開 + 隱藏）
  ├─ 數值（進度條 + 效果倒計時）
  ├─ 任務（一般 + 隱藏目標）
  ├─ 道具 → 使用 → [對抗流程] → 偷竊道具選擇
  └─ 技能 → 使用 → [對抗流程]

通知面板（右上角通知鈴）
```

**工作流程問題：**
- 玩家最常用的是道具/技能，但 Tab 順序讓他們排在第 4、5 位
- 對抗流程 Dialog 強制鎖定，玩家感到被困（無放棄/快速回應選項）
- 通知面板藏在右上角，重要通知（揭露、道具被偷）易遺漏
- 公開頁面是第一印象，但視覺設計簡陋

---

## Detailed Findings

### 🔴 Critical Issues

#### C-01：整個系統無品牌視覺識別
- **位置**：`app/globals.css`、全站
- **描述**：CSS 色彩 token 全部是 oklch 純灰階，無任何品牌色定義
- **影響**：玩家開啟角色卡時毫無沉浸感，GM 工具感覺是 Excel 替代品
- **建議**：定義完整的 oklch 色彩 token（品牌色、語義色），建立設計系統基礎
- **命令**：`impeccable:colorize`

#### C-02：對抗 Dialog 強制鎖定，無退出路徑
- **位置**：`components/player/contest-response-dialog.tsx`、`target-item-selection-dialog.tsx`、`game-ended-dialog.tsx`
- **描述**：三個 dialog 均使用 `onOpenChange={() => {}}` 完全禁止關閉，無 ESC、無外部點擊、無「放棄」選項
- **影響**：玩家被困在 modal 中，手機螢幕小時無法操作，完全失去控制感
- **建議**：對抗 dialog 應提供「使用基礎數值直接回應」快捷選項；game-ended dialog 應 3 秒後允許關閉
- **命令**：`impeccable:harden`

#### C-03：GM 端行動版導航完全失效
- **位置**：`app/(gm)/layout.tsx`、`components/gm/navigation.tsx`
- **描述**：側邊欄在 `lg:` 以下完全隱藏（`hidden lg:flex`），無漢堡選單替代方案
- **影響**：GM 在平板或手機上完全無法導航
- **建議**：加入行動版底部導航 bar 或漢堡選單
- **命令**：`impeccable:adapt`

#### C-04：全站 emoji icon 系統（無障礙缺失）
- **位置**：`navigation.tsx`（📊📚⚙️🚪）、`character-edit-tabs.tsx`（📝📊✅🎒⚡）、`character-card-view.tsx`（所有 tab）、`pin-unlock.tsx`（🔒🔓👁️）等，15+ 個組件
- **描述**：emoji 在不同操作系統/裝置上渲染差異極大，對螢幕閱讀器無意義
- **影響**：視覺風格廉價；WCAG 2.1 違規
- **建議**：全面改用 Lucide React icon（已安裝），emoji 僅用於純文字內容
- **命令**：`impeccable:normalize`

#### C-05：Hard-coded 顏色不受主題控制
- **位置**：`game-lifecycle-controls.tsx`（`bg-green-600`）、`character-edit-form.tsx`（`bg-blue-50`）、`stats-display.tsx`（`bg-red-500`、`bg-yellow-500`）、`skill-card.tsx`（`from-yellow-400 to-orange-500`）等，15+ 組件
- **描述**：大量使用 Tailwind 原始色階而非語義色 token
- **影響**：深色模式下 `bg-blue-50` 等淺色幾乎不可見；主題切換功能形同虛設
- **建議**：統一改用語義 token（`--color-success`、`--color-warning` 等）
- **命令**：`impeccable:normalize`

#### C-06：玩家端 Tab 在手機上觸控目標過小
- **位置**：`components/player/character-card-view.tsx`
- **描述**：`grid-cols-5` 的 TabsList 在 375px 手機上每個 tab 約 67px 寬 × 36px 高，未達 WCAG 44×44px
- **影響**：遊戲高壓下切換 tab 容易誤觸
- **建議**：重新設計玩家端導航結構
- **命令**：`impeccable:adapt`

#### C-07：Baseline/Runtime 環境切換無明確視覺區隔
- **位置**：`app/(gm)/games/[gameId]/page.tsx`、`app/(gm)/games/[gameId]/characters/[characterId]/page.tsx`
- **描述**：GM 工作流程中最關鍵的狀態，僅有一個小 badge 和 hard-coded 淺綠 alert 指示
- **影響**：GM 可能在不知情的情況下在錯誤的環境中操作
- **建議**：用全局環境指示器（頂部橫幅或主題色切換）明確區分兩種環境
- **命令**：`impeccable:harden`、`impeccable:colorize`

---

### 🟠 High Severity Issues

#### H-01：玩家端道具/技能不在最高頻位置
- **位置**：`character-card-view.tsx` tab 順序（資訊/數值/任務/道具/技能）
- **影響**：遊戲中每次使用道具需點擊第 4 個 tab，增加操作步驟

#### H-02：通知面板為次要入口，重要通知易遺漏
- **位置**：`notification-button.tsx`（右上角小鈴鐺）
- **影響**：隱藏資訊揭露、任務揭露、道具被偷等關鍵事件可能被玩家忽略

#### H-03：冷卻時間顯示格式不友善
- **位置**：`item-card.tsx`、`skill-card.tsx`
- **描述**：冷卻倒數顯示原始秒數（如 `3661s`），應格式化為 `1h 1m 1s`

#### H-04：GM 端道具編輯 Dialog 最大寬度 1400px
- **位置**：`items-edit-form.tsx`（`lg:max-w-[1400px]`）
- **影響**：行動版和小螢幕桌面完全無法正常操作

#### H-05：item-list.tsx（960 行）、skill-list.tsx（763 行）超過規範上限
- **位置**：`components/player/item-list.tsx`、`components/player/skill-list.tsx`
- **影響**：可讀性低，UI 重設計時修改風險高
- **命令**：`impeccable:extract`

---

### 🟡 Medium Issues

| # | 問題 | 位置 | 建議命令 |
|---|------|------|---------|
| M-01 | 公開頁面是玩家第一印象，但視覺設計簡陋 | `app/(player)/g/[gameId]/page.tsx` | `impeccable:frontend-design` |
| M-02 | PIN 解鎖畫面缺乏新手引導 | `pin-unlock.tsx` | `impeccable:onboard` |
| M-03 | 角色卡缺乏角色身份感 | `character-card-view.tsx` 頂部區域 | `impeccable:delight` |
| M-04 | StatsDisplay 進度條顏色 hard-coded | `stats-display.tsx` | `impeccable:normalize` |
| M-05 | 全站「使用說明」用 `bg-blue-50` hard-coded | 10+ 組件 | `impeccable:normalize` |
| M-06 | GM 個人設定頁面幾乎無功能卻佔導航入口 | `app/(gm)/profile/page.tsx` | `impeccable:distill` |
| M-07 | 空狀態使用「虛線邊框 + 大 emoji」 | 劇本列表、道具列表等 | `impeccable:harden` |
| M-08 | 角色列表卡片圖片高度固定 `h-48` | `components/gm/character-card.tsx` | `impeccable:adapt` |
| M-09 | 部分 textarea 設定 `resize-none` | `items-edit-form.tsx` 等 | `impeccable:harden` |

---

## Patterns & Systemic Issues

1. **Emoji 圖示系統** — 出現於 15+ 組件，是最普遍的問題，需全站統一替換
2. **Hard-coded 顏色** — 15+ 組件使用原始 Tailwind 色階而非 token，深色模式幾乎全部失效
3. **Dialog 無法關閉** — 3 個組件完全鎖定，強制 modal 反模式的集中體現
4. **行動版觸控目標不足** — GM 側邊欄消失、玩家端 Tab 過小，RWD 設計缺位
5. **零品牌一致性** — 每個組件像是獨立製作，沒有設計系統約束

---

## Positive Findings

1. ✅ **功能完整性高** — 對抗、道具、技能、任務的核心邏輯完整
2. ✅ **WebSocket 即時更新架構** — Pusher 事件架構合理，組件層面監聽拆分清楚
3. ✅ **隱匿標籤邏輯正確** — `sourceHasStealthTag` 正確控制攻擊方名稱顯示
4. ✅ **部分無障礙實踐** — `sr-only` label、`htmlFor` 連接在部分組件中正確使用
5. ✅ **Framer Motion 已安裝** — 動畫系統備齊，等待正確使用

---

## Recommendations by Priority

### Immediate（設計系統基礎，其他一切以此為準）
1. 定義品牌色彩 token（`globals.css`）→ `impeccable:colorize`
2. 全站 emoji → Lucide icon + hard-coded 顏色 → token → `impeccable:normalize`

### Short-term（工作流程 UX）
3. 修復對抗 Dialog 強制鎖定 UX → `impeccable:harden`
4. 修復 GM 端行動版導航 → `impeccable:adapt`
5. 建立 Baseline/Runtime 視覺區隔 → `impeccable:colorize`
6. 重設計玩家端角色卡導航結構 → `impeccable:arrange`

### Medium-term（體驗提升）
7. 重設計 PIN 解鎖畫面（含新手引導）→ `impeccable:onboard`
8. 重設計公開頁面（玩家第一印象）→ `impeccable:frontend-design`
9. 拆分 item-list.tsx / skill-list.tsx → `impeccable:extract`

### Long-term（精緻化）
10. 全站動畫系統（Framer Motion）→ `impeccable:animate`
11. 角色卡的角色身份感設計 → `impeccable:delight`
12. 通知系統視覺升級 → `impeccable:bolder`

---

## Suggested Commands Map

| 優先 | 命令 | 解決問題 |
|------|------|---------|
| 1 | `impeccable:colorize` | C-01、C-05 部分、C-07 |
| 2 | `impeccable:normalize` | C-04、C-05、M-04、M-05（共 25+ 問題）|
| 3 | `impeccable:harden` | C-02、C-07、M-07、M-09 |
| 4 | `impeccable:adapt` | C-03、C-06、H-04、M-08 |
| 5 | `impeccable:arrange` | H-01、H-02、M-03 |
| 6 | `impeccable:onboard` | M-02 |
| 7 | `impeccable:animate` | 全站動畫（Framer Motion 尚未使用）|
| 8 | `impeccable:extract` | H-05 大檔案拆分 |
