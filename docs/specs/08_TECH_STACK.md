# 技術棧與套件清單

## 版本：v1.0
## 更新日期：2025-11-29

---

> ⚠️ **重要提醒**：部分技術需要外部服務註冊。請先完成 [外部設定檢查清單](./10_EXTERNAL_SETUP_CHECKLIST.md) 後再安裝套件。

---

## 1. 核心技術棧

### 1.1 前後端框架

| 技術 | 版本 | 用途 | 官方文件 |
|------|------|------|----------|
| **Next.js** | 16.0+ | 全端框架（SSR, API Routes, Server Actions） | [nextjs.org](https://nextjs.org) |
| **React** | 19.0+ | UI 框架 | [react.dev](https://react.dev) |
| **TypeScript** | 5.0+ | 類型安全 | [typescriptlang.org](https://www.typescriptlang.org) |

---

### 1.2 資料庫

| 技術 | 版本 | 用途 | 官方文件 | 外部設定 |
|------|------|------|----------|----------|
| **MongoDB Atlas** | 7.0+ | NoSQL 資料庫（免費 M0 方案） | [mongodb.com/atlas](https://www.mongodb.com/cloud/atlas) | ⚠️ [需註冊](./10_EXTERNAL_SETUP_CHECKLIST.md#11-mongodb-atlas-設定) |
| **Mongoose** | 8.0+ | MongoDB ODM | [mongoosejs.com](https://mongoosejs.com) | - |

---

### 1.3 UI 元件與樣式

| 技術 | 版本 | 用途 | 官方文件 |
|------|------|------|----------|
| **Tailwind CSS** | 4.0+ | Utility-first CSS 框架 | [tailwindcss.com](https://tailwindcss.com) |
| **shadcn/ui** | latest | React 元件庫（基於 Radix UI） | [ui.shadcn.com](https://ui.shadcn.com) |
| **Radix UI** | latest | Headless UI 元件 | [radix-ui.com](https://www.radix-ui.com) |
| **Lucide React** | latest | Icon 圖示庫 | [lucide.dev](https://lucide.dev) |
| **Framer Motion** | 11.0+ | 動畫庫 | [framer.com/motion](https://www.framer.com/motion) |

---

### 1.4 狀態管理

| 技術 | 版本 | 用途 | 官方文件 |
|------|------|------|----------|
| **Jotai** | 2.0+ | 原子化狀態管理 | [jotai.org](https://jotai.org) |

---

### 1.5 即時通訊

| 技術 | 版本 | 用途 | 官方文件 | 外部設定 |
|------|------|------|----------|----------|
| **Pusher** | latest | WebSocket 服務（免費 100 連線） | [pusher.com](https://pusher.com) | ⚠️ [需註冊](./10_EXTERNAL_SETUP_CHECKLIST.md#21-pusher-設定websocket) |
| **pusher-js** | 8.0+ | Pusher 前端 SDK | [github.com/pusher/pusher-js](https://github.com/pusher/pusher-js) | - |
| **pusher** | 5.0+ | Pusher 後端 SDK | [github.com/pusher/pusher-http-node](https://github.com/pusher/pusher-http-node) | - |

---

### 1.6 圖片處理與儲存

| 技術 | 版本 | 用途 | 官方文件 | 外部設定 |
|------|------|------|----------|----------|
| **Vercel Blob** | latest | 圖片儲存服務（免費 1GB） | [vercel.com/docs/storage/vercel-blob](https://vercel.com/docs/storage/vercel-blob) | ⚠️ [需啟用](./10_EXTERNAL_SETUP_CHECKLIST.md#31-vercel-帳號與專案設定) |
| **sharp** | 0.33+ | 圖片壓縮與處理 | [sharp.pixelplumbing.com](https://sharp.pixelplumbing.com) | - |

---

### 1.7 認證與 Session

| 技術 | 版本 | 用途 | 官方文件 |
|------|------|------|----------|
| **iron-session** | 8.0+ | Session 管理（加密 Cookie） | [github.com/vvo/iron-session](https://github.com/vvo/iron-session) |
| **bcrypt** | 5.0+ | PIN Hash | [github.com/kelektiv/node.bcrypt.js](https://github.com/kelektiv/node.bcrypt.js) |

---

### 1.8 Email 服務

| 技術 | 版本 | 用途 | 官方文件 | 外部設定 |
|------|------|------|----------|----------|
| **Nodemailer** | 8.0+ | SMTP Email 發送（Gmail SMTP，免費 500 封/天） | [nodemailer.com](https://nodemailer.com) | ⚠️ [需設定 Gmail App Password](./10_EXTERNAL_SETUP_CHECKLIST.md#22-email-服務設定nodemailer--gmail-smtp) |

---

### 1.9 其他工具

| 技術 | 版本 | 用途 | 官方文件 |
|------|------|------|----------|
| **qrcode** | 1.5+ | QR Code 生成 | [github.com/soldair/node-qrcode](https://github.com/soldair/node-qrcode) |
| **zod** | 3.0+ | Schema 驗證 | [zod.dev](https://zod.dev) |
| **date-fns** | 3.0+ | 日期處理 | [date-fns.org](https://date-fns.org) |
| **clsx** | 2.0+ | className 合併工具 | [github.com/lukeed/clsx](https://github.com/lukeed/clsx) |
| **tailwind-merge** | 2.0+ | Tailwind className 合併 | [github.com/dcastil/tailwind-merge](https://github.com/dcastil/tailwind-merge) |

---

## 2. 開發工具

### 2.1 程式碼品質

| 技術 | 版本 | 用途 |
|------|------|------|
| **ESLint** | 9.0+ | JavaScript/TypeScript Linter |
| **Prettier** | 3.0+ | 程式碼格式化 |
| **Husky** | 9.0+ | Git Hooks 管理 |
| **lint-staged** | 15.0+ | Git Staged 檔案檢查 |

---

### 2.2 測試（選用）

| 技術 | 版本 | 用途 |
|------|------|------|
| **Vitest** | 1.0+ | 單元測試 |
| **Playwright** | 1.40+ | E2E 測試 |
| **@testing-library/react** | 14.0+ | React 元件測試 |

---

### 2.3 部署與監控

| 技術 | 用途 |
|------|------|
| **Vercel** | 部署平台（自動 CI/CD） |
| **Vercel Analytics** | 效能分析 |

---

## 3. 套件安裝指令

### 3.1 核心依賴

```bash
pnpm add next@latest react@latest react-dom@latest

pnpm add mongoose
pnpm add pusher pusher-js
pnpm add @vercel/blob
pnpm add iron-session
pnpm add bcrypt
pnpm add resend

pnpm add jotai
pnpm add framer-motion
pnpm add qrcode
pnpm add zod
pnpm add date-fns
pnpm add clsx tailwind-merge
pnpm add lucide-react

pnpm add sharp
```

---

### 3.2 UI 元件（shadcn/ui）

shadcn/ui 採用「按需安裝」方式，使用 CLI 安裝：

```bash
# 初始化 shadcn/ui
npx shadcn@latest init

# 安裝需要的元件
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add label
npx shadcn@latest add textarea
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
npx shadcn@latest add tabs
npx shadcn@latest add accordion
npx shadcn@latest add avatar
npx shadcn@latest add badge
npx shadcn@latest add checkbox
npx shadcn@latest add select
npx shadcn@latest add switch
npx shadcn@latest add toast
npx shadcn@latest add alert
npx shadcn@latest add skeleton
```

---

### 3.3 開發依賴

```bash
pnpm add -D typescript @types/node @types/react @types/react-dom
pnpm add -D @types/bcrypt
pnpm add -D @types/qrcode

pnpm add -D eslint eslint-config-next
pnpm add -D prettier prettier-plugin-tailwindcss
pnpm add -D husky lint-staged

pnpm add -D @tailwindcss/postcss
pnpm add -D tailwindcss postcss autoprefixer
```

---

### 3.4 選用套件

#### 測試框架

```bash
pnpm add -D vitest @vitest/ui
pnpm add -D @testing-library/react @testing-library/jest-dom
pnpm add -D @playwright/test
```

---

## 4. package.json Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "type-check": "tsc --noEmit",
    "test": "vitest",
    "test:e2e": "playwright test",
    "prepare": "husky install"
  }
}
```

---

## 5. 套件版本管理策略

### 5.1 語意化版本

```json
{
  "dependencies": {
    "next": "^16.0.0",        // 主要版本鎖定，允許次版本更新
    "react": "^19.0.0",       // 主要版本鎖定
    "mongoose": "^8.0.0"      // 主要版本鎖定
  }
}
```

### 5.2 更新檢查

```bash
# 檢查過期套件
pnpm outdated

# 互動式更新
pnpm update -i

# 更新所有次版本
pnpm update --latest
```

---

## 6. 套件大小優化

### 6.1 Bundle 分析

```bash
# 安裝分析工具
pnpm add -D @next/bundle-analyzer

# next.config.ts
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withBundleAnalyzer({
  // ... Next.js config
});

# 執行分析
ANALYZE=true pnpm build
```

### 6.2 按需載入

```typescript
// 動態載入 Framer Motion
const MotionDiv = dynamic(() => import('framer-motion').then(mod => mod.motion.div));

// 動態載入 QR Code 生成器
const QRCodeGenerator = dynamic(() => import('@/components/qr-generator'));
```

---

## 7. 相容性需求

### 7.1 瀏覽器支援

| 瀏覽器 | 最低版本 |
|--------|----------|
| Chrome | 90+ |
| Firefox | 88+ |
| Safari | 14+ |
| Edge | 90+ |
| Mobile Safari (iOS) | 14+ |
| Chrome Mobile (Android) | 90+ |

### 7.2 Node.js 版本

```json
{
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

---

## 8. 套件安全性

### 8.1 安全性檢查

```bash
# 檢查已知漏洞
pnpm audit

# 自動修復（僅修復次版本）
pnpm audit fix
```

### 8.2 Dependabot 設定

建立 `.github/dependabot.yml`：

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

---

## 9. 特殊套件說明

### 9.1 為何選擇 Jotai 而非 Redux？

- ✅ 更輕量（~3KB）
- ✅ API 簡潔易學
- ✅ 原子化設計，避免不必要的重渲染
- ✅ 與 React 整合良好

### 9.2 為何選擇 Pusher 而非 Socket.io？

- ✅ 免費方案適合 MVP（100 連線）
- ✅ 無需自架伺服器
- ✅ 提供 Private Channel 認證機制
- ✅ 穩定性高，易於維護

### 9.3 為何選擇 iron-session？

- ✅ 加密 Cookie，無需 Redis
- ✅ 適合 Serverless 環境（Vercel）
- ✅ API 簡潔，易於整合 Next.js

---

## 10. 開發環境設定

### 10.1 VS Code 擴充套件（建議）

- **ESLint**
- **Prettier**
- **Tailwind CSS IntelliSense**
- **TypeScript Vue Plugin (Volar)**
- **Error Lens**

### 10.2 VS Code 設定

建立 `.vscode/settings.json`：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cn\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ]
}
```

---

## 11. 疑難排解

### Q1：安裝 sharp 失敗（Windows）

**解決方式**
```bash
# 使用 Node.js 20+ 並重新安裝
pnpm add sharp --force
```

### Q2：Tailwind CSS 未生效

**解決方式**
1. 確認 `globals.css` 有 `@import "tailwindcss";`
2. 確認 `tailwind.config.js` 的 `content` 路徑正確
3. 重啟開發伺服器

### Q3：TypeScript 類型錯誤

**解決方式**
```bash
# 清除 Next.js 快取
rm -rf .next

# 重新生成類型
pnpm dev
```

---

## 附註

- 所有套件版本需記錄於 `package.json`
- 新增套件前需評估：檔案大小、維護狀態、社群支援
- 定期檢查套件更新與安全性公告

此文件將隨專案需求持續更新。

