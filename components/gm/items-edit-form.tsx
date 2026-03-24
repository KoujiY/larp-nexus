'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { useFormGuard } from '@/hooks/use-form-guard';
import { SaveButton } from '@/components/gm/save-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Package, Pencil, Zap, Clock } from 'lucide-react';
import type { Item, ItemEffect, Stat } from '@/types/character';
import type { BaseEvent, RoleUpdatedEvent, InventoryUpdatedEvent, ItemTransferredEvent, SkillContestEvent } from '@/types/event';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import { EffectEditor } from './effect-editor';
import { getItemEffects, hasItemEffects } from '@/lib/item/get-item-effects';
import { EditFormCard } from './edit-form-card';
import { CheckConfigSection } from './check-config-section';
import { UsageLimitSection } from './usage-limit-section';
import { TagsSection } from './tags-section';
import { validateCheckConfig, type CheckType } from '@/lib/utils/check-config-validators';
import { normalizeCheckConfig } from '@/lib/utils/check-config-normalizers';

interface ItemsEditFormProps {
  characterId: string;
  initialItems: Item[];
  stats: Stat[];
  randomContestMaxValue?: number;
  onDirtyChange?: (dirty: boolean) => void;
}

export function ItemsEditForm({ characterId, initialItems, stats, randomContestMaxValue = 100, onDirtyChange }: ItemsEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  /** 當 initialItems props 變化時（例如 router.refresh() 後），同步更新本地 state */
  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }

  const { isDirty, resetDirty } = useFormGuard({
    initialData: initialItems,
    currentData: items,
  });

  /** 回報 dirty 狀態給父層（用於 tab 切換攔截） */
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // Phase 9: 訂閱 WebSocket 事件，同步更新道具列表
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

  // 新增道具
  const handleAddItem = () => {
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
    setIsDialogOpen(true);
  };

  // 編輯道具
  const handleEditItem = (item: Item) => {
    const rawEffects = getItemEffects({ ...item });
    const effects = rawEffects.map((effect) =>
      effect.type === 'stat_change' && !effect.statChangeTarget
        ? { ...effect, statChangeTarget: 'value' as const }
        : effect
    );
    const fixedItem: Item = { ...item, effects };
    setEditingItem(fixedItem);
    setIsDialogOpen(true);
  };

  // 儲存道具（新增或編輯）
  const handleSaveItem = () => {
    if (!editingItem) return;

    if (!editingItem.name.trim()) {
      toast.error('道具名稱不可為空');
      return;
    }

    // 驗證檢定設定
    const validation = validateCheckConfig(
      (editingItem.checkType || 'none') as CheckType,
      editingItem.contestConfig,
      editingItem.randomConfig,
    );
    if (!validation.valid) {
      toast.error(validation.errorMessage);
      return;
    }

    // 正規化檢定設定並建構最終道具
    const configPatch = normalizeCheckConfig(
      (editingItem.checkType || 'none') as CheckType,
      editingItem.contestConfig,
      editingItem.randomConfig,
    );
    const finalItem: Item = {
      ...editingItem,
      effects: getItemEffects(editingItem),
      ...configPatch,
    };

    const existingIndex = items.findIndex((i) => i.id === finalItem.id);
    if (existingIndex >= 0) {
      // 編輯現有道具（數量改變時不分割，僅更新）
      const updatedItems = [...items];
      updatedItems[existingIndex] = finalItem;
      setItems(updatedItems);
    } else {
      // 新增道具：如果數量 > 1，產生多張獨立的道具卡
      const quantity = finalItem.quantity || 1;
      if (quantity > 1) {
        const newItems: Item[] = Array.from({ length: quantity }, (_, i) => ({
          ...editingItem,
          id: `item-${Date.now()}-${i}`,
          quantity: 1,
          usageCount: 0,
        }));
        setItems([...items, ...newItems]);
        toast.success(`已新增 ${quantity} 張「${finalItem.name}」道具卡`);
      } else {
        setItems([...items, { ...finalItem, quantity: 1 }]);
      }
    }

    setIsDialogOpen(false);
    setEditingItem(null);
  };

  // 刪除道具
  const handleRemoveItem = (itemId: string) => {
    setItems(items.filter((i) => i.id !== itemId));
  };

  // 儲存所有變更
  const handleSave = async () => {
    setIsLoading(true);
    try {
      const result = await updateCharacter(characterId, { items });
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

  // 分類道具
  const consumables = items.filter((i) => i.type === 'consumable');
  const equipment = items.filter((i) => i.type === 'equipment');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>🎒 道具管理</CardTitle>
            <CardDescription>管理角色的道具，設定效果與使用限制</CardDescription>
          </div>
          <SaveButton isDirty={isDirty} isLoading={isLoading} type="button" onClick={handleSave} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 消耗品 */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Zap className="h-4 w-4" />
            消耗品 ({consumables.length})
          </h4>
          {consumables.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed rounded-lg text-muted-foreground">
              尚無消耗品
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {consumables.map((item) => (
                <GmItemCard key={item.id} item={item} onEdit={() => handleEditItem(item)} onRemove={() => handleRemoveItem(item.id)} />
              ))}
            </div>
          )}
        </div>

        {/* 裝備 */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Package className="h-4 w-4" />
            裝備/道具 ({equipment.length})
          </h4>
          {equipment.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed rounded-lg text-muted-foreground">
              尚無裝備
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {equipment.map((item) => (
                <GmItemCard key={item.id} item={item} onEdit={() => handleEditItem(item)} onRemove={() => handleRemoveItem(item.id)} />
              ))}
            </div>
          )}
        </div>

        {/* 新增道具按鈕 */}
        <Button onClick={handleAddItem} variant="outline" className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          新增道具
        </Button>

        {/* 編輯 Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-[95vw] lg:max-w-[1400px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingItem && items.find((i) => i.id === editingItem.id) ? '編輯道具' : '新增道具'}
              </DialogTitle>
              <DialogDescription>設定道具屬性與效果</DialogDescription>
            </DialogHeader>

            {editingItem && (
              <div className="space-y-6">
                {/* 上排：基本資訊、檢定系統、使用限制 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 基本資訊 */}
                  <EditFormCard title="基本資訊" description="設定道具的基本屬性">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="item-name">道具名稱 *</Label>
                        <Input
                          id="item-name"
                          value={editingItem.name}
                          onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                          placeholder="例：治療藥水"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="item-description">道具描述</Label>
                        <Textarea
                          id="item-description"
                          value={editingItem.description}
                          onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                          placeholder="描述道具的外觀與用途..."
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>道具類型</Label>
                          <Select
                            value={editingItem.type}
                            onValueChange={(value: 'consumable' | 'equipment') => {
                              setEditingItem({ ...editingItem, type: value, usageLimit: value === 'consumable' ? 1 : 0 });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="consumable">消耗品</SelectItem>
                              <SelectItem value="equipment">裝備/道具</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="item-quantity">
                            {items.find((i) => i.id === editingItem.id) ? '數量' : '新增張數'}
                          </Label>
                          <Input
                            id="item-quantity"
                            type="number"
                            min={1}
                            value={editingItem.quantity}
                            onChange={(e) =>
                              setEditingItem({ ...editingItem, quantity: Math.max(1, parseInt(e.target.value) || 1) })
                            }
                          />
                          {!items.find((i) => i.id === editingItem.id) && editingItem.quantity > 1 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              將產生 {editingItem.quantity} 張獨立的道具卡
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="space-y-0.5">
                          <Label>可轉移</Label>
                          <p className="text-xs text-muted-foreground">允許玩家轉移給其他角色</p>
                        </div>
                        <Switch
                          checked={editingItem.isTransferable}
                          onCheckedChange={(checked) => setEditingItem({ ...editingItem, isTransferable: checked })}
                        />
                      </div>
                      <div className="space-y-2 pt-2 border-t">
                        <TagsSection
                          tags={editingItem.tags}
                          onChange={(tags) => setEditingItem({ ...editingItem, tags })}
                        />
                      </div>
                    </div>
                  </EditFormCard>

                  {/* 檢定系統 */}
                  <EditFormCard title="檢定系統" description="設定道具使用時的檢定方式">
                    <CheckConfigSection
                      checkType={(editingItem.checkType || 'none') as CheckType}
                      contestConfig={editingItem.contestConfig}
                      randomConfig={editingItem.randomConfig}
                      stats={stats}
                      randomContestMaxValue={randomContestMaxValue}
                      onChange={(patch) => setEditingItem({ ...editingItem, ...patch })}
                    />
                  </EditFormCard>

                  {/* 使用限制 */}
                  <EditFormCard title="使用限制" description="設定使用次數與冷卻時間">
                    <UsageLimitSection
                      usageLimit={editingItem.usageLimit}
                      cooldown={editingItem.cooldown}
                      itemType={editingItem.type}
                      onChange={(patch) => setEditingItem({ ...editingItem, ...patch })}
                    />
                  </EditFormCard>
                </div>

                {/* 下排：效果列表 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="text-base font-semibold">使用效果</h3>
                      <p className="text-sm text-muted-foreground">設定道具使用時的效果，可添加多個效果</p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => {
                        const newEffect: ItemEffect = {
                          type: 'stat_change',
                          targetType: 'self',
                          requiresTarget: false,
                          statChangeTarget: 'value',
                        };
                        setEditingItem({ ...editingItem, effects: [...(editingItem.effects || []), newEffect] });
                      }}
                      variant="outline"
                      size="sm"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      新增效果
                    </Button>
                  </div>

                  {editingItem.effects && editingItem.effects.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {editingItem.effects.map((effect, index) => (
                        <EffectEditor
                          key={index}
                          effect={effect}
                          index={index}
                          stats={stats}
                          onChange={(updatedEffect) => {
                            const newEffects = [...(editingItem.effects || [])];
                            newEffects[index] = updatedEffect as ItemEffect;
                            setEditingItem({ ...editingItem, effects: newEffects });
                          }}
                          onDelete={() => {
                            const newEffects = (editingItem.effects || []).filter((_, i) => i !== index);
                            setEditingItem({ ...editingItem, effects: newEffects });
                          }}
                          availableTypes={['stat_change', 'custom', 'item_take', 'item_steal']}
                          checkType={editingItem.checkType}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg">
                      <p className="text-sm text-muted-foreground">尚無效果，點擊「新增效果」開始新增</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
              <Button onClick={handleSaveItem}>儲存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 使用說明 */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
          <h4 className="font-medium mb-2">💡 使用說明</h4>
          <ul className="list-disc list-inside space-y-1 text-blue-700">
            <li><strong>消耗品</strong>：使用後數量減 1，數量為 0 時消失</li>
            <li><strong>裝備/道具</strong>：使用後不消耗數量</li>
            <li><strong>使用限制</strong>：可設定使用次數上限與冷卻時間</li>
            <li><strong>效果</strong>：可設定數值變化、增益或自訂效果</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── GM 道具卡片元件 ────────────────────────────────────────────────────────────

interface GmItemCardProps {
  item: Item;
  onEdit: () => void;
  onRemove: () => void;
}

function GmItemCard({ item, onEdit, onRemove }: GmItemCardProps) {
  return (
    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{item.name || '未命名道具'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {hasItemEffects(item) && (
            <Badge variant="secondary" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              {getItemEffects(item).length} 個效果
            </Badge>
          )}
          {item.checkType && item.checkType !== 'none' && (
            <Badge variant="outline" className="text-xs">
              {item.checkType === 'contest' ? '對抗檢定' : item.checkType === 'random_contest' ? '隨機對抗檢定' : '隨機檢定'}
            </Badge>
          )}
          {item.tags && item.tags.length > 0 && item.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag === 'combat' ? '戰鬥' : tag === 'stealth' ? '隱匿' : tag}
            </Badge>
          ))}
          {item.usageLimit != null && (
            <Badge variant="outline" className="text-xs">
              {item.usageLimit > 0
                ? `${(item.usageLimit || 0) - (item.usageCount || 0)} / ${item.usageLimit} 次`
                : '無限次'}
            </Badge>
          )}
          {item.cooldown != null && item.cooldown > 0 && (
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {item.cooldown}s
            </Badge>
          )}
        </div>
        {item.description && (
          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{item.description}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
