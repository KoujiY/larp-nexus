# Phase 0 Bundle Baseline — Client Module 分析

> 由 `pnpm analyze`（Next 16.1.6 webpack build）輸出的 `.next/analyze/client.html` 解析而得
> 量測日期：2026-04-19

## 客戶端 Bundle 整體概況

- **Chunks**：63 個
- **主要貢獻套件 top-5（gzip）**：@radix-ui / framer-motion / lucide-react / pusher-js / @dnd-kit
- **Server-only 套件隔離狀態**：✅ 乾淨（見下方「Server-Side Only 驗證」）

## Heavy Dependencies 在 Client Bundle 的分布

| 套件 | Parsed | Gzip | Modules | Chunks | 評語 |
|---|---|---|---|---|---|
| `@radix-ui/*` | 221,538 B | 85,171 B | 66 | 8 | **最大頭**，UI primitives 不易 dynamic，但某些 dialog 仍可延後載入 |
| ~~`framer-motion`~~ | ~~113,565 B~~ | ~~38,019 B~~ | ~~258~~ | ~~1~~ | **已於 2026-04-19 完全移除**，sticky-save-bar 改用 CSS transitions |
| `pusher-js` | 60,331 B | 17,723 B | 3 | 3 | **在 baseline 就載入**，但玩家未解鎖前無實時需求 → 可延後 |
| `@dnd-kit/*` | 45,798 B | 15,959 B | 4 | 1 | 只在 GM 拖拽排序用 → 可 dynamic |
| `lucide-react` | 36,838 B | 24,336 B | 138 | 16 | Tree-shaking 已生效（138 modules vs 套件總 1000+），仍可再降 via `optimizePackageImports` |
| `zod` | 37,718 B | 10,184 B | 68 | 1 | 資料驗證不可避；可評估 runtime-only schema 拆到 server |
| `sonner` | 34,722 B | 9,852 B | 4 | 4 | Toast 元件，體積合理 |
| `qrcode` | 27,409 B | 14,057 B | 29 | 3 | 僅 GM 按鈕產 QR 用 → **dynamic 首選** |
| `date-fns` | 23,563 B | 7,825 B | 42 | 1 | 可評估改 `date-fns/locale` 按需載入或換 `day.js` |
| `react-easy-crop` | 20,126 B | 5,605 B | 1 | 1 | 編輯頭像 dialog 才需 → **dynamic 首選** |
| `embla-carousel-react` | 17,806 B | 7,154 B | 3 | 1 | 輪播元件，確認實際用處 |

## Server-Side Only 驗證（✅ 無污染）

以下套件**完全不在 client bundle**（掃描 0 bytes）：

- `mammoth`（DOCX 解析）
- `openai`（AI SDK）
- `mongoose`（資料庫）
- `nodemailer`（郵件）
- `bcrypt`（密碼 hash）
- `sharp`（圖片處理）
- `iron-session`（session 加密）

說明：Next.js App Router 的 `'use server'` / server component / API route 邊界運作正常，這些伺服器端套件透過 dead-code elimination 從 client bundle 排除。**不需要額外處理**。

## Top 20 最大 Client 模組（單檔）

| Parsed | Gzip | 模組 |
|---|---|---|
| 198,405 | 62,267 | `react-dom-client.production.js`（Next 內嵌 compiled 版） |
| 174,621 | 54,896 | `react-dom-client.production.js`（pnpm 版，React 19 運行時） |
| 60,331 | 17,723 | `pusher-js/dist/web/pusher.js` |
| 35,476 | 11,689 | `@dnd-kit/core/dist/core.esm.js` |
| 33,504 | 9,207 | `sonner/dist/index.mjs` |
| 30,979 | 8,049 | `components/gm/ability-edit-wizard.tsx` + 25 modules concat |
| 24,811 | 7,819 | `tailwind-merge/dist/bundle-mjs.mjs` |
| 23,770 | 7,660 | `react-server-dom-webpack-client.browser.production.js` |
| 22,544 | 7,385 | `next/dist/shared/lib/router/router.js` |
| 20,126 | 5,605 | `react-easy-crop/index.module.mjs` |
| 19,210 | 6,259 | `framer-motion/dist/es/projection/node/create-projection-node.mjs` |
| 18,567 | 6,396 | `@radix-ui/react-select/dist/index.mjs` |
| 16,724 | 6,720 | `embla-carousel/esm/embla-carousel.esm.js` |
| 13,206 | 4,356 | `@radix-ui/react-menu/dist/index.mjs` |
| 13,166 | 4,337 | `@radix-ui/react-navigation-menu/dist/index.mjs` |
| 12,866 | 4,365 | `next/dist/client/components/segment-cache/cache.js` |
| 12,100 | 2,977 | `components/player/contest-response-dialog.tsx` + 62 modules concat |
| 12,002 | 3,699 | `@radix-ui/react-scroll-area/dist/index.mjs` |
| 10,837 | 3,829 | `@radix-ui/react-toast/dist/index.mjs` |
| 10,120 | 2,490 | `components/player/item-list.tsx` + 62 modules concat |

