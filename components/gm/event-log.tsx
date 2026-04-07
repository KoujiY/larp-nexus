'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import { formatStatDeltaText } from '@/lib/utils/format-stat-delta';
import { getGameLogs, type LogData } from '@/app/actions/logs';
import { GM_SCROLLBAR_CLASS } from '@/lib/styles/gm-form';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';

interface EventLogProps {
  gameId: string;
  characters: Array<{ id: string; name: string }>;
  /** 遞增此值以觸發重新載入（如 GM 發送廣播後） */
  refreshKey?: number;
}

/**
 * Runtime 控制台 — 事件紀錄面板
 *
 * 刷新策略（非即時同步）：
 * 1. 進入畫面時載入一次
 * 2. 點選「重新讀取」按鈕
 * 3. 切換篩選條件時
 * 4. 外部呼叫 refresh 時（如 GM 發送廣播後）
 */
export function EventLog({ gameId, characters, refreshKey = 0 }: EventLogProps) {
  const [logs, setLogs] = useState<LogData[]>([]);
  const [characterFilter, setCharacterFilter] = useState('all');
  const [isPending, startTransition] = useTransition();

  const fetchLogs = useCallback(() => {
    startTransition(async () => {
      const res = await getGameLogs(gameId, {
        limit: 100,
        characterId: characterFilter === 'all' ? undefined : characterFilter,
      });
      if (res.success && res.data) {
        setLogs(res.data);
      }
    });
  }, [gameId, characterFilter]);

  // 進入畫面 + 篩選變更 + 外部觸發時刷新
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, refreshKey]);

  /** 角色名稱查詢快取 */
  const characterNameMap = new Map(characters.map((c) => [c.id, c.name]));

  return (
    <div className="bg-card rounded-xl border border-border/40 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-border/40 flex justify-between items-center">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          歷史紀錄
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={isPending}
            className="flex items-center gap-1 text-xs font-bold bg-primary/10 text-primary rounded-lg px-3 py-1.5 hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
            重新讀取
          </button>
          <Select value={characterFilter} onValueChange={setCharacterFilter}>
            <SelectTrigger className="h-auto border-none bg-muted rounded-lg px-3 py-1.5 text-xs font-bold w-auto sm:w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部角色</SelectItem>
              {characters.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Event List */}
      <div className={`grow overflow-y-auto p-4 min-h-0 ${GM_SCROLLBAR_CLASS}`}>
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground opacity-50">
            {isPending ? '載入中...' : '尚無事件紀錄'}
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map((log) => (
              <EventLogEntry
                key={log.id}
                log={log}
                characterName={log.characterId ? characterNameMap.get(log.characterId) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 事件類別定義 ──────────────────────────────────────────

type EventCategory = 'gm' | 'system' | 'item' | 'skill' | 'combat' | 'reveal' | 'default';

interface CategoryBadge {
  label: string;
  className: string;
}

const CATEGORY_BADGES: Record<EventCategory, CategoryBadge> = {
  gm: {
    label: 'GM 廣播',
    className: 'bg-primary text-primary-foreground',
  },
  system: {
    label: '系統',
    className: 'bg-foreground text-background',
  },
  item: {
    label: '物品',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
  skill: {
    label: '技能',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  combat: {
    label: '對抗',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  },
  reveal: {
    label: '揭露',
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  },
  default: {
    label: '事件',
    className: 'bg-muted text-muted-foreground',
  },
};

function getEventCategory(action: string, actorType: string): EventCategory {
  if (action === 'game.broadcast' || action === 'broadcast' || action === 'character_message') return 'gm';
  if (action === 'game_start' || action === 'game_end') return 'system';
  if (action === 'item_use') return 'item';
  if (action === 'skill_use') return 'skill';
  if (action === 'contest_result') return 'combat';
  if (action === 'secret_reveal' || action === 'task_reveal') return 'reveal';
  if (action === 'equipment_toggle') return 'item';
  if (action === 'stat_change' || action === 'gm_update' || action === 'effect_expired') return 'system';
  if (actorType === 'system') return 'system';
  return 'default';
}

// ─── Event Log Entry ───────────────────────────────────────

interface EventLogEntryProps {
  log: LogData;
  characterName?: string;
}

function EventLogEntry({ log, characterName }: EventLogEntryProps) {
  const time = new Date(log.timestamp);
  const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

  const category = getEventCategory(log.action, log.actorType);
  const isGmBroadcast = category === 'gm';
  const badge = CATEGORY_BADGES[category];

  return (
    <div
      className={`flex gap-4 p-3 rounded-lg transition-colors ${
        isGmBroadcast
          ? 'bg-primary/5 border border-primary/10'
          : 'hover:bg-muted/50'
      }`}
    >
      {/* Timestamp */}
      <span className="text-[10px] font-mono text-muted-foreground pt-1 opacity-50 shrink-0">
        {timeStr}
      </span>

      {/* Content */}
      <div className="grow min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${badge.className}`}>
            {badge.label}
          </span>
          {characterName && (
            <span className="text-sm font-bold text-foreground truncate">{characterName}</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          <EventDescription log={log} />
        </p>
      </div>
    </div>
  );
}

// ─── Event Description ─────────────────────────────────────

function EventDescription({ log }: { log: LogData }) {
  const d = log.details;

  switch (log.action) {
    case 'game.broadcast':
    case 'broadcast':
    case 'character_message':
      return (
        <>
          <span className="font-bold text-foreground">{str(d?.title, '廣播')}</span>
          {d?.message ? <span className="text-xs italic ml-1">「{str(d.message)}」</span> : null}
        </>
      );

    case 'game_start':
      return (
        <span>
          遊戲「{str(d?.gameName, '未知')}」已開始
          {d?.characterCount ? `，共 ${str(d.characterCount)} 位角色` : ''}
        </span>
      );

    case 'game_end':
      return <span>遊戲「{str(d?.gameName, '未知')}」已結束</span>;

    case 'item_use':
      return (
        <span>
          使用了物品「{str(d?.itemName, '未知物品')}」
          {d?.targetCharacterName ? `，對象：${str(d.targetCharacterName)}` : ''}
          {renderEffects(d?.effectsApplied)}
        </span>
      );

    case 'skill_use':
      return (
        <span>
          使用了技能「{str(d?.skillName, '未知技能')}」
          {d?.targetCharacterName ? `，對象：${str(d.targetCharacterName)}` : ''}
          {renderEffects(d?.effectsApplied)}
        </span>
      );

    case 'contest_result': {
      const winner = str(d?.winnerCharacterName);
      const loser = str(d?.loserCharacterName);
      const source = str(d?.sourceName);
      return (
        <span>
          {source ? `使用「${source}」` : ''}發起對抗 →{' '}
          {winner} 勝出{loser ? `，${loser} 落敗` : ''}
          {renderEffects(d?.effectsApplied)}
        </span>
      );
    }

    case 'secret_reveal':
      return <span>隱藏資訊「{str(d?.secretTitle)}」已揭露</span>;

    case 'task_reveal':
      return <span>隱藏任務「{str(d?.taskTitle)}」已揭露</span>;

    case 'stat_change': {
      const statName = str(d?.statName, '數值');
      const oldVal = Number(d?.oldValue ?? 0);
      const newVal = Number(d?.newValue ?? 0);
      const hasMaxChange = d?.oldMaxValue !== undefined && d?.newMaxValue !== undefined;
      const reason = d?.reason ? `（${str(d.reason)}）` : '';

      const text = formatStatDeltaText({
        name: statName,
        deltaValue: newVal - oldVal,
        deltaMax: hasMaxChange ? Number(d?.newMaxValue ?? 0) - Number(d?.oldMaxValue ?? 0) : undefined,
        newMax: hasMaxChange ? Number(d?.newMaxValue ?? 0) : undefined,
      });

      return <span>{text ?? `${statName} 無變動`}{reason}</span>;
    }

    case 'gm_update': {
      const fields = formatUpdatedFields(d?.updatedFields);
      return (
        <span>
          GM 更新了{d?.characterName ? `「${str(d.characterName)}」的` : ''}
          {fields || '角色資料'}
        </span>
      );
    }

    case 'effect_expired': {
      const targetStat = str(d?.targetStat, '數值');
      const sourceName = str(d?.sourceName, '效果');

      // 恢復訊息
      let restoredText = '';
      if (d?.statChangeTarget === 'maxValue' && d?.restoredMax !== undefined) {
        restoredText = `${targetStat} 最大值已恢復至 ${str(d.restoredMax)}`;
        if (d?.restoredValue !== undefined) {
          restoredText += `，目前值 ${str(d.restoredValue)}`;
        }
      } else if (d?.restoredValue !== undefined) {
        restoredText = `${targetStat} 已恢復至 ${str(d.restoredValue)}`;
      } else {
        restoredText = `${targetStat} 已恢復`;
      }

      return <span>{sourceName} 的效果已結束，{restoredText}</span>;
    }

    case 'equipment_toggle': {
      const itemName = str(d?.itemName, '裝備');
      const equipped = d?.equipped;
      const boosts = (d?.statBoosts || []) as Array<{ statName: string; value: number; target?: string }>;
      const boostTexts = boosts
        .map((b) => {
          const target = b.target ?? 'value';
          return formatStatDeltaText({
            name: b.statName,
            deltaValue: (target === 'value' || target === 'both') ? b.value : undefined,
            deltaMax: (target === 'maxValue' || target === 'both') ? b.value : undefined,
          });
        })
        .filter(Boolean);
      const boostText = boostTexts.length > 0 ? `（${boostTexts.join('、')}）` : '';
      return <span>{equipped ? '裝備' : '卸除'}了「{itemName}」{boostText}</span>;
    }

    default:
      // 嘗試從 details 中提取有意義的描述
      if (d?.message) return <span>{str(d.message)}</span>;
      if (d?.title) return <span>{str(d.title)}</span>;
      return <span>{log.action}</span>;
  }
}

// ─── Helpers ───────────────────────────────────────────────

/** GM 更新欄位名稱映射 */
const FIELD_LABELS: Record<string, string> = {
  name: '名稱',
  description: '描述',
  imageUrl: '圖片',
  stats: '數值',
  items: '物品',
  skills: '技能',
  tasks: '任務',
  publicInfo: '公開資訊',
  secretInfo: '隱藏資訊',
};

function formatUpdatedFields(fields: unknown): string {
  if (!Array.isArray(fields) || fields.length === 0) return '';
  const labels = fields.map((f) => FIELD_LABELS[String(f)] ?? String(f));
  return labels.join('、');
}

/** 安全轉 string（details 值皆為 unknown） */
function str(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

/** 渲染效果列表摘要 */
function renderEffects(effects: unknown): React.ReactNode {
  if (!Array.isArray(effects) || effects.length === 0) return null;

  // effectsApplied 可能是 string[] 或 object[]
  const messages = effects
    .map((e) => (typeof e === 'string' ? e : typeof e === 'object' && e !== null && 'message' in e ? str((e as Record<string, unknown>).message) : ''))
    .filter(Boolean);

  if (messages.length === 0) return null;
  return <span className="ml-1">（{messages.join('、')}）</span>;
}
