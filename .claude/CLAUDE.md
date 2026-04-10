# LARP Nexus 專案指南

## 專案概述
角色扮演遊戲（LARP）管理系統，包含 GM 側和玩家側的完整功能。

## 開發環境

### 技術棧
- **Frontend**: Next.js 16+ + React 19+ + TypeScript
- **State Management**: React Hooks + WebSocket (Pusher)
- **UI**: Tailwind CSS 4+ + shadcn/ui + Framer Motion
- **Database**: MongoDB Atlas (透過 Mongoose)
- **Real-time**: Pusher WebSocket
- **Testing**: Vitest

### 開發命令
```bash
npm run dev          # 啟動開發服務器
npm run build        # 生產構建
npm run lint         # ESLint 代碼檢查
npm run type-check   # TypeScript 類型檢查
npm run test         # 運行測試
```

## 程式碼規範

### TypeScript
- 使用 `strict: true` 模式
- 避免使用 `any`，優先使用 `unknown`
- 使用 `type` 定義數據結構（而非 `interface`）

### 檔案與命名
- 使用 kebab-case 命名文件
- 函數需要 JSDoc 註解

### React 模式（MANDATORY）

**1. localStorage 初始化：依「是否影響 DOM 結構」選擇策略**

判斷準則：**這個值會不會讓 server 和 client 產出不同的 DOM 結構？**

**1a. 值只影響顯示內容（文字、className）→ lazy initializer**
```tsx
// ✅ theme 只影響 className，不改變元件樹
const [theme, setTheme] = useState(() => {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem('theme') ?? 'light';
});
```

**1b. 值決定條件渲染（不同元件樹 `x ? <A/> : <B/>`）→ useEffect**
```tsx
// ✅ collapsed 決定渲染 CollapsedNav 或 ExpandedNav（不同 DOM 結構），
//    初始值必須與 server 一致，hydration 後再讀 localStorage
const [collapsed, setCollapsed] = useState(false);
useEffect(() => {
  if (localStorage.getItem(KEY) === 'true') setCollapsed(true);
}, []);
```

```tsx
// ❌ lazy initializer 在條件渲染場景會造成 hydration mismatch
const [collapsed, setCollapsed] = useState(() => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(KEY) === 'true'; // client 讀到 true → DOM 不同 → mismatch
});
```

**2. Hook 與本地狀態同步：使用 derived value，禁止 useEffect 同步**
```tsx
// ❌ 禁止：useEffect 同步兩個狀態，容易造成循環更新
const [local, setLocal] = useState(hookValue);
useEffect(() => { setLocal(hookValue); }, [hookValue]);

// ✅ 正確：本地未明確選擇時，回退至 hook 預設值
const [local, setLocal] = useState<T | undefined>(undefined);
const effective = local ?? hookValue;
```

## 專案結構
```
app/               # Next.js 應用路由
  ├── (gm)/       # GM 側功能
  ├── (player)/   # 玩家側功能
  └── actions/    # Server Actions
components/        # React 組件
  ├── gm/         # GM 組件
  └── player/     # 玩家組件
lib/              # 業務邏輯和工具
  ├── db/models/  # MongoDB 模型
  ├── contest/    # 對抗系統
  ├── item/       # 道具系統
  └── skill/      # 技能系統
types/            # TypeScript 類型定義
hooks/            # 自定義 React Hooks
docs/             # 文檔
  ├── knowledge/  # 原子化知識庫（主要參考）
  ├── specs/      # 技術規格（詳細 API/WebSocket 規格）
  ├── archive/    # 歷史文件（唯讀參考）
  └── refactoring/ # 開發規劃（NEXT_DEVELOPMENT_PLAN.md）
```

## 開發工具

本專案使用 **everything-claude-code** plugin 提供的工具。常用工具：

| 工具 | 用途 |
|------|------|
| `/plan` | 規劃實作步驟 |
| `/tdd` | 測試驅動開發流程 |
| `/code-review` | 程式碼審查 |
| `/e2e` | E2E 測試 |
| `/verify` | 完整驗證迴圈 |
| `/docs` | 查詢套件文件 |
| `/save-session` | 儲存 session 狀態（context 快用完時使用） |

## 工作流程

### 新功能開發
1. 讀取相關知識庫文件（`docs/knowledge/`）
2. 更新開發規劃文件（需求定義、影響範圍、欄位釐清）
3. `/plan` 規劃實作步驟
4. `/tdd` 測試驅動實作
5. `/code-review` 審查程式碼
6. 更新知識庫（反映實作結果）
7. Commit（按 type 拆分）& PR

### Bug 修復
1. 讀取相關知識庫文件理解現行邏輯
2. 實作修復
3. 補回歸測試
4. `/code-review` 審查

