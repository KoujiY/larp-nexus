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

### 階段 0：建立量測基準（已完成）

#### 已完成事項

1. ✅ 安裝 `@next/bundle-analyzer` devDependency
2. ✅ `next.config.ts` 接入 analyzer（`ANALYZE=1` 時啟用）
3. ✅ `package.json` 新增 `pnpm analyze` 腳本（含 `--webpack` 旗標，因 analyzer 依賴 webpack plugin）
4. ✅ 跑過 webpack production build，產出 `.next/analyze/{client,edge,nodejs}.html` 三份分析報告
5. ⏸ Lighthouse 實測分數：**本環境無 Chrome，需由使用者本機或 CI 執行**（指引見下方「Lighthouse 量測指引」）

#### Bundle Baseline（Next 16.1.6 webpack build，2026-04-19）

> Next 16 的 `next build` CLI 輸出**不再顯示** Size / First Load JS 欄位，下列數字由 `.next/static/chunks/` 檔案大小計算所得。

**共用 Chunks（多路由共享的 baseline 上限）**：

| 指標 | Raw | Gzip |
|---|---|---|
| 總量（27 個 top-level chunks） | 1,569,720 B（1.57 MB） | 490,597 B（490 KB） |

Top 10 共用 chunks（raw / gzip）：

| 檔名 | Raw | Gzip |
|---|---|---|
| `436e3d8c-*.js` | 198,492 | 62,485 |
| `framework-*.js` | 189,703 | 59,725 |
| `184-*.js` | 188,651 | 51,025 |
| `main-*.js` | 134,266 | 39,109 |
| `4446-*.js` | 121,815 | 40,530 |
| `polyfills-*.js` | 112,594 | 39,473 |
| `2056-*.js` | 111,361 | 31,629 |
| `4259-*.js` | 71,954 | 25,465 |
| `3767-*.js` | 66,120 | 19,401 |
| `7889-*.js` | 63,205 | 18,758 |

**路由專屬 Chunks（排除共用 baseline）**：

| 路由 | Raw | Gzip | 備註 |
|---|---|---|---|
| `/games` (GM 劇本列表) | 250,489 | 64,950 | **GM 端最大** |
| `/profile` (GM) | 11,962 | 4,335 | |
| `/auth/login` | 8,306 | 3,487 | |
| `/auth/verify` | 8,105 | 2,922 | |
| `/` (home) | 3,319 | 1,200 | |
| `/dashboard` (GM) | 236 | 188 | |
| `/games/[gameId]` (GM 管理劇本) | 0 (inline) | 0 | 依賴共用，見下 |
| `/games/[gameId]/characters/[id]` (GM) | 0 (inline) | 0 | 依賴共用 |
| `/g/[gameId]` (玩家世界觀) | 0 (inline) | 0 | 依賴共用 |
| `/c/[characterId]` (玩家角色卡) | 0 (inline) | 0 | 依賴共用 |

> 備註：部分動態路由的專屬 chunks 被 Next.js 自動合併進共用 chunks（`(gm)/games/[gameId]` 目錄本身含 231 KB 但以共用形式載入）。要看真實 Route 級 First Load JS 請**開啟 `.next/analyze/client.html`**，tree-map 會顯示每個 chunk 實際內容。

**Analyzer HTML 報告位置**：
- `.next/analyze/client.html`（**重點**：客戶端 bundle）
- `.next/analyze/edge.html`（edge runtime）
- `.next/analyze/nodejs.html`（伺服器端，含 mongoose/nodemailer 等）

#### Lighthouse 量測指引（請使用者本機執行）

本環境無 Chrome，請在你本機依下列步驟建立 Lighthouse baseline：

