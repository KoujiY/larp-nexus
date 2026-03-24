/**
 * 事件映射器共用型別
 */

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
}

/**
 * 追蹤最近轉移/偷竊事件的 Map
 * 這是一個 React ref 物件，包含一個 Map
 */
export interface RecentTransferTracker {
  current: Map<string, { timestamp: number; transferType: string; fromCharacterId?: string; toCharacterId?: string }>;
}
