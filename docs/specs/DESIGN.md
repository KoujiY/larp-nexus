# LARP Nexus Design System

---

## 典雅奇幻旅程

**設計宗旨**：「奇幻世界的精緻入口——介面本身是沉浸體驗的一部分，而非工具。」

**四個核心原則**：

1. **沉浸優先** — 每個畫面強化奇幻氛圍。不是 SaaS，不是遊戲 HUD，是精緻的角色扮演道具。
2. **雙主題同等精緻** — 玩家端深色（午夜藍）與 GM 端淺色（暖米白）各自精心設計，不互為反色。
3. **操作一步到位** — 玩家端關鍵操作落於手機下半部；GM 端資訊密度高，靠尺寸、色彩、間距建立層次。
4. **環境感知** — GM 的 Baseline（設定中）與 Runtime（遊戲進行中）在視覺上必須立即可辨認。

**禁止出現的設計語言**：
- 紫色漸層背景（`from-purple-*/to-violet-*`）
- Bootstrap 通用藍按鈕
- 霓虹電玩 HUD 風格
- 純白或純黑背景
- Emoji 作為功能性圖示

---

## 色彩系統

採用 **oklch 色彩空間**，所有色彩定義於 `app/globals.css`，透過 CSS custom properties + Tailwind CSS 4 `@theme inline` 映射。

### 玩家端（深色主題）

| 角色 | Token | oklch | 說明 |
|------|-------|-------|------|
| 頁面背景 | `background` | `oklch(0.130 0.028 262)` | 深午夜藍，非純黑 |
| 卡片背景 | `card` | `oklch(0.185 0.028 262)` | 略亮的午夜藍 |
| 主色 | `primary` | `oklch(0.78 0.15 75)` | 明亮琥珀金 |
| 主色文字 | `primary-foreground` | `oklch(0.130 0.028 262)` | 午夜藍（置於金底上） |
| 主要文字 | `foreground` | `oklch(0.935 0.012 75)` | 帶金色調的暖白 |
| 次要文字 | `muted-foreground` | `oklch(0.620 0.015 262)` | 中藍灰 |
| 邊框 | `border` | `oklch(1 0 0 / 10%)` | 半透明白色，微光暈感 |
| Focus Ring | `ring` | `oklch(0.78 0.15 75)` | 金琥珀 |

### GM 端（淺色主題）

| 角色 | Token | oklch | 說明 |
|------|-------|-------|------|
| 頁面背景 | `background` | `oklch(0.975 0.008 80)` | 暖米白，帶極淡金調 |
| 卡片背景 | `card` | `oklch(0.995 0.005 80)` | 略亮的暖白 |
| 主色 | `primary` | `oklch(0.52 0.16 75)` | 琥珀金（較深，確保對比度） |
| 主要文字 | `foreground` | `oklch(0.165 0.028 262)` | 深午夜藍 |
| 次要文字 | `muted-foreground` | `oklch(0.48 0.018 262)` | 中藍灰 |
| 邊框 | `border` | `oklch(0.875 0.012 80)` | 暖淡邊框 |
| 側邊欄底色 | `sidebar` | `oklch(0.955 0.010 80)` | 暖淡側邊 |

### 語義色（雙主題自動切換）

| 語義 | Token | 用途 |
|------|-------|------|
| 成功 | `success` | 任務完成、道具使用成功、操作確認 |
| 警告 | `warning` | 冷卻中、道具耗盡、未保存提示 |
| 危險 | `destructive` | 錯誤、刪除操作、對抗失敗、數值危急 |
| 資訊 | `info` | 說明提示、揭露的隱藏資訊、系統通知 |

每個語義色有配對前景色（`*-foreground`），以及透明度變體（如 `bg-success/10`、`border-success/30`）。

### GM 環境指示色

| 環境 | Token 前綴 | 色彩語義 |
|------|-----------|---------|
| Baseline（設定中）| `env-baseline` | 板岩藍——冷靜、待機、可編輯 |
| Runtime（遊戲中）| `env-runtime` | 琥珀金——活躍、進行中、謹慎操作 |

每個環境色有三個層次：`env-{x}`（主色）、`env-{x}-fg`（文字）、`env-{x}-bg`（淡背景，用於橫幅）。

---

## 字體、間距與圓角

### 字體

本系統使用 Geist 字體家族（`font-sans` / `font-mono`）。不引入裝飾性字體，靠字重變化建立層次。

```
角色名稱、頁面大標題   text-4xl font-bold
區塊標題              text-2xl font-semibold
卡片標題              text-lg  font-semibold
主要內文              text-base font-normal
次要說明、badge       text-sm
時間戳、輔助資訊       text-xs
數值（等寬）          font-mono tabular-nums
```

### 圓角

基礎值 `--radius: 0.625rem`（10px）。

| Class | 大小 | 用途 |
|-------|------|------|
| `rounded-sm` | 6px | Badge、Tag |
| `rounded-md` | 8px | 按鈕、Input、小元件 |
| `rounded-lg` | 10px | 標準卡片、Dialog |
| `rounded-xl` | 14px | 大區塊、Empty State |
| `rounded-full` | 9999px | 通知徽章、Avatar |

### 間距節奏

基本單位 4px（Tailwind spacing scale）。常用組合：

- 元素內間距：`p-3`（12px）、`p-4`（16px）、`p-6`（24px）
- 元素間距：`gap-2`（8px）、`gap-4`（16px）、`gap-6`（24px）
- 區塊間距：`space-y-4`、`space-y-6`
- 頁面邊距：`px-4 py-6`（手機）、`p-8`（桌面）

