# 前端效能優化規劃

> 目標：提升 Lighthouse 分數（Performance 為主，兼顧 Best Practices / Accessibility / SEO）
> 主要優化對象：**玩家端**（`/g/[gameId]` 與 `/c/[characterId]`），因為這是手機優先、觀眾規模最大的入口
> 次要：GM 端關鍵頁面（登入、dashboard、games 列表）

## 驗收標準

以 Lighthouse（Chrome DevTools 或 `lighthouse-ci`）為準：

| 指標 | 玩家端目標 | GM 端目標 |
|---|---|---|
| Performance | ≥ 90（mobile） | ≥ 85（desktop） |
| LCP | < 2.5s（mobile 4G） | < 2.0s（desktop） |
| TBT | < 200ms | < 300ms |
| CLS | < 0.1 | < 0.1 |
| Bundle First Load JS（玩家主入口） | < 200 KB gzip | < 300 KB gzip |

具體分數基準線會在**階段 0** 量測後寫回本文件。

### 範圍分層（Q5 決議）

本計畫採「**玩家端完整優化 + GM 端共用層/依賴切分**」的分層策略，不對 GM 端做深度 component 拆分：

| 類別 | 玩家端 | GM 端 |
|---|---|---|
| 共用層（font、analyzer、optimizePackageImports） | ✅ 做 | ✅ 做（一次作業，兩邊受益） |
| Heavy deps dynamic import | ✅ 做 | ✅ 做（qrcode、mammoth） |
| 主入口 component 拆分 | ✅ 做（`world-info-view`、`character-card-view`、`item-list`） | ❌ 不做（`ability-edit-wizard` 1215 行，風險/收益比不佳） |
| Client/Server 邊界清理 | ✅ 做 | ❌ 不做 |

**GM 端不做深度拆分的理由**：
- GM 用桌面，Lighthouse desktop 分數本就優於 mobile，邊際效益遞減
- GM 只有「GM 自己」這一類使用者，使用者數量小
- `ability-edit-wizard` 是編輯系統核心（能力/道具/技能），涉及 multi-step wizard + save-bar + undo 邏輯，深度拆分風險高
- 省下的工作量（估 5-7 人日）回投到玩家端拆分與回歸測試更划算

---

## 現況盤點

### 已做得好的部分
- `next/image` 普遍使用（10 個檔案），**無**裸 `<img>` 標籤
- Root layout 乾淨（`app/layout.tsx` 僅 21 行）
- 玩家主入口 `app/(player)/g/[gameId]/page.tsx` 是 server component（18 行），將重量委派給 `WorldInfoView`
- Vercel Blob 處理圖片（CDN 已分攤）
- Next 16.1.6 + React 19（最新版本，可享 Turbopack 與新 runtime 優化）

### 已識別的風險點

#### 1. 缺字型策略（高影響、低成本）
- `app/layout.tsx` 未使用 `next/font`
- 中文字型若由瀏覽器預設代理，會導致 **FOUT / CLS**，Lighthouse 的 CLS 與 "Ensure text remains visible during webfont load" 都會扣分
- 根元素只有 `className="antialiased"`，沒有 font-family 宣告

#### 2. 重型依賴未切分（高影響、中成本）
所有 deps 都靜態進入 bundle（**全專案 0 處 `next/dynamic`**）：

| 套件 | 實際使用範圍 | 風險 |
|---|---|---|
| `mammoth`（DOCX 解析） | `lib/ai/parsers/docx.ts`（僅 AI 匯入時觸發） | Parse DOCX 的巨型庫，不該進主 bundle |
| `openai`（AI SDK） | `lib/ai/provider.ts`（僅伺服器端） | 若誤入 client bundle 會非常肥 |
| `framer-motion` | **僅 1 個檔案**：`components/gm/sticky-save-bar.tsx` | 整個動畫庫只為一條儲存提示條 |
| `qrcode` | 4 個 GM 端檔案（產 QR 按鈕） | 玩家端用不到，應限縮在 GM 路由 |
| `react-easy-crop` | 推測在頭像上傳流程 | 僅編輯場景需要 |

#### 3. 無 bundle 觀測工具（阻斷性風險）
- `next.config.ts` 沒有 `@next/bundle-analyzer`
- `next.config.ts` 沒有 `experimental.optimizePackageImports`
- `package.json` 無 `analyze` 腳本
- 結論：**目前無法量化優化成果**，這必須第一個補上