### Commit 前檢查（MANDATORY）
1. **靜態分析（必做）**：`tsc --noEmit` + `eslint <affected-dir>` 兩者都必須 0 error。每個修改步驟完成後也應跑，不只 commit 前
2. **使用者驗證優先**：完成功能開發後**不可**自動 commit。先給使用者**手動驗收指引**，等使用者明確說「驗證通過」「OK」或同義詞後才能 commit。`tsc` / `lint` / `vitest` 通過**不算**驗證，那只是基本健康檢查。例外：使用者在指令中明確包含「commit 動作」（例如「做完直接 commit」）才能略過此步
3. **按 type 拆分**：`feat` / `docs` / `fix` / `refactor` 等不同類型不混在同一 commit
4. **禁止 scope 括號**：commit subject 格式必須是 `type: description`，**不可**寫成 `type(scope): description`。理由：本專案不使用 conventional-commits 的 scope 欄位，多餘的 `(xxx)` 會讓訊息格式不一致，且 scope 選擇易流於主觀（`(gm)` vs `(console)` vs `(effects)`）。正確範例：`feat: add foo` / `refactor: simplify bar`；錯誤範例：`feat(gm): add foo` / `refactor(console): simplify bar`
5. **知識庫同步**：此次變更是否需要更新 `docs/knowledge/` 下的對應文件
6. **開發規劃同步**：是否需要在 `NEXT_DEVELOPMENT_PLAN.md` 標記項目完成
7. **中文亂碼掃描**：Grep `��` 確認 Write/Edit 後沒有編碼錯誤

## 知識庫 (Knowledge Base)

原子化知識庫位於 `docs/knowledge/`，依照領域拆分為小單元，每次開發只需載入相關部分：

```
docs/knowledge/
  gm/character/     ← 角色卡、基本資訊、公開資訊、隱藏資訊、數值
  gm/tasks/         ← 任務管理、隱藏任務與自動揭露
  gm/items/         ← 道具概念、效果與標籤
  gm/skills/        ← 技能概念、效果與標籤
  gm/game/          ← 遊戲設定、廣播系統、遊戲狀態
  player/           ← 角色卡視圖、道具使用、技能使用
  shared/contest/   ← 對抗流程、檢定機制、標籤規則
  shared/           ← 自動揭露系統、通知系統、WebSocket 事件
  architecture/     ← 資料模型、API 參考、部署、技術棧
```

### 知識庫維護規範（MANDATORY）

以下情況**必須**同步更新對應的知識庫文件：
1. **新增功能** → 在相關 domain 的 md 中加入概念說明
2. **修改現有邏輯**（資料結構、流程、規則）→ 更新對應 md
3. **重構後介面改變** → 更新 component 路徑、函數名稱等參考
4. **刪除功能** → 移除或標記過時的知識庫條目

違反此規範會導致知識庫與 codebase 脫節，失去其存在的意義。

## 修改現有功能前的縱向分析（MANDATORY）

修改任何現有功能流程之前，必須完成縱向分析，不能只讀入口層就開始設計：

1. **向上（呼叫端）**：確認所有呼叫這個檔案的地方
   - 元件：grep import 路徑，找出所有父元件
   - Next.js page：grep `/路由名稱`（Link、router.push、redirect），確認是否仍在導航網路中
   - Server action / API route：grep 函數名稱，確認所有呼叫端

2. **向下（依賴鏈）**：沿著呼叫鏈讀完關鍵節點
   - 不能假設任何元件「只是顯示用的」
   - 特別是 page → component 這一層，component 內部可能已有完整的業務邏輯

**常見陷阱**：Next.js `page.tsx` 不需要 import 即可作為路由存在，靜態分析工具無法偵測「已無入口導航的頁面」，必須人工確認。

## 文件同步規則
- 新增或刪除檔案時，檢查是否有其他文件（包含知識庫）引用了該路徑，一併更新
- 若有對應的開發規劃文件（如 `docs/refactoring/NEXT_DEVELOPMENT_PLAN.md`），完成項目後更新完成狀態

## 架構文檔參考
- 開發規劃：`docs/refactoring/NEXT_DEVELOPMENT_PLAN.md`
- API 規範：`docs/specs/03_API_SPECIFICATION.md`
- WebSocket 事件：`docs/specs/04_WEBSOCKET_EVENTS.md`
- 資料模型：`docs/knowledge/architecture/data-models.md`
- 知識庫索引：`docs/knowledge/`

## Design Context

> 完整設計規格見 `.impeccable.md`

### 品牌個性
**優雅・精緻・有質感** — 介面本身是 LARP 沉浸體驗的一部分

### 視覺方向
- 風格：神秘奇幻（Mystical Fantasy）
- 深色模式：深午夜藍背景 + 金/琥珀強調色（玩家主要使用）
- 淺色模式：暖米白背景 + 同一強調色（GM 主要使用）
- 兩種模式同等精緻，非互為反色

### 設計原則
1. **沉浸優先** — 視覺強化奇幻氛圍，而非通用 SaaS 感
2. **一步到位** — 玩家端關鍵操作單手可達（畫面下半部）
3. **資訊層次清晰** — GM 端資訊密度高，依尺寸/色彩/間距分層
4. **深淺並重** — 兩種模式均為精心設計
5. **狀態感知** — Baseline/Runtime、對抗中、道具耗盡等狀態需明確視覺提示

### 技術約束
- Tailwind CSS 4（oklch 色彩空間）
- shadcn/ui 組件（可改 token，不換 Radix primitive）
- Framer Motion 製作轉場動畫
- 玩家端手機優先 RWD，GM 端桌面優先 RWD
