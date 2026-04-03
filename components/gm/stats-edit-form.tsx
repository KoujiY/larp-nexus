'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { useFormGuard } from '@/hooks/use-form-guard';
import { DashedAddButton } from '@/components/gm/dashed-add-button';
import { IconActionButton } from '@/components/gm/icon-action-button';
import { GmEmptyState } from '@/components/gm/gm-empty-state';
import { Trash2, BarChart3, Pencil, Check, Undo2, X, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GM_SECTION_TITLE_CLASS, GM_STATUS_BADGE_BASE, GM_BADGE_VARIANTS } from '@/lib/styles/gm-form';
import { toast } from 'sonner';
import type { Stat } from '@/types/character';
import type { RegisterSaveHandler, RegisterDiscardHandler, SaveHandlerOptions } from '@/types/gm-edit';

interface StatsEditFormProps {
  characterId: string;
  initialStats: Stat[];
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: RegisterSaveHandler;
  onRegisterDiscard?: RegisterDiscardHandler;
}

type StatStatus = 'unchanged' | 'new' | 'modified' | 'deleted';

/**
 * 角色數值編輯 — 卡片 grid 佈局
 *
 * 每個 stat 為獨立卡片，居中顯示數值。
 * 有 maxValue 時顯示 `/ max` 與百分比水印。
 * 支援檢視 / 編輯模式切換、軟刪除（可復原）、狀態 badge。
 */
