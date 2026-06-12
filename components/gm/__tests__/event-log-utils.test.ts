import { describe, it, expect } from 'vitest';
import { mergeIncrementalLogs } from '../event-log-utils';
import type { LogData } from '@/app/actions/logs';

function log(id: string, ts: string): LogData {
  return {
    id,
    timestamp: new Date(ts),
    gameId: 'game-1',
    actorType: 'system',
    actorId: 'sys',
    action: 'broadcast',
    details: {},
  };
}

describe('mergeIncrementalLogs', () => {
  const prev = [log('b', '2026-06-12T10:00:01Z'), log('a', '2026-06-12T10:00:00Z')];

  it('新紀錄 prepend 至頂端，維持時間降序', () => {
    const incoming = [log('d', '2026-06-12T10:00:03Z'), log('c', '2026-06-12T10:00:02Z')];

    const merged = mergeIncrementalLogs(prev, incoming, 100);

    expect(merged.map((l) => l.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('邊界重複（$gte 游標同毫秒）以 id 去重', () => {
    const incoming = [log('c', '2026-06-12T10:00:02Z'), log('b', '2026-06-12T10:00:01Z')];

    const merged = mergeIncrementalLogs(prev, incoming, 100);

    expect(merged.map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });

  it('無新紀錄時回傳原 reference（不觸發 re-render）', () => {
    const incoming = [log('b', '2026-06-12T10:00:01Z')];

    expect(mergeIncrementalLogs(prev, incoming, 100)).toBe(prev);
  });

  it('合併後裁切至 cap，淘汰最舊紀錄', () => {
    const incoming = [log('d', '2026-06-12T10:00:03Z'), log('c', '2026-06-12T10:00:02Z')];

    const merged = mergeIncrementalLogs(prev, incoming, 3);

    expect(merged.map((l) => l.id)).toEqual(['d', 'c', 'b']);
  });
});