#### 4. Icon 散裝導入未驗證（中影響、低成本）
- `lucide-react` 有 86 處 import
- Next 16 + Turbopack 在預設下應該會做 tree-shaking，但沒有 `optimizePackageImports: ['lucide-react']` 或 `modularizeImports` 顯式宣告保險，需以 analyzer 確認
- `@radix-ui` 同時安裝了 `radix-ui`（meta-package）與 11 個 `@radix-ui/react-*` 子包，可能產生重複模組

#### 5. 超大 Client Component（中影響、高成本）
Top 5（行數）都是 client component，每個都會變成 hydration cost：

| 檔案 | 行數 | 路由 |
|---|---|---|
| `components/gm/ability-edit-wizard.tsx` | 1215 | GM 編輯 |
| `components/player/item-list.tsx` | 742 | **玩家主入口** |
| `components/gm/secrets-tab.tsx` | 640 | GM 編輯 |
| `components/gm/tasks-edit-form.tsx` | 638 | GM 編輯 |
| `components/player/character-card-view.tsx` | 602 | **玩家主入口** |

玩家主入口的兩個大檔（`item-list` + `character-card-view` ≈ 1344 行）直接影響 LCP 與 TBT。

#### 6. 88 個 `'use client'`，server/client 邊界可能過於寬鬆
- `components/player/` 46 個 client components
- `components/gm/` 38 個 client components
- 其中有些（如 `character-mode-banner`、`public-info-section`、`info-story-tab`）從命名判斷**可能可以降級為 server component**，但需逐個確認是否真的有互動狀態

#### 7. CSS / 其他小項
- `globals.css` 258 行，需確認是否有未使用的 selector
- `next-themes` 雖輕量但 hydration 期會 flash（CLS 風險）
- 無 `metadata` viewport / robots 細節（SEO 扣分）

---

## 優化階段

### 階段 0：建立量測基準（必做、阻斷後續）

1. 加入 `@next/bundle-analyzer`，新增 `pnpm analyze` 腳本
2. 本地跑 `next build` + Lighthouse（mobile profile）對以下路由取分數與 First Load JS：
   - `/`（首頁）
   - `/g/[gameId]`（玩家主入口，用 seed data）
   - `/c/[characterId]`（角色卡，玩家第二入口）
   - `/(gm)/dashboard`、`/(gm)/games`、`/(gm)/games/[id]`
3. 把基準數字**填回本文件**當作對照組
4. 截圖 bundle analyzer 的玩家與 GM chunk 分布

**出口**：每個後續項目都必須回報「優化前 → 優化後」差值。

### 階段 1：低成本高回報（Quick Wins）

1. **導入 `next/font` — 使用 Geist（設計規格指定）**
   - `.impeccable.md:43` 已指定「繼續使用 Geist」，但 `app/layout.tsx` 目前**未載入任何字型**，實作與規格脫節
   - 使用 `next/font/google` 載入 `Geist`（英文主字）與 `Geist_Mono`（等寬），中文回退依 CSS font stack（system-ui）
   - 在 `app/layout.tsx` 設定 `<html className={geist.variable}>`，在 `globals.css` 或 Tailwind config 設 `--font-sans: var(--font-geist-sans)`
   - 消除 FOUT 與部分 CLS，同時把「規格」落實到「實作」

2. **啟用 `optimizePackageImports`**
   ```ts
   experimental: {
     optimizePackageImports: ['lucide-react', 'date-fns', 'radix-ui'],
   }
   ```

3. **收束 radix-ui 安裝**
   - 確認是用 meta `radix-ui` 還是散裝 `@radix-ui/react-*`，擇一
   - 避免重複模組

4. **補 metadata**
   - `viewport`、`themeColor`、`openGraph` 等

### 階段 2：動態切分重型依賴（核心）

1. **`framer-motion` → dynamic（保留動畫，延遲載入）**
   - `.impeccable.md:77` 與 CLAUDE.md 都明訂 Framer Motion 是優先動畫工具，**不替換為 CSS**
   - 做法：`sticky-save-bar.tsx` 整個元件用 `dynamic(() => import('./sticky-save-bar'), { ssr: false })` 包裝
   - 初始 bundle 不載入 framer-motion，只有當編輯表單有未儲存變更時才載入 save bar
   - **驗收重點**：
     - save-bar 首次出現時仍需有 fade/slide 進場動畫（不可變瞬出）
     - 未儲存狀態 → 出現動畫時間 200–350ms（符合規格）
     - Edit 表單初次載入時，Network 應觀察到 framer-motion chunk **不在主 bundle**，只有觸發變更後才 fetch

2. **`mammoth` → 僅在 AI 匯入對話框開啟時 dynamic import**
   - 影響 `lib/ai/parsers/docx.ts` 的匯入點