```bash
# 1. 安裝 lighthouse（若尚未裝）
pnpm add -g lighthouse

# 2. 啟動 production server
pnpm build && pnpm start
# 或用已在 port 3000 的現有 dev server（但 dev 分數不準）

# 3. 對玩家端跑 mobile profile（需 seed 好的 gameId / characterId）
lighthouse http://localhost:3000/g/<gameId> \
  --preset=perf --emulated-form-factor=mobile \
  --output=json --output=html --output-path=./lighthouse-player-world-baseline

lighthouse http://localhost:3000/c/<characterId> \
  --preset=perf --emulated-form-factor=mobile \
  --output=json --output=html --output-path=./lighthouse-player-card-baseline

# 4. 對 GM 端跑 desktop profile
lighthouse http://localhost:3000/dashboard \
  --preset=perf --emulated-form-factor=desktop \
  --output=json --output=html --output-path=./lighthouse-gm-dashboard-baseline

lighthouse http://localhost:3000/games \
  --preset=perf --emulated-form-factor=desktop \
  --output=json --output=html --output-path=./lighthouse-gm-games-baseline
```

跑完後把四個指標（Performance / LCP / TBT / CLS）填入下方 **Baseline 分數表**。

#### Baseline Lighthouse 分數表（待填）

| 路由 | Form Factor | Performance | LCP | TBT | CLS |
|---|---|---|---|---|---|
| `/g/[gameId]` (玩家世界觀) | mobile | — | — | — | — |
| `/c/[characterId]` (玩家角色卡) | mobile | — | — | — | — |
| `/dashboard` (GM) | desktop | — | — | — | — |
| `/games` (GM) | desktop | — | — | — | — |

**出口**：每個後續項目都必須回報「優化前 → 優化後」差值，以共用 chunk gzip 總量與路由 First Load JS 為主，Lighthouse 分數為輔。

#### 深化 Baseline 報告

詳細的 chunk-level 模組分析、heavy deps 分布、server-only 隔離驗證見 **`docs/refactoring/baseline-bundle-report.md`**。關鍵結論：

- **Server-only 套件（mammoth/openai/mongoose/nodemailer/bcrypt/sharp）全部不在 client bundle** ✅
- **階段 2 排序依實證修正**：framer-motion（-38KB）→ **pusher-js 延後（-18KB，新增）** → qrcode（-14KB）→ @dnd-kit 限縮 GM（-16KB，新增）→ react-easy-crop（-5.6KB）
- **原計畫的 `mammoth dynamic` 移除**：已是 server-only，不在 client bundle
- 階段 2 預估玩家 baseline 減 **75-90 KB gzip**（共用 chunks 體積約 15-20%）

#### CI 自動化（GitHub Actions）

本計畫同時導入兩個 workflow，每次 PR/push 自動執行：

| Workflow | 位置 | 功能 |
|---|---|---|
| Bundle Analysis | `.github/workflows/bundle-analysis.yml` | 跑 `pnpm analyze`，上傳 client/edge/nodejs.html 為 artifact，在 GITHUB_STEP_SUMMARY 印出 top 10 chunks |
| Lighthouse CI | `.github/workflows/lighthouse.yml` + `.github/lighthouserc.json` | 對靜態路由（`/`、`/auth/login`、`/auth/verify`）跑 Lighthouse 3 次取中位數，上傳到 temporary-public-storage |

**不阻擋 merge**：兩個 workflow 都只發警告，不 fail PR（assertions 用 `"warn"` 而非 `"error"`），避免 CI 分數變動擋住正常開發。

**侷限**：Lighthouse CI 目前只測靜態路由。動態路由（`/g/[gameId]`、`/c/[characterId]`、`/(gm)/games`）需完整 DB + seed data，等後續階段若有需要再擴充成 E2E-style harness。

### 階段 1：低成本高回報（Quick Wins）✅ 已完成

#### 已執行事項

1. ✅ **導入 `next/font` — Geist + Geist_Mono**
   - `app/layout.tsx` 以 `next/font/google` 載入，`display: 'swap'`，中文回退堆疊 PingFang TC / Noto Sans TC / Microsoft JhengHei
   - `globals.css` 的 `@theme inline` 新增 `--font-sans` / `--font-mono` 映射
   - `<body className="font-sans antialiased">` 套用