## 關鍵發現與行動項目

### Finding 1：framer-motion 與 pusher-js 是最明確的 dynamic 標的

| 套件 | 目前狀態 | 建議 | 預估節省（gzip） |
|---|---|---|---|
| `framer-motion` | 全 bundle 永遠載入，僅 `sticky-save-bar.tsx` 使用 | dynamic import（階段 2-1） | -38 KB |
| `pusher-js` | baseline 就載入，但玩家未進遊戲前無實時需求 | 延後到 PlayerThemeWrapper 或實際 WebSocket 建立時 | -18 KB |
| `qrcode` | baseline 載入，僅 GM 按 QR 按鈕時需要 | dynamic import at click（階段 2-3） | -14 KB |
| `react-easy-crop` | baseline 載入，僅編輯頭像時需要 | dynamic dialog 內載入 | -5.6 KB |
| `@dnd-kit` | baseline 載入，僅 GM 拖拽用 | 限縮到具拖拽功能的 route chunk | -16 KB（僅 GM） |

**合計預估階段 2 可節省：約 75-90 KB gzip**（玩家 baseline）

### Finding 2：@radix-ui 佔最大但幾乎不可動

85 KB gzip 是必要成本（UI 骨架）。可以做的：
- 確認只有實際使用的 radix primitives 被打包（lucide-react 已驗證 tree-shake 生效，radix 需要類似驗證）
- `optimizePackageImports: ['radix-ui']` 能再降 10-20%

### Finding 3：Next 已做 granular code-splitting

`ability-edit-wizard.tsx + 25 modules concat` 這種「component + 依賴 concat 成一個 chunk」的模式，代表 Next 16 的 module concatenation + route-level code splitting 在運作。**不需要強行手動切分**（這會與 Next 的打包策略衝突），而是信任 Next 會把正確東西放進正確 chunk。

### Finding 4：lucide-react tree-shaking 有效但可再降

138 modules / 24 KB gzip 是使用數量合理的結果。加入 `optimizePackageImports: ['lucide-react']` 後，Next 16 會做更積極的 barrel tree-shake。保守估計可再降 20-30%。

## 與原計畫的落差修正

原階段 2 的排序需要調整：

| 原排序 | 新排序（依 baseline 實證） |
|---|---|
| 1. framer-motion dynamic | 1. framer-motion dynamic（-38 KB） |
| 2. mammoth dynamic | ~~mammoth 已是 server-only，不在 client bundle，跳過~~ |
| 3. qrcode dynamic | 3. qrcode dynamic（-14 KB） |
| 4. react-easy-crop dynamic | 4. react-easy-crop dynamic（-5.6 KB） |
| 新增：pusher-js 延後載入 | 2. **pusher-js 延後載入（-18 KB）—— 效益第二大** |
| 新增：@dnd-kit 路由限縮 | 5. @dnd-kit 限縮到 GM 拖拽路由（-16 KB GM-only） |

**階段 2 新總目標：玩家 baseline 減 75-90 KB gzip（約 15-20% 共用 chunks 體積）**

## 原始資料位置

- `.next/analyze/client.html`：可視化 tree-map（建議瀏覽器開啟）
- `.next/analyze/edge.html`：Edge runtime bundle（Middleware 相關）
- `.next/analyze/nodejs.html`：Server bundle（含 mongoose/openai 等，驗證 server-only 隔離）
- `.next/analyze/modules.json`：本報告解析所用的平坦化 JSON（gitignored）

> 重現方法：`pnpm analyze` 後產物位於 `.next/analyze/`；`.next/` 已 gitignore，artifacts 需靠 CI 上傳（見 `.github/workflows/bundle-analysis.yml`）。
