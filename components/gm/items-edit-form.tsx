'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { useFormGuard } from '@/hooks/use-form-guard';
import { AbilityCard } from '@/components/gm/ability-card';
import { DashedAddButton } from '@/components/gm/dashed-add-button';
import { GmEmptyState } from '@/components/gm/gm-empty-state';
import { GM_SECTION_TITLE_CLASS } from '@/lib/styles/gm-form';
import { toast } from 'sonner';
import { Package } from 'lucide-react';
import type { Item, Stat } from '@/types/character';
import type { BaseEvent, RoleUpdatedEvent, InventoryUpdatedEvent, ItemTransferredEvent, SkillContestEvent } from '@/types/event';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import { AbilityEditWizard } from './ability-edit-wizard';
import { getItemEffects } from '@/lib/item/get-item-effects';

interface ItemsEditFormProps {
  characterId: string;
  initialItems: Item[];
  stats: Stat[];
  randomContestMaxValue?: number;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * 道具管理 — 卡片 grid 佈局
 *
 * 不分消耗品 / 裝備，全部混排 grid。
 * 新增卡片排在 grid 第一位。
 * 空狀態使用 GmEmptyState 共用元件。
 */
export function ItemsEditForm({ characterId, initialItems, stats, randomContestMaxValue = 100, onDirtyChange }: ItemsEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
    setDeletedIds(new Set());
  }

  const effectiveItems = useMemo(
    () => items.filter((i) => !deletedIds.has(i.id)),
    [items, deletedIds],
  );

  const { isDirty, resetDirty } = useFormGuard({
    initialData: initialItems,
    currentData: effectiveItems,
  });

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  /** 初始資料查找表 */
  const initialItemsMap = useMemo(() => {
    const map = new Map<string, Item>();
    for (const i of initialItems) map.set(i.id, i);
    return map;
  }, [initialItems]);

  /** 判斷狀態 */
  const getItemStatus = useCallback(
    (item: Item) => {
      if (deletedIds.has(item.id)) return 'deleted' as const;
      const original = initialItemsMap.get(item.id);
      if (!original) return 'new' as const;
      if (JSON.stringify(original) !== JSON.stringify(item)) return 'modified' as const;
      return 'unchanged' as const;
    },
    [initialItemsMap, deletedIds],
  );

  // WebSocket 同步
  useCharacterWebSocket(characterId, (event: BaseEvent) => {
    if (event.type === 'role.updated') {
      const payload = (event as RoleUpdatedEvent).payload;
      if (payload.updates.items) {
        setItems(payload.updates.items as unknown as Item[]);
        toast.info('道具列表已更新', { description: '玩家端的變更已同步' });
      }
    } else if (event.type === 'role.inventoryUpdated') {
      const payload = (event as InventoryUpdatedEvent).payload;
      router.refresh();
      toast.info('道具已更新', {
        description: `道具「${payload.item.name}」${
          payload.action === 'added' ? '已新增' : payload.action === 'updated' ? '已更新' : '已移除'
        }`,
      });
    } else if (event.type === 'item.transferred') {
      const payload = (event as ItemTransferredEvent).payload;
      if (payload.fromCharacterId === characterId || payload.toCharacterId === characterId) {
        router.refresh();
        toast.info('道具已轉移', {
          description:
            payload.fromCharacterId === characterId
              ? `已將 ${payload.quantity} 個「${payload.itemName}」轉移給 ${payload.toCharacterName}`
              : `從 ${payload.fromCharacterName} 收到 ${payload.quantity} 個「${payload.itemName}」`,
        });
      }
    } else if (event.type === 'skill.contest') {
      const payload = (event as SkillContestEvent).payload;
      if ((payload.attackerId === characterId || payload.defenderId === characterId) && payload.result) {
        setTimeout(() => { router.refresh(); }, 500);
      }
    }
  });

  const handleAddItem = useCallback(() => {
    const newItem: Item = {
      id: `item-${Date.now()}`,
      name: '',
      description: '',
      type: 'consumable',
      quantity: 1,
      usageLimit: 1,
      cooldown: 0,
      isTransferable: true,
      acquiredAt: new Date(),
    };
    setEditingItem(newItem);
    setIsWizardOpen(true);
  }, []);

  const handleEditItem = useCallback((item: Item) => {
    const rawEffects = getItemEffects({ ...item });
    const effects = rawEffects.map((effect) =>
      effect.type === 'stat_change' && !effect.statChangeTarget
        ? { ...effect, statChangeTarget: 'value' as const }
        : effect
    );
    setEditingItem({ ...item, effects });
    setIsWizardOpen(true);
  }, []);

  const handleWizardSave = useCallback((savedData: Item) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.id === savedData.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = savedData;
        return updated;
      }
      // 新增：如果數量 > 1，產生多張獨立卡
      const quantity = savedData.quantity || 1;
      if (quantity > 1) {
        const newItems: Item[] = Array.from({ length: quantity }, (_, i) => ({
          ...savedData,
          id: `item-${Date.now()}-${i}`,
          quantity: 1,
          usageCount: 0,
        }));
        toast.success(`已新增 ${quantity} 張「${savedData.name}」道具卡`);
        return [...prev, ...newItems];
      }
      return [...prev, { ...savedData, quantity: 1 }];
    });
    setEditingItem(null);
  }, []);

  const handleSoftDelete = useCallback((itemId: string) => {
    setDeletedIds((prev) => new Set(prev).add(itemId));
  }, []);

  const handleRestore = useCallback((itemId: string) => {
    setDeletedIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  // TODO: 待 StickySaveBar registerSaveHandler 接線後啟用
  const handleSave = async () => {
    setIsLoading(true);
    try {
      const result = await updateCharacter(characterId, { items: effectiveItems });
      if (result.success) {
        toast.success('道具已儲存');
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
  };

  const isNew = editingItem ? !items.find((i) => i.id === editingItem.id) : true;

  return (
    <div className="space-y-6">
      <h2 className={GM_SECTION_TITLE_CLASS}>
        <span className="w-1 h-5 bg-primary rounded-full" />
        道具管理
      </h2>

      {items.length === 0 ? (
        <GmEmptyState
          icon={<Package className="h-10 w-10" />}
          title="尚無道具"
          description="目前這個角色的背包還是空的，快來為他增添一些冒險物資吧。"
          actionLabel="新增第一個道具"
          onAction={handleAddItem}
          disabled={isLoading}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          <DashedAddButton
            label="新增道具"
            onClick={handleAddItem}
            disabled={isLoading}
            variant="card"
            className="min-h-[180px]"
          />

          {items.map((item) => (
            <AbilityCard
              key={item.id}
              ability={item}
              mode="item"
              status={getItemStatus(item)}
              onEdit={() => handleEditItem(item)}
              onRemove={() => handleSoftDelete(item.id)}
              onRestore={() => handleRestore(item.id)}
              disabled={isLoading}
            />
          ))}
        </div>
      )}

      {editingItem && (
        <AbilityEditWizard
          mode="item"
          open={isWizardOpen}
          onOpenChange={setIsWizardOpen}
          initialData={editingItem}
          isNew={isNew}
          stats={stats}
          randomContestMaxValue={randomContestMaxValue}
          onSave={(data) => handleWizardSave(data as Item)}
        />
      )}
    </div>
  );
}
