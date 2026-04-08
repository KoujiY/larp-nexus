'use client';

/**
 * 角色編輯 — Tab 3：隱藏資訊
 *
 * 佈局：12 欄 grid（左 5 列表 + 右 7 詳情）
 * - 左欄：隱藏資訊列表，依揭露狀態顯示不同色彩 Badge
 * - 右欄：選中項目的詳情面板（唯讀），點擊「編輯」開啟 SecretEditDialog
 * - 空狀態：0 條時顯示引導畫面
 *
 * 支援軟刪除（可復原）與狀態 badge（NEW / MODIFIED），
 * 對齊道具 / 技能 / 任務分頁的操作模式。
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { getGameItems } from '@/app/actions/games';
import type { GameItemInfo } from '@/app/actions/games';
import { cleanSecretConditions } from '@/lib/reveal/condition-cleaner';
import { useFormGuard } from '@/hooks/use-form-guard';
import { SecretEditDialog } from '@/components/gm/secret-edit-dialog';
import { DashedAddButton } from '@/components/gm/dashed-add-button';
import { GmEmptyState } from '@/components/gm/gm-empty-state';
import { IconActionButton } from '@/components/gm/icon-action-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EyeOff, MoreHorizontal, Pencil, Trash2, Undo2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  GM_SCROLLBAR_CLASS,
  GM_STATUS_BADGE_BASE,
  GM_ATTR_BADGE_BASE,
  GM_BADGE_VARIANTS,
  GM_DETAIL_HEADER_CLASS,
  GM_ACCENT_CARD_CLASS,
} from '@/lib/styles/gm-form';
import { toast } from 'sonner';
import type { CharacterData, Secret } from '@/types/character';
import { normalizeSecretContent } from '@/types/character';
import type { RegisterSaveHandler, RegisterDiscardHandler, SaveHandlerOptions } from '@/types/gm-edit';

type SecretStatus = 'unchanged' | 'new' | 'modified' | 'deleted';

interface SecretsTabProps {
  character: CharacterData;
  gameId: string;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: RegisterSaveHandler;
  onRegisterDiscard?: RegisterDiscardHandler;
}

/**
 * Tab 3：隱藏資訊（列表 + 詳情面板）
 */
