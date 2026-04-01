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
export const GM_SCROLLBAR_CLASS =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-primary/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-primary/70';
