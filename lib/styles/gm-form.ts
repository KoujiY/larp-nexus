/**
 * GM 側表單共用樣式常數
 *
 * 統一 GM 頁面（劇本編輯、角色編輯、Wizard 等）的 input / label / scrollbar 樣式，
 * 避免各元件各自定義導致不一致。
 */

/** Label：10px 大寫粗體 + tracking-widest */
export const GM_LABEL_CLASS =
  'block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2';

/** Input：bg-muted, 無邊框, h-11, font-semibold, focus ring primary */
export const GM_INPUT_CLASS =
  'bg-muted border-none shadow-none h-11 py-0 px-4 font-semibold focus-visible:ring-primary';

/** Select trigger：與 Input 等高，bg-card */
export const GM_SELECT_CLASS =
  'w-full bg-card border-none shadow-none rounded-lg px-4 h-11 data-[size=default]:h-11 font-semibold text-sm focus:ring-2 focus:ring-primary';

/** 必填錯誤 ring */
export const GM_ERROR_RING_CLASS = 'ring-2 ring-destructive';

/** 必填錯誤訊息（absolute 定位，避免推開下方元件） */
export const GM_ERROR_TEXT_CLASS = 'absolute left-0 top-full text-xs text-destructive font-medium mt-1.5';

/**
 * 自訂 scrollbar 樣式（GM 側）
 *
 * 窄 1.5px 圓角 thumb，track 透明，thumb 使用 border 色。
 * 用於 overflow-y-auto 容器的 className。
 */
/** Section 標題：accent bar + text-lg font-bold */
export const GM_SECTION_TITLE_CLASS =
  'text-lg font-bold flex items-center gap-2';

/** Section 卡片容器：bg-card 圓角 + 微邊框 */
export const GM_SECTION_CARD_CLASS =
  'bg-card p-8 rounded-xl shadow-sm border border-border/5';

export const GM_SCROLLBAR_CLASS =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-primary/70';

// ─── Badge 樣式系統 ──────────────────────────────────

/**
 * GM 側統一 badge variant 定義
 *
 * 兩種尺寸：
 * - status：小型狀態指示 pill（9px, rounded-full）— NEW / MODIFIED / 已揭露 / 未揭露
 * - attribute：屬性標籤（11px, rounded-md）— 效果數量、檢定類型、冷卻、標籤…
 */

/** Status badge 基底 class（小型狀態 pill） */
export const GM_STATUS_BADGE_BASE =
  'text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm';

/** Attribute badge 基底 class（屬性標籤） */
export const GM_ATTR_BADGE_BASE =
  'text-[11px] font-bold px-2.5 py-1 rounded-md';

/** Badge variant 色彩 */
export const GM_BADGE_VARIANTS = {
  /** 主色調（強調）：用於檢定類型、MODIFIED 狀態等 */
  primary: 'bg-primary/10 text-primary border border-primary/20',
  /** 填滿主色：用於 NEW 狀態 */
  'primary-solid': 'bg-primary text-primary-foreground',
  /** 柔和色：用於效果數量、標籤、可轉移等 */
  muted: 'bg-muted text-muted-foreground',
  /** 資訊色：用於冷卻時間等 */
  info: 'bg-info/10 text-info border border-info/20',
  /** 成功色：用於「已揭露」等正向狀態 */
  success: 'bg-success text-success-foreground',
  /** 次要色：用於「未揭露」等中性狀態 */
  secondary: 'bg-secondary text-secondary-foreground',
} as const;

export type GmBadgeVariant = keyof typeof GM_BADGE_VARIANTS;

// ─── 展開區塊共用樣式 ──────────────────────────────────

/** 展開區塊 section header（10px 大寫粗體 + 寬字距） */
export const GM_DETAIL_HEADER_CLASS =
  'text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground';

/** 左側邊線資訊卡片容器 */
export const GM_ACCENT_CARD_CLASS =
  'p-3 rounded-r-xl bg-muted/20 border-l-2 border-primary/60';