2. ✅ **啟用 `optimizePackageImports`**
   - `next.config.ts` 加入 `experimental.optimizePackageImports`
   - 涵蓋：`lucide-react`、`date-fns`、`radix-ui` 以及 11 個 `@radix-ui/react-*` 子套件

3. ✅ **補強 metadata + viewport**
   - `Metadata`：`title.template`、`applicationName`、`openGraph`、`robots`
   - `Viewport`：`themeColor`（淺/深模式分別對應暖米白與深午夜藍）、`width: device-width`

4. ⏸ **Radix 收束延後**：先看 `optimizePackageImports` 效果（見下方實測），實測證明已有 50% gzip 降幅，合併 3 個檔案的 meta→granular 邊際效益低，暫不執行以免無謂改動。

#### 階段 1 實測（Before → After，pnpm analyze）

| 項目 | Before | After | Δ | Δ % |
|---|---|---|---|---|
| `@radix-ui` gzip | 85,171 B | 42,363 B | **−42,808 B** | **−50.3%** |
| `lucide-react` gzip | 24,336 B | 23,770 B | −566 B | −2.3% |
| 共用 chunks 總 gzip | 490,597 B | 461,186 B | **−29,411 B** | **−6.0%** |
| 共用 chunks 總 raw | 1,569,720 B | 1,460,266 B | −109,454 B | −7.0% |
| 新增字型檔（woff2） | 0 | 115,288 B（6 檔） | +115,288 B | — |

**解讀**：
- `@radix-ui` 是最大贏家：50% gzip 降幅，實證 Next 16 barrel optimization 對 Radix 有效
- `lucide-react` 已近 tree-shake 極限，不必再優化
- 字型檔增量 115 KB 是**按需延遲載入**，不影響 initial bundle 的 parse/execute 成本；且 `display: swap` 確保不阻塞 LCP
- 共用 JS gzip 淨減 29 KB，全站所有頁面受益

### 階段 2：動態切分重型依賴（核心）

1. **`framer-motion` → 完全移除，改用 CSS transitions** ✅ 已完成
   - 決策變更（2026-04-19）：經再度評估，framer-motion 在全專案只在 `sticky-save-bar.tsx` 使用一處，且該處僅做簡單 fade + slide 進退場，未使用 layout animations / gestures / orchestration 等殺手功能。CSS transition + Tailwind utilities 可做到 ≥90% 視覺相似度。
   - 做法：`sticky-save-bar.tsx` 改為 always-mounted + `data-state="visible|hidden"` 切換，`transition-[transform,opacity] duration-300 ease-out`
   - 副作用（好的）：DOM 不再 detach，`e2e/helpers/click-save-bar.ts` 的 TOCTOU 保護簡化為 Playwright 原生 locator click
   - 同步更新的設計規格（移除 framer-motion 指定）：
     - `.impeccable.md:45, 77`
     - `.claude/CLAUDE.md:11, 222`
     - `docs/specs/DESIGN.md:200`
   - **驗收重點**：
     - save-bar 首次出現仍有 fade/slide 進場（CSS transition 300ms ease-out）
     - 退場 300ms，toast 在 400ms 後出現，時序與原先一致
     - E2E `click-save-bar.ts` 測試通過（不需 AnimatePresence 相關 TOCTOU）

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
- ~~不替換 framer-motion~~ → **已完全移除 framer-motion**（2026-04-19 決策修正，見階段 2-1）
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
| Q4 framer-motion | ✅ 最初決議「dynamic 保留」；2026-04-19 再次評估後改為「**完全移除並以 CSS 取代**」，同步更新 `.impeccable.md`、CLAUDE.md、DESIGN.md。原因：僅 1 檔使用、未用殺手功能、CSS 視覺相似 ≥90% 且可省 38 KB gzip 永久 |
| Q5 GM 範圍 | ✅ 分層處理：共用層 + 依賴切分做；深度 component 拆分不做（成本 5-7 人日，邊際效益低，風險高） |