3. **`qrcode` → 僅 GM 點擊產 QR 時 dynamic import**
   - `components/gm/generate-qrcode-button.tsx`、`components/gm/game-header-actions.tsx` 等 4 處

4. **`react-easy-crop` → 編輯頭像 dialog 開啟時 dynamic import**
   - 影響 `components/gm/avatar-upload.tsx`（若是）

### 階段 3：玩家主入口專項（Lighthouse 重點）

1. **`components/player/world-info-view.tsx` 拆分**
   - 檢查哪些子區塊可以留在 server（純展示、無互動）
   - 互動區塊（unlock、tab 切換、dialog）用 client island 包住

2. **`character-card-view.tsx` 與 `item-list.tsx` code-split**
   - 背景故事、關係、秘密 tab 在切到該 tab 時再 dynamic import
   - item 詳情 dialog、技能詳情 dialog 改 dynamic

3. **圖片策略**
   - 確認 `<Image>` 是否都有 `sizes` / `priority` / `placeholder="blur"`
   - Hero 圖（角色頭像）加 `priority` 影響 LCP

### 階段 4：Client / Server 邊界清理（低優先、高價值）

- 逐個檢視 88 個 client components，將不需要 client 的降級
- 特別目標：玩家端純展示元件（`info-story-tab`、`info-relationships-tab`、`background-block-renderer`）

### 階段 5：回歸驗證

- 重跑 Lighthouse，對照階段 0 基準
- 寫回本文件「達成分數」
- 同步 `docs/knowledge/architecture/` 若有架構性調整
- E2E 跑一輪確認沒壞掉

---

## 不做 / 非目標

- **不更換 UI 框架**（保留 Tailwind 4 + shadcn/ui）
- **不替換 framer-motion** 為其他動畫庫（除非階段 2 決定直接 CSS 化）
- **不重寫 88 個 client components**（只動玩家主入口相關的）
- **不改 MongoDB / API 層效能**（本計畫純前端）
- **不動 WebSocket / Pusher**（本計畫不涉及即時通訊效能）
- **不做 SSG / ISR**（玩家資料是動態的，不適合）

---

## 影響範圍

- `next.config.ts`（設定檔）
- `app/layout.tsx`（字型 + metadata）
- `package.json`（加 analyzer、可能移除重複 radix）
- `components/player/world-info-view.tsx` 與其子樹（玩家主入口拆分）
- `components/player/character-card-view.tsx`、`item-list.tsx`（dialog dynamic）
- `components/gm/sticky-save-bar.tsx`（framer-motion 處理）
- `components/gm/generate-qrcode-button.tsx` 等 4 處（qrcode dynamic）
- `lib/ai/parsers/docx.ts` 的呼叫點（mammoth dynamic）
- 所有需要調整的 `"use client"` 邊界

---

## 風險與注意事項

1. **Dynamic import 的 SSR 策略要選對**：需要 SEO 的內容（玩家角色卡）不能 `ssr: false`，否則 FCP/LCP 反而變差
2. **字型切換可能影響既有視覺**：Design Context 強調「優雅・精緻」，選字型時需與 `.impeccable.md` 對齊
3. **`optimizePackageImports` 是實驗性**：Next 16 穩定度需驗證
4. **E2E 影響**：dynamic import 可能讓 Playwright 首次 navigate 看到 loading skeleton，需更新 wait 策略
5. **客戶端路由 prefetch**：Next.js 預設會 prefetch `<Link>` 目標，改 dynamic 後要留意是否仍在 viewport 就觸發下載

---

## 使用者確認結論（2026-04-19）

| 問題 | 結論 |
|---|---|
| Q1 Lighthouse 目標 | ✅ 90 mobile / 85 desktop 合理 |
| Q2 字型 | ✅ 使用 **Geist**（`.impeccable.md:43` 已指定，目前實作未載入，本計畫補上） |
| Q3 先量測基準 | ✅ 接受階段 0 僅量測不改 code |
| Q4 framer-motion | ✅ **不替換為 CSS**（違反 `.impeccable.md:77`），改為 dynamic import 保留動畫；驗收需檢查 save-bar 動畫未消失 |
| Q5 GM 範圍 | ✅ 分層處理：共用層 + 依賴切分做；深度 component 拆分不做（成本 5-7 人日，邊際效益低，風險高） |

---

## 進度追蹤

- [ ] 階段 0：基準量測
- [ ] 階段 1：Quick Wins（字型、optimizePackageImports、metadata）
- [ ] 階段 2：Heavy deps dynamic import
- [ ] 階段 3：玩家主入口拆分
- [ ] 階段 4：Client/Server 邊界清理
- [ ] 階段 5：回歸驗證與文件同步
