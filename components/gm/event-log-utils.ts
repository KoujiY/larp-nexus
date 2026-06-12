import type { LogData } from '@/app/actions/logs';

/**
 * 合併增量抓取的 log 至既有列表（BACKLOG：GM log since-cursor 增量抓取）
 *
 * 增量查詢以 `$gte` 游標時間戳發出，邊界（與游標同毫秒）的既有紀錄會
 * 重複出現在回應中——以 id 去重。新紀錄（伺服器端已按時間降序）prepend
 * 至列表頂端，總量裁切至 cap（記憶體內輪替，與全量抓取的上限一致）。
 *
 * @param prev - 既有列表（時間降序）
 * @param incoming - 增量回應（時間降序，可能含邊界重複）
 * @param cap - 保留上限
 * @returns 合併後列表；無新紀錄時回傳原 reference（避免無謂 re-render）
 */
export function mergeIncrementalLogs(
  prev: LogData[],
  incoming: LogData[],
  cap: number
): LogData[] {
  const known = new Set(prev.map((log) => log.id));
  const fresh = incoming.filter((log) => !known.has(log.id));
  if (fresh.length === 0) return prev;
  return [...fresh, ...prev].slice(0, cap);
}