---

## 進度追蹤

- [x] 階段 0：基準量測（commits `8c996db`, `e2a8d40`, `066ed37`, `d9ac77e`）
- [x] 階段 1：Quick Wins（字型、optimizePackageImports、metadata）— **shared chunks gzip −29 KB (−6.0%)**
- 階段 2：Heavy deps dynamic import ✅
  - [x] 2-1 framer-motion **完全移除**（CSS 取代）— shared chunks gzip **−37 KB vs phase 1 (−8.1%)**，累計 **−67 KB vs baseline (−13.6%)**
  - [x] 2-2 pusher-js lazy load — pusher-js **17.7 KB gz 從 eager 搬到 async chunk**（每條使用 WebSocket 的路由 First Load JS 少此量）
  - [x] 2-3 qrcode dynamic import — GM 路由 `/games/[gameId]` 與 `/games/[gameId]/characters/[id]` 各 **−9 KB gz**
  - [x] 2-4 @dnd-kit dynamic（`BackgroundBlockEditor` next/dynamic 在 2 個 consumer）— 連同 phase 2-5 累計 **GM 路由 −22 KB gz**
  - [x] 2-5 react-easy-crop dynamic（Cropper 在 `image-upload-dialog` 內 next/dynamic）— `/profile` **−5.8 KB gz**
- [ ] 階段 3：玩家主入口拆分
- [ ] 階段 4：Client/Server 邊界清理
- [ ] 階段 5：回歸驗證與文件同步

## 關鍵路由 Eager First Load JS（post phase 2 全部完成）

| 路由 | Phase 2-2 gz | Phase 2 完成 gz | Δ |
|---|---|---|---|
| `/c/[characterId]` (玩家角色卡) | 129,403 | 129,407 | +4 (noise) |
| `/(gm)/games/[gameId]/characters/[id]` (GM 編輯) | 168,340 | 136,993 | **−31,347 (−18.6%)** |
| `/(gm)/games/[gameId]` (GM 管理劇本) | 152,194 | 120,849 | **−31,345 (−20.6%)** |
| `/(gm)/profile` (GM) | 77,454 | 71,629 | **−5,825 (−7.5%)** |
| `/(gm)/games` (GM 劇本列表) | 40,293 | 40,293 | 0 |
| `/(player)/g/[gameId]` (玩家世界觀) | 37,531 | 37,531 | 0 |

**玩家端仍未受惠** — Phase 3 才會處理玩家主入口（`/c/[characterId]` 129 KB gz 是下個目標）。

## 歷史：Phase 0→2 各路由 Eager First Load JS（post phase 2-2 baseline）

量測方式：`.next/analyze/client.html` 的 `isInitialByEntrypoint` 非空 chunks 總和。

| 路由 | Parsed | Gzip |
|---|---|---|
| `/c/[characterId]` (玩家角色卡) | 432,569 | 129,403 |
| `/(gm)/games/[gameId]/characters/[characterId]` (GM 編輯角色) | 533,328 | 168,340 |
| `/(gm)/games/[gameId]` (GM 管理劇本) | 482,811 | 152,194 |
| `/(gm)/profile` | 239,902 | 77,454 |
| `/(gm)/games` (GM 劇本列表) | 125,166 | 40,293 |
| `/(player)/g/[gameId]` (玩家世界觀) | 114,982 | 37,531 |
| `/(player)/g/layout` (玩家布局) | 36,938 | 10,920 |
| `/c/layout` (玩家角色卡布局) | 36,938 | 10,920 |
| `/auth/login` | 74,426 | 22,938 |
| `/auth/verify` | 74,225 | 22,352 |
| `main-app` (shared by app/router) | 391,131 | 115,261 |
| `main` (shared by pages/router) | 327,430 | 100,504 |

Phase 3 的優化目標：`/c/[characterId]` 129 KB gz 與 `/(player)/g/[gameId]` 37 KB gz 兩個玩家入口，特別是前者。