export function StatsEditForm({ characterId, initialStats, onDirtyChange, onRegisterSave, onRegisterDiscard }: StatsEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<Stat[]>(initialStats);
  const [prevInitialStats, setPrevInitialStats] = useState(initialStats);
  /** 軟刪除的 stat id 集合 */
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  if (initialStats !== prevInitialStats) {
    setPrevInitialStats(initialStats);
    setStats(initialStats);
    setDeletedIds(new Set());
  }

  /** 取得實際生效的 stats（排除軟刪除） */
  const effectiveStats = useMemo(
    () => stats.filter((s) => !deletedIds.has(s.id)),
    [stats, deletedIds],
  );

  const { isDirty, resetDirty } = useFormGuard({
    initialData: initialStats,
    currentData: effectiveStats,
  });

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  /** 建立 initialStats 的 id → stat 查找表，用於判斷狀態 */
  const initialStatsMap = useMemo(() => {
    const map = new Map<string, Stat>();
    for (const s of initialStats) map.set(s.id, s);
    return map;
  }, [initialStats]);

  /** 判斷單一 stat 的狀態 */
  const getStatStatus = useCallback(
    (stat: Stat): StatStatus => {
      if (deletedIds.has(stat.id)) return 'deleted';
      const original = initialStatsMap.get(stat.id);
      if (!original) return 'new';
      if (
        original.name !== stat.name ||
        original.value !== stat.value ||
        original.maxValue !== stat.maxValue
      ) {
        return 'modified';
      }
      return 'unchanged';
    },
    [initialStatsMap, deletedIds],
  );

  const handleAddStat = useCallback(() => {
    const newStat: Stat = {
      id: `stat-${Date.now()}`,
      name: '',
      value: 0,
      maxValue: undefined,
    };
    setStats((prev) => [...prev, newStat]);
  }, []);

  /** 軟刪除 — 標記為已刪除但保留資料 */
  const handleSoftDelete = useCallback((statId: string) => {
    setDeletedIds((prev) => new Set(prev).add(statId));
  }, []);

  /** 硬刪除 — 直接從陣列移除（用於取消新增） */
  const handleHardRemove = useCallback((statId: string) => {
    setStats((prev) => prev.filter((s) => s.id !== statId));
  }, []);

  /** 復原軟刪除 */
  const handleRestore = useCallback((statId: string) => {
    setDeletedIds((prev) => {
      const next = new Set(prev);
      next.delete(statId);
      return next;
    });
  }, []);

  const handleStatChange = useCallback(
    (statId: string, field: keyof Stat, value: string | number | undefined) => {
      setStats((prev) =>
        prev.map((s) => {
          if (s.id !== statId) return s;
          if (field === 'value' || field === 'maxValue') {
            const numValue = value === '' || value === undefined ? undefined : Number(value);
            return { ...s, [field]: field === 'value' ? (numValue ?? 0) : numValue };
          }
          return { ...s, [field]: value };
        }),
      );
    },
    [],
  );

  const save = useCallback(async (options?: SaveHandlerOptions) => {
    const activeStats = effectiveStats;
    const invalidStats = activeStats.filter((s) => !s.name.trim());
    if (invalidStats.length > 0) {
      toast.error('所有數值欄位都需要名稱');
      return;
    }

    setIsLoading(true);
    try {
      const result = await updateCharacter(characterId, { stats: activeStats });
      if (result.success) {
        if (!options?.silent) toast.success('數值已儲存');
        resetDirty();
        router.refresh();
      } else {
        toast.error(result.message || '儲存失敗');
      }
    } catch {
      toast.error('儲存時發生錯誤');
    } finally {
      setIsLoading(false);
    }
  }, [characterId, effectiveStats, resetDirty, router]);

  const discard = useCallback(() => {
    setStats(initialStats);
    setDeletedIds(new Set());
  }, [initialStats]);

  useEffect(() => { onRegisterSave?.(save); }, [onRegisterSave, save]);
  useEffect(() => { onRegisterDiscard?.(discard); }, [onRegisterDiscard, discard]);

  /** 所有可見 stats（含軟刪除的） */
  const visibleStats = stats;

  if (visibleStats.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          角色數值
        </h2>
        <GmEmptyState
          icon={<BarChart3 className="h-10 w-10" />}
          title="尚未定義任何數值"
          description="定義角色的屬性數值，如血量、魔力、力量等。"
          actionLabel="新增第一個數值"
          onAction={handleAddStat}
          disabled={isLoading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className={GM_SECTION_TITLE_CLASS}>
        <span className="w-1 h-5 bg-primary rounded-full" />
        角色數值
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* 新增卡片（第一位） */}
        <DashedAddButton
          label="新增數值"
          onClick={handleAddStat}
          disabled={isLoading}
          variant="card"
          className="min-h-[160px]"
        />

        {/* Stat 卡片 */}
        {visibleStats.map((stat) => (
          <StatCard
            key={stat.id}
            stat={stat}
            status={getStatStatus(stat)}
            onChange={handleStatChange}
            onDelete={handleSoftDelete}
            onHardRemove={handleHardRemove}
            onRestore={handleRestore}
            disabled={isLoading}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Status Badge ──────────────────────────────────

const STATUS_BADGE_CONFIG: Record<'new' | 'modified', { label: string; variant: keyof typeof GM_BADGE_VARIANTS }> = {
  new: { label: 'NEW', variant: 'primary-solid' },
  modified: { label: 'MODIFIED', variant: 'primary' },
};

// ─── Stat Card ──────────────────────────────────

interface StatCardProps {
  stat: Stat;
  status: StatStatus;
  onChange: (id: string, field: keyof Stat, value: string | number | undefined) => void;
  onDelete: (id: string) => void;
  onHardRemove: (id: string) => void;
  onRestore: (id: string) => void;
  disabled?: boolean;
}

/**
 * 單一數值卡片
 *
 * 支援檢視 / 編輯模式、軟刪除（灰色 + 復原按鈕）、狀態 badge。
 * 居中顯示：名稱（上）+ 數值（中）+ maxValue（右側）。
 * 有 maxValue 時左下角顯示百分比水印。
 *
 * 編輯模式：input 帶有可見邊框背景，右上角按鈕為「完成 / 取消」。
 * 檢視模式：純文字展示，右上角按鈕為「編輯 / 刪除」。
 */
function StatCard({ stat, status, onChange, onDelete, onHardRemove, onRestore, disabled }: StatCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  /** 編輯中的本地暫存，確認後才推給父層 */
  const [draft, setDraft] = useState<Stat | null>(null);
  const isDeleted = status === 'deleted';

  /** 顯示用的資料：編輯中用 draft，否則用 prop */
  const displayStat = draft ?? stat;
  const hasMax = displayStat.maxValue !== undefined && displayStat.maxValue !== null;
  const percent = hasMax && displayStat.maxValue! > 0
    ? Math.round((displayStat.value / displayStat.maxValue!) * 100)
    : undefined;

  /** 新增的 stat 自動進入編輯模式 */
  useEffect(() => {
    if (status === 'new' && !stat.name) {
      setIsEditing(true);
      setDraft({ ...stat });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** 更新 draft 的某個欄位 */
  const updateDraft = useCallback(
    (field: keyof Stat, value: string | number | undefined) => {
      setDraft((prev) => {
        if (!prev) return prev;
        if (field === 'value' || field === 'maxValue') {
          const numValue = value === '' || value === undefined ? undefined : Number(value);
          return { ...prev, [field]: field === 'value' ? (numValue ?? 0) : numValue };
        }
        return { ...prev, [field]: value };
      });
    },
    [],
  );

  /** 開始編輯 — 複製到 draft */
  const startEditing = useCallback(() => {
    setDraft({ ...stat });
    setIsEditing(true);
  }, [stat]);

  /** 完成編輯 — 將 draft 推給父層 */
  const confirmEdit = useCallback(() => {
    if (draft) {
      onChange(draft.id, 'name', draft.name);
      onChange(draft.id, 'value', draft.value);
      onChange(draft.id, 'maxValue', draft.maxValue);
    }
    setDraft(null);
    setIsEditing(false);
  }, [draft, onChange]);

  /** 取消編輯 — 新增的 stat 直接移除，既有的丟棄 draft */
  const cancelEdit = useCallback(() => {
    if (status === 'new') {
      onHardRemove(stat.id);
      return;
    }
    setDraft(null);
    setIsEditing(false);
  }, [status, stat.id, onHardRemove]);

  /** 切換 maxValue 有無 */
  const toggleMaxValue = useCallback(() => {
    if (hasMax) {
      updateDraft('maxValue', undefined);
    } else {
      updateDraft('maxValue', 100);
    }
  }, [hasMax, updateDraft]);

  /** 編輯模式 input 共用樣式 */
  const editInputClass = 'bg-muted/30 border border-border/30 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40';

  return (
    <div
      className={cn(
        'relative bg-card rounded-2xl border border-border/10 shadow-sm',
        'p-6 flex flex-col items-center justify-center text-center',
        'transition-all min-h-[160px] overflow-hidden',
        isDeleted && 'opacity-60 bg-muted/30',
        !isDeleted && 'hover:shadow-md',
        isEditing && !isDeleted && 'ring-1 ring-primary/30 border-primary/20',
        status === 'modified' && !isDeleted && !isEditing && 'bg-primary/5 border-primary/20',
      )}
    >
      {/* 狀態 badge（左上角） */}
      {(status === 'new' || status === 'modified') && (
        <div className="absolute top-4 left-4">
          <span className={cn(
            GM_STATUS_BADGE_BASE,
            GM_BADGE_VARIANTS[STATUS_BADGE_CONFIG[status].variant],
          )}>
            {STATUS_BADGE_CONFIG[status].label}
          </span>
        </div>
      )}

      {/* 操作按鈕（右上角，常時可見） */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        {isDeleted ? (
          <IconActionButton
            icon={<Undo2 className="h-4 w-4" />}
            label="復原"
            size="sm"
            onClick={() => onRestore(stat.id)}
            disabled={disabled}
          />
        ) : isEditing ? (
          <>
            <IconActionButton
              icon={<Check className="h-4 w-4" />}
              label="完成編輯"
              size="sm"
              onClick={confirmEdit}
              disabled={disabled}
            />
            <IconActionButton
              icon={<X className="h-4 w-4" />}
              label="取消編輯"
              variant="destructive"
              size="sm"
              onClick={cancelEdit}
              disabled={disabled}
            />
          </>
        ) : (
          <>
            <IconActionButton
              icon={<Pencil className="h-4 w-4" />}
              label="編輯"
              size="sm"
              onClick={startEditing}
              disabled={disabled}
            />
            <IconActionButton
              icon={<Trash2 className="h-4 w-4" />}
              label="刪除"
              variant="destructive"
              size="sm"
              onClick={() => onDelete(stat.id)}
              disabled={disabled}
            />
          </>
        )}
      </div>

      {/* 名稱 */}
      {isEditing && !isDeleted ? (
        <input
          type="text"
          value={displayStat.name}
          onChange={(e) => updateDraft('name', e.target.value)}
          placeholder="數值名稱"
          disabled={disabled}
          className={cn(
            editInputClass,
            'text-center w-full max-w-[160px]',
            'text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground',
            'mb-2',
            'placeholder:text-muted-foreground/30',
          )}
          autoFocus
        />
      ) : (
        <p className={cn(
          'text-xs font-extrabold uppercase tracking-[0.2em] mb-1',
          isDeleted ? 'text-muted-foreground/50 line-through' : 'text-muted-foreground',
        )}>
          {displayStat.name || '未命名'}
        </p>
      )}

      {/* 數值 + maxValue */}
      <div className="flex items-baseline justify-center w-full">
        {isEditing && !isDeleted ? (
          <input
            type="number"
            value={displayStat.value}
            onChange={(e) => updateDraft('value', e.target.value)}
            disabled={disabled}
            className={cn(
              editInputClass,
              'text-center text-5xl font-black text-primary',
              'w-[80px] sm:w-[100px]',
              '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
            )}
          />
        ) : (
          <span className={cn(
            'text-6xl font-black',
            isDeleted ? 'text-muted-foreground/30' : 'text-primary',
          )}>
            {displayStat.value}
          </span>
        )}
        {hasMax && (
          <span className={cn(
            'text-xl font-bold ml-1 translate-y-[-4px]',
            isDeleted ? 'text-muted-foreground/20' : 'text-muted-foreground/50',
          )}>
            /
            {isEditing && !isDeleted ? (
              <input
                type="number"
                value={displayStat.maxValue ?? ''}
                onChange={(e) =>
                  updateDraft('maxValue', e.target.value === '' ? undefined : e.target.value)
                }
                disabled={disabled}
                placeholder="上限"
                className={cn(
                  editInputClass,
                  'text-center text-lg font-bold text-muted-foreground/50',
                  'w-[50px] sm:w-[60px] ml-1',
                  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                )}
              />
            ) : (
              <span> {displayStat.maxValue}</span>
            )}
          </span>
        )}
      </div>

      {/* maxValue 切換按鈕（編輯模式才顯示） */}
      {isEditing && !isDeleted && (
        <button
          type="button"
          onClick={toggleMaxValue}
          className="mt-2 flex items-center gap-1 text-[10px] font-bold text-muted-foreground/50 hover:text-primary transition-colors cursor-pointer uppercase tracking-wider"
        >
          {hasMax ? (
            <>
              <Minus className="h-3 w-3" />
              移除上限
            </>
          ) : (
            <>
              <Plus className="h-3 w-3" />
              設定上限
            </>
          )}
        </button>
      )}

      {/* 百分比水印（左下角） */}
      {percent !== undefined && (
        <div className={cn(
          'absolute bottom-2 left-6 text-5xl font-black pointer-events-none select-none flex items-baseline',
          isDeleted ? 'text-foreground/3' : 'text-foreground/5',
        )}>
          {percent}
          <span className="text-2xl ml-0.5">%</span>
        </div>
      )}
    </div>
  );
}