---

## 核心元件規格

### 卡片

**深色模式**：
```
background: card (oklch(0.185 0.028 262))
border: 1px solid oklch(1 0 0 / 10%)
border-radius: rounded-lg
無陰影，靠邊框建立層次
```

**淺色模式**：
```
background: card (oklch(0.995 0.005 80))
border: 1px solid border
border-radius: rounded-lg
box-shadow: 暖色調小陰影（非冷灰）
```

### 按鈕（shadcn/ui variant 對應）

| Variant | 場景 |
|---------|------|
| `default` | 主要 CTA：使用道具、解鎖、儲存、確認 |
| `secondary` | 次要操作：取消、返回 |
| `outline` | 三級操作：查看詳情、展開選項 |
| `ghost` | 最低優先：禁用狀態的操作入口 |
| `destructive` | 破壞性操作：刪除角色、結束遊戲 |

玩家端主要 CTA 按鈕規格：`h-14 w-full rounded-lg font-semibold`（確保手機拇指可達）。

### 空狀態（Empty State）

統一樣式：
```tsx
<div className="flex flex-col items-center justify-center rounded-xl bg-muted/30 py-16">
  <Icon className="h-10 w-10 text-muted-foreground/40 mb-3" />
  <p className="text-sm text-muted-foreground">說明文字</p>
</div>
```

不使用虛線邊框（`border-dashed` 僅保留給 drag-and-drop drop zone）。

### GM 環境橫幅

固定於內容區頂部，讓 GM 在任何子頁面都能感知當前環境：

```tsx
// Runtime 模式
<div className="border-b border-env-runtime/30 bg-env-runtime/10 px-4 py-2 text-sm font-medium text-env-runtime">
  ● 遊戲進行中（Runtime）— 所有修改僅影響本次遊戲
</div>

// Baseline 模式
<div className="border-b border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
  ○ 設定模式（Baseline）
</div>
```

### 揭露資訊區塊（隱藏資訊被揭露時）

```tsx
<div className="rounded-lg border border-info/30 bg-info/5 border-l-2 border-l-info p-4">
  <Badge variant="outline" className="text-info mb-2">已揭露</Badge>
  <p className="text-sm text-foreground">{content}</p>
</div>
```

---

## 動畫與互動規範

### 動畫時長

| 情境 | 時長 | 緩動 |
|------|------|------|
| 畫面初始進場（fade + slide-up 8px）| 250ms | ease-out |
| Tab 切換（fade）| 180ms | ease-out |
| Dialog 開啟（scale 0.96→1 + fade）| 200ms | ease-out |
| Dialog 關閉 | 150ms | ease-in |
| 卡片 hover lift（translateY -2px）| 150ms | ease-out |
| 錯誤 shake（±4px × 3）| 300ms | ease-in-out |
| 進度條填充 | 500ms | ease-out |

實作工具：**CSS transitions + keyframes**（Tailwind 4 utilities，如 `transition-[transform,opacity] duration-300 ease-out`）。複雜 orchestration（`staggerChildren`）、layout transitions 或 gesture 驅動動畫才評估引入動畫庫；目前專案無此需求，已於 2026-04-19 移除 framer-motion。

### 按鈕互動

```
hover:    opacity-90 或 hover:bg-primary/90
active:   scale-[0.98]（輕微下壓感）
disabled: opacity-50 cursor-not-allowed（無 hover 效果）
loading:  Loader2 icon animate-spin + 文字
```

### 輸入框狀態

```
focus:   ring-2 ring-ring（金琥珀）+ border-ring
error:   border-destructive ring-destructive/20
         + 下方 text-destructive text-sm 說明
```

### 回饋機制

| 類型 | 工具 |
|------|------|
| 操作成功 | `toast.success()` via Sonner |
| 操作失敗 | `toast.error()` via Sonner |
| 欄位錯誤 | inline `text-destructive text-sm` |
| 破壞性確認 | `AlertDialog`（shadcn/ui），不用 `window.confirm()` |

---

## Tailwind CSS 4 實作指引

### 色彩 Token 使用規則

```tsx
// ✅ 正確：使用語義 token
className="bg-primary text-primary-foreground"
className="bg-success/10 border-success/30 text-success"
className="bg-env-runtime/15 border-env-runtime/30 text-env-runtime"

// ❌ 禁止：直接使用 Tailwind 原始色階
className="bg-amber-500"
className="bg-green-600 text-white"
className="text-red-500"

// ❌ 禁止：手寫 dark: 覆寫（由 token 層自動管理）
className="bg-white dark:bg-gray-900"
```

### RWD 策略

| 端別 | 優先順序 | 斷點邏輯 |
|------|---------|---------|
| 玩家端 | 手機優先 | `base` = 手機，`sm:` = 平板，`md:` = 桌面 |
| GM 端 | 桌面優先 | `lg:` 以上 = 固定側邊欄；以下 = MobileHeader + Sheet |

玩家端 Tab 文字在手機隱藏，桌面顯示：
```tsx
<span className="hidden sm:inline">道具</span>
```

### 主題控制

```tsx
// 玩家端頁面（強制深色）
<html className="dark">

// GM 端頁面（跟隨系統，預設淺色）
<html>
```

所有色彩透過 token 自動適配，不在元件層寫 `dark:` class。