export function SecretsTab({ character, gameId, onDirtyChange, onRegisterSave, onRegisterDiscard }: SecretsTabProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [availableItems, setAvailableItems] = useState<GameItemInfo[]>([]);

  // Dialog 狀態
  const [editingSecretIndex, setEditingSecretIndex] = useState<number | null>(null);
  const [isSecretDialogOpen, setIsSecretDialogOpen] = useState(false);

  // 選中索引（列表中高亮的項目）
  const [selectedIdx, setSelectedIdx] = useState<number | undefined>(undefined);

  // 軟刪除
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const initialSecrets = useMemo(
    () => (character.secretInfo?.secrets || []) as Secret[],
    [character],
  );

  const [secrets, setSecrets] = useState<Secret[]>(initialSecrets);
  const [prevInitialSecrets, setPrevInitialSecrets] = useState(initialSecrets);

  if (initialSecrets !== prevInitialSecrets) {
    setPrevInitialSecrets(initialSecrets);
    setSecrets(initialSecrets);
    setDeletedIds(new Set());
  }

  /** 排除軟刪除的有效 secrets */
  const effectiveSecrets = useMemo(
    () => secrets.filter((s) => !deletedIds.has(s.id)),
    [secrets, deletedIds],
  );

  const { isDirty, resetDirty } = useFormGuard({
    initialData: initialSecrets,
    currentData: effectiveSecrets,
  });

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  /** 初始資料查找表 */
  const initialSecretsMap = useMemo(() => {
    const map = new Map<string, Secret>();
    for (const s of initialSecrets) map.set(s.id, s);
    return map;
  }, [initialSecrets]);

  /** 判斷狀態 */
  const getSecretStatus = useCallback(
    (secret: Secret): SecretStatus => {
      if (deletedIds.has(secret.id)) return 'deleted';
      const original = initialSecretsMap.get(secret.id);
      if (!original) return 'new';
      if (JSON.stringify(original) !== JSON.stringify(secret)) return 'modified';
      return 'unchanged';
    },
    [initialSecretsMap, deletedIds],
  );

  // 自動選中第一項
  useEffect(() => {
    if (selectedIdx === undefined && secrets.length > 0) {
      setSelectedIdx(0);
    }
  }, [selectedIdx, secrets.length]);

  // 載入道具列表（用於自動揭露條件）
  useEffect(() => {
    getGameItems(gameId).then((result) => {
      if (result.success && result.data) {
        setAvailableItems(result.data);
      }
    }).catch((error) => {
      console.error('Failed to load game items:', error);
    });
  }, [gameId]);

  // 道具載入後清理失效的揭露條件引用
  useEffect(() => {
    if (availableItems.length === 0) return;
    const existingItemIds = availableItems.map((item) => item.itemId);
    const { secrets: cleanedSecrets, result } = cleanSecretConditions(
      secrets,
      existingItemIds,
    );
    if (result.cleaned) {
      setSecrets(cleanedSecrets);
      toast.info(`已自動清理 ${result.removedCount} 個失效的揭露條件引用`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableItems]);

  const selectedSecret = selectedIdx !== undefined ? secrets[selectedIdx] : undefined;

  // ── Secret CRUD ──

  const addSecret = useCallback(() => {
    const newId = `secret-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const newSecret: Secret = {
      id: newId,
      title: '',
      content: '',
      isRevealed: false,
      revealCondition: '',
    };
    setSecrets((prev) => [...prev, newSecret]);
    const newIdx = secrets.length;
    setEditingSecretIndex(newIdx);
    setIsSecretDialogOpen(true);
    setSelectedIdx(newIdx);
  }, [secrets.length]);

  const handleSoftDelete = useCallback((index: number) => {
    const secret = secrets[index];
    if (!secret) return;
    setDeletedIds((prev) => new Set(prev).add(secret.id));
  }, [secrets]);

  const handleRestore = useCallback((index: number) => {
    const secret = secrets[index];
    if (!secret) return;
    setDeletedIds((prev) => {
      const next = new Set(prev);
      next.delete(secret.id);
      return next;
    });
  }, [secrets]);

  const handleSaveSecret = useCallback((updatedSecret: Secret) => {
    if (editingSecretIndex === null) return;
    setSecrets((prev) => {
      const newSecrets = [...prev];
      newSecrets[editingSecretIndex] = updatedSecret;
      return newSecrets;
    });
  }, [editingSecretIndex]);

  // ── Save / Discard ──

  const save = useCallback(async (options?: SaveHandlerOptions) => {
    setIsLoading(true);

    try {
      const result = await updateCharacter(character.id, {
        secretInfo: {
          secrets: effectiveSecrets.map((secret) => ({
            id: secret.id,
            title: secret.title,
            content: secret.content,
            isRevealed: secret.isRevealed,
            revealCondition: secret.revealCondition || '',
            autoRevealCondition: secret.autoRevealCondition,
          })),
        },
      });

      if (result.success) {
        if (!options?.silent) toast.success('隱藏資訊已儲存');
        resetDirty();
        router.refresh();
      } else {
        toast.error(result.message || '更新失敗');
      }
    } catch (err) {
      console.error('Error updating secrets:', err);
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  }, [character.id, effectiveSecrets, resetDirty, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save();
  };

  const discard = useCallback(() => {
    setSecrets(initialSecrets);
    setDeletedIds(new Set());
    setEditingSecretIndex(null);
    setSelectedIdx(undefined);
  }, [initialSecrets]);

  useEffect(() => { onRegisterSave?.(save); }, [onRegisterSave, save]);
  useEffect(() => { onRegisterDiscard?.(discard); }, [onRegisterDiscard, discard]);

  // ── 空狀態 ──
  if (secrets.length === 0) {
    return (
      <form onSubmit={handleSubmit}>
        <GmEmptyState
          icon={<EyeOff className="h-10 w-10" />}
          title="尚未新增隱藏資訊"
          description="當角色擁有只有 GM 與特定玩家知道的祕密時，可以在這裡建立內容。"
          actionLabel="新增第一條隱藏資訊"
          onAction={addSecret}
          disabled={isLoading}
        />

        {/* Dialog（新增時開啟） */}
        <SecretEditDialog
          open={isSecretDialogOpen}
          onOpenChange={(open) => {
            setIsSecretDialogOpen(open);
            if (!open) setEditingSecretIndex(null);
          }}
          secret={editingSecretIndex !== null ? secrets[editingSecretIndex] ?? null : null}
          onSave={handleSaveSecret}
          availableItems={availableItems}
          disabled={isLoading}
        />
      </form>
    );
  }

  // ── 正常佈局：列表 + 詳情 ──
  return (
    <form onSubmit={handleSubmit} className="h-full">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full min-h-0">
        {/* ── 左欄：列表 ── */}
        <div className={cn('lg:col-span-5 lg:overflow-y-auto lg:overflow-x-hidden flex flex-col gap-3 lg:py-1 lg:px-1', GM_SCROLLBAR_CLASS)}>
          {secrets.map((secret, index) => (
            <SecretListItem
              key={secret.id}
              secret={secret}
              status={getSecretStatus(secret)}
              isSelected={selectedIdx === index}
              onClick={() => setSelectedIdx(index)}
              onEdit={() => {
                setEditingSecretIndex(index);
                setIsSecretDialogOpen(true);
              }}
              onDelete={() => handleSoftDelete(index)}
              onRestore={() => handleRestore(index)}
              disabled={isLoading}
            />
          ))}

          <DashedAddButton
            label="新增隱藏資訊"
            onClick={addSecret}
            disabled={isLoading}
            className="py-5 mt-1"
          />
        </div>

        {/* ── 右欄：詳情面板 ── */}
        <div className="lg:col-span-7 lg:min-h-0">
          {selectedSecret ? (
            <SecretDetailPanel
              secret={selectedSecret}
              status={getSecretStatus(selectedSecret)}
              availableItems={availableItems}
              allSecrets={secrets}
              onEdit={() => {
                if (selectedIdx === undefined) return;
                setEditingSecretIndex(selectedIdx);
                setIsSecretDialogOpen(true);
              }}
              onDelete={() => {
                if (selectedIdx !== undefined) handleSoftDelete(selectedIdx);
              }}
              onRestore={() => {
                if (selectedIdx !== undefined) handleRestore(selectedIdx);
              }}
              disabled={isLoading}
            />
          ) : (
            <div className="bg-card rounded-2xl border border-border/10 p-12 text-center text-muted-foreground/50 text-sm">
              選擇一條隱藏資訊以查看詳情
            </div>
          )}
        </div>
      </div>

      {/* SecretEditDialog */}
      <SecretEditDialog
        open={isSecretDialogOpen}
        onOpenChange={(open) => {
          setIsSecretDialogOpen(open);
          if (!open) setEditingSecretIndex(null);
        }}
        secret={editingSecretIndex !== null ? secrets[editingSecretIndex] ?? null : null}
        onSave={handleSaveSecret}
        availableItems={availableItems}
        disabled={isLoading}
      />
    </form>
  );
}

// ─── Secret List Item ──────────────────────────

function SecretListItem({
  secret,
  status,
  isSelected,
  onClick,
  onEdit,
  onDelete,
  onRestore,
  disabled,
}: {
  secret: Secret;
  status: SecretStatus;
  isSelected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  disabled: boolean;
}) {
  const isDeleted = status === 'deleted';

  return (
    <div
      onClick={onClick}
      className={cn(
        'group bg-card rounded-xl p-4 shadow-sm border-2 transition-all cursor-pointer',
        // 狀態樣式（對齊 AbilityCard / StatCard）
        isDeleted && 'opacity-60 bg-muted/30',
        !isDeleted && status === 'modified' && 'bg-primary/5',
        // 選中邊框
        isSelected
          ? 'border-primary'
          : 'border-transparent hover:border-primary/20',
      )}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* 狀態 badge (NEW / MODIFIED) */}
            {(status === 'new' || status === 'modified') && !isDeleted && (
              <span className={cn(
                GM_STATUS_BADGE_BASE,
                'shrink-0',
                status === 'new' ? GM_BADGE_VARIANTS['primary-solid'] : GM_BADGE_VARIANTS.primary,
              )}>
                {status === 'new' ? 'NEW' : 'MODIFIED'}
              </span>
            )}
            {/* 揭露狀態 badge */}
            {!isDeleted && (
              <span className={cn(
                GM_STATUS_BADGE_BASE,
                'shrink-0',
                secret.isRevealed
                  ? GM_BADGE_VARIANTS.success
                  : GM_BADGE_VARIANTS.secondary,
              )}>
                {secret.isRevealed ? '已揭露' : '未揭露'}
              </span>
            )}
            <span className={cn(
              'font-bold text-sm truncate',
              isDeleted && 'text-muted-foreground/50 line-through',
            )}>
              {secret.title || '未命名隱藏資訊'}
            </span>
          </div>
          {/* 操作按鈕 */}
          <div className="flex gap-0.5 mt-2">
            {isDeleted ? (
              <IconActionButton
                icon={<Undo2 className="h-4 w-4" />}
                label="復原"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onRestore(); }}
                disabled={disabled}
              />
            ) : (
              <>
                <IconActionButton
                  icon={<Pencil className="h-4 w-4" />}
                  label="編輯"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  disabled={disabled}
                />
                <IconActionButton
                  icon={<Trash2 className="h-4 w-4" />}
                  label="刪除"
                  size="sm"
                  variant="destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  disabled={disabled}
                />
              </>
            )}
          </div>
        </div>
        {/* 選中指示 */}
        <ChevronRight className={cn(
          'h-5 w-5 shrink-0 transition-colors mt-1',
          isSelected ? 'text-primary' : 'text-muted-foreground/20',
        )} />
      </div>
    </div>
  );
}

// ─── Secret Detail Panel ───────────────────────

function SecretDetailPanel({
  secret,
  status,
  availableItems,
  allSecrets,
  onEdit,
  onDelete,
  onRestore,
  disabled,
}: {
  secret: Secret;
  status: SecretStatus;
  availableItems: GameItemInfo[];
  allSecrets: Secret[];
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  disabled: boolean;
}) {
  const isDeleted = status === 'deleted';
  const paragraphs = normalizeSecretContent(secret.content);

  const hasAutoCondition =
    secret.autoRevealCondition && secret.autoRevealCondition.type !== 'none';

  /** 自動揭露條件類型標籤 */
  const conditionTypeLabels: Record<string, string> = {
    items_viewed: '檢視物品',
    items_acquired: '取得物品',
    secrets_revealed: '隱藏資訊揭露',
  };

  return (
    <div className={cn(
      'bg-card rounded-2xl border border-border/10 shadow-sm overflow-hidden flex flex-col lg:max-h-full',
      isDeleted && 'opacity-60 bg-muted/30',
      !isDeleted && status === 'modified' && 'bg-primary/5 border-primary/20',
      !isDeleted && status === 'new' && 'border-primary/20',
    )}>
      {/* Header */}
      <div className="p-8 border-b border-border/30 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] shrink-0">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-3">
              {/* 狀態 badge */}
              {(status === 'new' || status === 'modified') && !isDeleted && (
                <span className={cn(
                  GM_STATUS_BADGE_BASE,
                  status === 'new' ? GM_BADGE_VARIANTS['primary-solid'] : GM_BADGE_VARIANTS.primary,
                )}>
                  {status === 'new' ? 'NEW' : 'MODIFIED'}
                </span>
              )}
              {/* 揭露狀態 badge */}
              <span className={cn(
                GM_STATUS_BADGE_BASE,
                secret.isRevealed
                  ? GM_BADGE_VARIANTS.success
                  : GM_BADGE_VARIANTS.secondary,
              )}>
                {secret.isRevealed ? '已揭露' : '未揭露'}
              </span>
            </div>
            <h2 className={cn(
              'text-2xl font-extrabold tracking-tight',
              isDeleted && 'text-muted-foreground/50 line-through',
            )}>
              {secret.title || '未命名隱藏資訊'}
            </h2>
          </div>
          {/* 操作按鈕 */}
          {isDeleted ? (
            <IconActionButton
              icon={<Undo2 className="h-5 w-5" />}
              label="復原"
              size="sm"
              onClick={onRestore}
              disabled={disabled}
            />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  className="cursor-pointer p-2 rounded-xl hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
                  <Pencil />
                  編輯
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onDelete} className="cursor-pointer">
                  <Trash2 />
                  刪除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* 揭露條件 — 左側邊線卡片 */}
        {!isDeleted && (secret.revealCondition || hasAutoCondition) && (
          <div className="mt-5 space-y-3">
            {secret.revealCondition && (
              <div className="space-y-1.5">
                <h4 className={GM_DETAIL_HEADER_CLASS}>GM 備註</h4>
                <div className={GM_ACCENT_CARD_CLASS}>
                  <p className="text-xs text-foreground/90">{secret.revealCondition}</p>
                </div>
              </div>
            )}

            {hasAutoCondition && (
              <div className="space-y-1.5">
                <h4 className={GM_DETAIL_HEADER_CLASS}>揭露條件</h4>
                <div className={cn(GM_ACCENT_CARD_CLASS, 'space-y-1.5')}>
                  <p className="text-xs font-medium text-foreground">
                    <span className="text-muted-foreground">自動揭露：</span>
                    {conditionTypeLabels[secret.autoRevealCondition!.type] ?? secret.autoRevealCondition!.type}
                  </p>
                  {secret.autoRevealCondition!.matchLogic && (
                    <p className="text-xs text-foreground/90">
                      <span className="text-muted-foreground">邏輯：</span>
                      {secret.autoRevealCondition!.matchLogic === 'and' ? '全部符合' : '任一符合'}
                    </p>
                  )}
                  {secret.autoRevealCondition!.itemIds && secret.autoRevealCondition!.itemIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {secret.autoRevealCondition!.itemIds.map((itemId) => {
                        const item = availableItems.find((i) => i.itemId === itemId);
                        return (
                          <span key={itemId} className={cn(GM_ATTR_BADGE_BASE, GM_BADGE_VARIANTS.muted)}>
                            {item ? `${item.characterName}：${item.itemName}` : itemId}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {secret.autoRevealCondition!.secretIds && secret.autoRevealCondition!.secretIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {secret.autoRevealCondition!.secretIds.map((secretId) => {
                        const target = allSecrets.find((s) => s.id === secretId);
                        return (
                          <span key={secretId} className={cn(GM_ATTR_BADGE_BASE, GM_BADGE_VARIANTS.muted)}>
                            {target ? target.title : secretId}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 內容 */}
      <div className={cn('p-8 flex-1 lg:overflow-y-auto lg:min-h-0', GM_SCROLLBAR_CLASS)}>
        {isDeleted ? (
          <p className="text-sm text-muted-foreground/40 italic">此隱藏資訊已標記刪除，儲存後將被移除。</p>
        ) : (
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            {paragraphs.map((p, i) => (
              <p key={i}>{p || <span className="italic text-muted-foreground/40">（空段落）</span>}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
