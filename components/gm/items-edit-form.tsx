'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Package, Pencil, Zap, Clock } from 'lucide-react';
import type { Item, ItemEffect, Stat } from '@/types/character';
import type { BaseEvent, RoleUpdatedEvent, InventoryUpdatedEvent, ItemTransferredEvent, SkillContestEvent } from '@/types/event';
import { useCharacterWebSocket } from '@/hooks/use-websocket';
import { EffectEditor } from './effect-editor';
import { getItemEffects, hasItemEffects } from '@/lib/item/get-item-effects';
import { EditFormCard } from './edit-form-card';
import { Checkbox } from '@/components/ui/checkbox';

interface ItemsEditFormProps {
  characterId: string;
  initialItems: Item[];
  stats: Stat[]; // 用於效果選擇目標數值
  randomContestMaxValue?: number; // Phase 7.6: 劇本的隨機對抗檢定上限值
}

export function ItemsEditForm({ characterId, initialItems, stats, randomContestMaxValue = 100 }: ItemsEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Phase 9: 訂閱 WebSocket 事件，同步更新道具列表
  useCharacterWebSocket(characterId, (event: BaseEvent) => {
    console.log('[ItemsEditForm] 收到 WebSocket 事件', { 
      type: event.type, 
      characterId,
      timestamp: event.timestamp,
    });

    if (event.type === 'role.updated') {
      const payload = (event as RoleUpdatedEvent).payload;
      console.log('[ItemsEditForm] role.updated 事件內容', {
        characterId: payload.characterId,
        hasItems: !!payload.updates.items,
        itemsCount: payload.updates.items?.length,
      });

      if (payload.updates.items) {
        // 更新道具列表
        console.log('[ItemsEditForm] 更新道具列表', {
          oldCount: items.length,
          newCount: payload.updates.items.length,
          items: payload.updates.items,
        });
        setItems(payload.updates.items as unknown as Item[]);
        toast.info('道具列表已更新', { description: '玩家端的變更已同步' });
      }
    } else if (event.type === 'role.inventoryUpdated') {
      const payload = (event as InventoryUpdatedEvent).payload;
      console.log('[ItemsEditForm] role.inventoryUpdated 事件內容', {
        characterId: payload.characterId,
        itemName: payload.item.name,
        action: payload.action,
      });
      // 重新載入頁面以獲取最新資料
      router.refresh();
      toast.info('道具已更新', { description: `道具「${payload.item.name}」${payload.action === 'added' ? '已新增' : payload.action === 'updated' ? '已更新' : '已移除'}` });
    } else if (event.type === 'item.transferred') {
      const payload = (event as ItemTransferredEvent).payload;
      console.log('[ItemsEditForm] item.transferred 事件內容', {
        fromCharacterId: payload.fromCharacterId,
        toCharacterId: payload.toCharacterId,
        itemName: payload.itemName,
        quantity: payload.quantity,
        transferType: payload.transferType,
      });
      
      // 如果這個角色是轉移的來源或目標，需要重新載入道具列表
      if (payload.fromCharacterId === characterId || payload.toCharacterId === characterId) {
        console.log('[ItemsEditForm] 角色參與了道具轉移，重新載入道具列表');
        router.refresh();
        toast.info('道具已轉移', { 
          description: payload.fromCharacterId === characterId 
            ? `已將 ${payload.quantity} 個「${payload.itemName}」轉移給 ${payload.toCharacterName}`
            : `從 ${payload.fromCharacterName} 收到 ${payload.quantity} 個「${payload.itemName}」`
        });
      }
    } else if (event.type === 'skill.contest') {
      const payload = (event as SkillContestEvent).payload;
      console.log('[ItemsEditForm] skill.contest 事件內容', {
        attackerId: payload.attackerId,
        defenderId: payload.defenderId,
        result: payload.result,
        effectsApplied: payload.effectsApplied,
      });
      
      // 如果這個角色參與了對抗檢定，且檢定已完成（有結果），重新載入道具列表
      // 因為對抗檢定可能會導致道具轉移
      if ((payload.attackerId === characterId || payload.defenderId === characterId) && payload.result) {
        console.log('[ItemsEditForm] 角色參與了對抗檢定，檢定已完成，重新載入道具列表');
        // 延遲一下再刷新，確保後端的道具轉移操作已完成
        setTimeout(() => {
          router.refresh();
        }, 500);
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
      usageLimit: 1, // 消耗品預設1次
      cooldown: 0, // 預設為 0（無冷卻）
      isTransferable: true,
      acquiredAt: new Date(),
    };
    setEditingItem(newItem);
    setIsDialogOpen(true);
  };

  // 編輯道具
  const handleEditItem = (item: Item) => {
    // 向後兼容：將舊的 effect 轉換為 effects 陣列
    const fixedItem = { ...item };
    
    // 統一讀取效果列表（向後兼容已棄用的 effect 欄位）
    fixedItem.effects = getItemEffects(fixedItem);
    
    // 修復舊資料：如果是 stat_change 但沒有 statChangeTarget，自動補上
    fixedItem.effects = fixedItem.effects.map((effect) => {
      if (effect.type === 'stat_change' && !effect.statChangeTarget) {
        return {
          ...effect,
          statChangeTarget: 'value',
        };
      }
      return effect;
    });
    
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

    // Phase 8: 驗證檢定設定
    if (editingItem.checkType === 'contest') {
      if (!editingItem.contestConfig?.relatedStat) {
        toast.error('請選擇對抗檢定使用的數值');
        return;
      }
    }
    if (editingItem.checkType === 'random_contest') {
      // 隨機對抗檢定不需要 relatedStat，只需要確保 contestConfig 存在
      if (!editingItem.contestConfig) {
        editingItem.contestConfig = {
          relatedStat: '', // 不需要，但保留欄位以保持資料結構一致
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        };
      }
    }
    if (editingItem.checkType === 'random') {
      if (!editingItem.randomConfig) {
        toast.error('請設定隨機檢定配置');
        return;
      }
      if (editingItem.randomConfig.threshold === undefined || editingItem.randomConfig.threshold === null) {
        toast.error('請設定隨機檢定門檻值');
        return;
      }
      if (editingItem.randomConfig.maxValue === undefined || editingItem.randomConfig.maxValue === null) {
        toast.error('請設定隨機檢定上限值');
        return;
      }
      if (editingItem.randomConfig.threshold > editingItem.randomConfig.maxValue) {
        toast.error('門檻值不得超過上限值');
        return;
      }
    }

    // Phase 8: 確保檢定配置正確設定
    // 向後兼容：確保 effects 存在
    const finalItem = { ...editingItem };
    
    // 統一讀取效果列表並清理已棄用的 effect 欄位
    finalItem.effects = getItemEffects(finalItem);
    delete finalItem.effect;
    
    if (finalItem.checkType === 'random') {
      const maxValue = finalItem.randomConfig?.maxValue;
      const threshold = finalItem.randomConfig?.threshold;
      
      finalItem.randomConfig = {
        maxValue: (maxValue && maxValue > 0) ? maxValue : 100,
        threshold: (threshold !== undefined && threshold !== null && threshold > 0) ? threshold : 50,
      };
      
      if (finalItem.randomConfig.threshold > finalItem.randomConfig.maxValue) {
        finalItem.randomConfig.threshold = finalItem.randomConfig.maxValue;
      }
      
      finalItem.contestConfig = undefined;
    } else if (finalItem.checkType === 'contest') {
      if (!finalItem.contestConfig) {
        finalItem.contestConfig = {
          relatedStat: '',
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        };
      }
      finalItem.randomConfig = undefined;
    } else if (finalItem.checkType === 'random_contest') {
      // 隨機對抗檢定：不需要 relatedStat，但保留 contestConfig 結構
      if (!finalItem.contestConfig) {
        finalItem.contestConfig = {
          relatedStat: '', // 不需要，但保留欄位以保持資料結構一致
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        };
      }
      finalItem.randomConfig = undefined;
    } else {
      finalItem.randomConfig = undefined;
      finalItem.contestConfig = undefined;
    }

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
        const newItems: Item[] = [];
        for (let i = 0; i < quantity; i++) {
          newItems.push({
            ...editingItem,
            id: `item-${Date.now()}-${i}`, // 每張卡獨立 ID
            quantity: 1, // 每張卡數量為 1
            usageCount: 0, // 每張卡獨立的使用次數
          });
        }
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
            <CardDescription>
              管理角色的道具，設定效果與使用限制
            </CardDescription>
          </div>
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="mr-2 h-4 w-4" />
            {isLoading ? '儲存中...' : '儲存變更'}
          </Button>
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
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => handleEditItem(item)}
                  onRemove={() => handleRemoveItem(item.id)}
                />
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
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => handleEditItem(item)}
                  onRemove={() => handleRemoveItem(item.id)}
                />
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
              <DialogDescription>
                設定道具屬性與效果
              </DialogDescription>
            </DialogHeader>

            {editingItem && (
              <div className="space-y-6">
                {/* 上排：基本資訊卡片 */}
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
                              setEditingItem({ 
                                ...editingItem, 
                                type: value,
                                usageLimit: value === 'consumable' ? 1 : 0,
                              });
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
                            onChange={(e) => setEditingItem({ 
                              ...editingItem, 
                              quantity: Math.max(1, parseInt(e.target.value) || 1)
                            })}
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
                          <p className="text-xs text-muted-foreground">
                            允許玩家轉移給其他角色
                          </p>
                        </div>
                        <Switch
                          checked={editingItem.isTransferable}
                          onCheckedChange={(checked) => setEditingItem({ 
                            ...editingItem, 
                            isTransferable: checked,
                          })}
                        />
                      </div>
                      <div className="space-y-2 pt-2 border-t">
                        <Label>標籤</Label>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="item-tag-combat"
                              checked={editingItem.tags?.includes('combat') || false}
                              onCheckedChange={(checked) => {
                                const currentTags = editingItem.tags || [];
                                const newTags = checked
                                  ? [...currentTags, 'combat']
                                  : currentTags.filter(tag => tag !== 'combat');
                                setEditingItem({ ...editingItem, tags: newTags });
                              }}
                            />
                            <Label htmlFor="item-tag-combat" className="text-sm font-normal cursor-pointer">
                              戰鬥（可用於對抗檢定回應）
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="item-tag-stealth"
                              checked={editingItem.tags?.includes('stealth') || false}
                              onCheckedChange={(checked) => {
                                const currentTags = editingItem.tags || [];
                                const newTags = checked
                                  ? [...currentTags, 'stealth']
                                  : currentTags.filter(tag => tag !== 'stealth');
                                setEditingItem({ ...editingItem, tags: newTags });
                              }}
                            />
                            <Label htmlFor="item-tag-stealth" className="text-sm font-normal cursor-pointer">
                              隱匿（攻擊方姓名不出現在防守方訊息中）
                            </Label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </EditFormCard>

                  {/* 檢定系統 */}
                  <EditFormCard title="檢定系統" description="設定道具使用時的檢定方式">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="check-type">檢定類型</Label>
                        <Select
                          value={editingItem.checkType || 'none'}
                          onValueChange={(value: 'none' | 'contest' | 'random' | 'random_contest') => {
                            const newItem = { ...editingItem, checkType: value };
                            if (value === 'contest' || value === 'random_contest') {
                              newItem.contestConfig = {
                                relatedStat: '',
                                opponentMaxItems: 0,
                                opponentMaxSkills: 0,
                                tieResolution: 'attacker_wins',
                              };
                              newItem.randomConfig = undefined;
                            } else if (value === 'random') {
                              newItem.randomConfig = {
                                maxValue: 100,
                                threshold: 50,
                              };
                              newItem.contestConfig = undefined;
                            } else {
                              newItem.contestConfig = undefined;
                              newItem.randomConfig = undefined;
                            }
                            setEditingItem(newItem);
                          }}
                        >
                          <SelectTrigger id="check-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">無檢定</SelectItem>
                            <SelectItem value="contest">對抗檢定</SelectItem>
                            <SelectItem value="random">隨機檢定</SelectItem>
                            <SelectItem value="random_contest">隨機對抗檢定</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 對抗檢定設定 */}
                      {editingItem.checkType === 'contest' && (
                        <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                          <Label className="text-sm font-medium">對抗檢定設定</Label>
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <Label>使用的數值 *</Label>
                              <Select
                                value={editingItem.contestConfig?.relatedStat || ''}
                                onValueChange={(value) => setEditingItem({
                                  ...editingItem,
                                  contestConfig: {
                                    ...editingItem.contestConfig!,
                                    relatedStat: value,
                                  },
                                })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="選擇數值" />
                                </SelectTrigger>
                                <SelectContent>
                                  {stats.map((stat) => (
                                    <SelectItem key={stat.id} value={stat.name}>
                                      {stat.name}
                                    </SelectItem>
                                  ))}
                                  {stats.length === 0 && (
                                    <SelectItem value="" disabled>
                                      尚無定義數值
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label>對方最多可使用道具數</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={editingItem.contestConfig?.opponentMaxItems || 0}
                                  onChange={(e) => setEditingItem({
                                    ...editingItem,
                                    contestConfig: {
                                      ...editingItem.contestConfig!,
                                      opponentMaxItems: Math.max(0, parseInt(e.target.value) || 0),
                                    },
                                  })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>對方最多可使用技能數</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={editingItem.contestConfig?.opponentMaxSkills || 0}
                                  onChange={(e) => setEditingItem({
                                    ...editingItem,
                                    contestConfig: {
                                      ...editingItem.contestConfig!,
                                      opponentMaxSkills: Math.max(0, parseInt(e.target.value) || 0),
                                    },
                                  })}
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>平手裁決方式</Label>
                              <Select
                                value={editingItem.contestConfig?.tieResolution || 'attacker_wins'}
                                onValueChange={(value: 'attacker_wins' | 'defender_wins' | 'both_fail') => setEditingItem({
                                  ...editingItem,
                                  contestConfig: {
                                    ...editingItem.contestConfig!,
                                    tieResolution: value,
                                  },
                                })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="attacker_wins">攻擊方獲勝</SelectItem>
                                  <SelectItem value="defender_wins">防守方獲勝</SelectItem>
                                  <SelectItem value="both_fail">雙方失敗</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 隨機對抗檢定設定 */}
                      {editingItem.checkType === 'random_contest' && (
                        <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                          <Label className="text-sm font-medium">隨機對抗檢定設定</Label>
                          <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded text-sm text-blue-800 dark:text-blue-200 mb-3">
                            <strong>提示：</strong>隨機對抗檢定使用劇本預設的上限值 <strong>{randomContestMaxValue}</strong>。
                            攻擊方和防守方都骰 1 到 {randomContestMaxValue} 的隨機數，比拚大小決定勝負。
                            防守方只能選擇「隨機對抗檢定」類型的技能/道具來回應。
                            可在劇本設定中修改此值。
                          </div>
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label>對方最多可使用道具數</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={editingItem.contestConfig?.opponentMaxItems || 0}
                                  onChange={(e) => setEditingItem({
                                    ...editingItem,
                                    contestConfig: {
                                      ...editingItem.contestConfig!,
                                      opponentMaxItems: Math.max(0, parseInt(e.target.value) || 0),
                                    },
                                  })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>對方最多可使用技能數</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={editingItem.contestConfig?.opponentMaxSkills || 0}
                                  onChange={(e) => setEditingItem({
                                    ...editingItem,
                                    contestConfig: {
                                      ...editingItem.contestConfig!,
                                      opponentMaxSkills: Math.max(0, parseInt(e.target.value) || 0),
                                    },
                                  })}
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>平手裁決方式</Label>
                              <Select
                                value={editingItem.contestConfig?.tieResolution || 'attacker_wins'}
                                onValueChange={(value: 'attacker_wins' | 'defender_wins' | 'both_fail') => setEditingItem({
                                  ...editingItem,
                                  contestConfig: {
                                    ...editingItem.contestConfig!,
                                    tieResolution: value,
                                  },
                                })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="attacker_wins">攻擊方獲勝</SelectItem>
                                  <SelectItem value="defender_wins">防守方獲勝</SelectItem>
                                  <SelectItem value="both_fail">雙方失敗</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 隨機檢定設定 */}
                      {editingItem.checkType === 'random' && (
                        <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                          <Label className="text-sm font-medium">隨機檢定設定</Label>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>上限值 *</Label>
                              <Input
                                type="number"
                                min={1}
                                value={editingItem.randomConfig?.maxValue || 100}
                                onChange={(e) => {
                                  const maxValue = Math.max(1, parseInt(e.target.value) || 100);
                                  const threshold = editingItem.randomConfig?.threshold || 50;
                                  setEditingItem({
                                    ...editingItem,
                                    randomConfig: {
                                      maxValue,
                                      threshold: Math.min(threshold, maxValue),
                                    },
                                  });
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>門檻值 *</Label>
                              <Input
                                type="number"
                                min={1}
                                max={editingItem.randomConfig?.maxValue || 100}
                                value={editingItem.randomConfig?.threshold || 50}
                                onChange={(e) => {
                                  const threshold = Math.max(1, parseInt(e.target.value) || 50);
                                  const maxValue = editingItem.randomConfig?.maxValue || 100;
                                  setEditingItem({
                                    ...editingItem,
                                    randomConfig: {
                                      maxValue,
                                      threshold: Math.min(threshold, maxValue),
                                    },
                                  });
                                }}
                              />
                              <p className="text-xs text-muted-foreground">
                                檢定結果 ≥ 門檻值時通過
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </EditFormCard>

                  {/* 使用限制 */}
                  <EditFormCard title="使用限制" description="設定使用次數與冷卻時間">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="usage-limit">使用次數限制</Label>
                        <Input
                          id="usage-limit"
                          type="number"
                          min={0}
                          value={editingItem.usageLimit ?? (editingItem.type === 'consumable' ? 1 : 0)}
                          onChange={(e) => setEditingItem({
                            ...editingItem,
                            usageLimit: Math.max(0, parseInt(e.target.value) || 0),
                          })}
                          placeholder={editingItem.type === 'consumable' ? '消耗品至少 1 次' : '0 = 無限制'}
                        />
                        <p className="text-xs text-muted-foreground">
                          {editingItem.type === 'consumable' 
                            ? '消耗品建議至少 1 次' 
                            : '設為 0 表示無限制'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {editingItem.type === 'consumable' 
                            ? '消耗品建議至少 1 次' 
                            : '非消耗品可設為 0（無限使用）'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cooldown">冷卻時間（秒）</Label>
                        <Input
                          id="cooldown"
                          type="number"
                          min={0}
                          value={editingItem.cooldown ?? 0}
                          onChange={(e) => setEditingItem({
                            ...editingItem,
                            cooldown: parseInt(e.target.value) || 0,
                          })}
                          placeholder="0 = 無冷卻"
                        />
                        <p className="text-xs text-muted-foreground">
                          設為 0 表示無冷卻時間
                        </p>
                      </div>
                    </div>
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
                        setEditingItem({
                          ...editingItem,
                          effects: [...(editingItem.effects || []), newEffect],
                        });
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
                            // 確保 updatedEffect 是 ItemEffect 類型（因為 availableTypes 只包含 ItemEffect 類型）
                            newEffects[index] = updatedEffect as ItemEffect;
                            setEditingItem({ ...editingItem, effects: newEffects });
                          }}
                          onDelete={() => {
                            const newEffects = (editingItem.effects || []).filter((_, i) => i !== index);
                            setEditingItem({ ...editingItem, effects: newEffects });
                          }}
                          availableTypes={['stat_change', 'custom', 'item_take', 'item_steal']}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        尚無效果，點擊「新增效果」開始新增
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSaveItem}>
                儲存
              </Button>
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

// 道具卡片元件
interface ItemCardProps {
  item: Item;
  onEdit: () => void;
  onRemove: () => void;
}

function ItemCard({ item, onEdit, onRemove }: ItemCardProps) {
  return (
    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg group">
      <div className="flex-1 min-w-0">
        {/* 第一行：名稱 */}
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{item.name || '未命名道具'}</span>
        </div>
        {/* 第二行：標籤 */}
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
          {item.tags && item.tags.length > 0 && item.tags.map(tag => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag === 'combat' ? '戰鬥' : tag === 'stealth' ? '隱匿' : tag}
            </Badge>
          ))}
          {item.usageLimit != null && (
            <Badge variant="outline" className="text-xs">
              {item.usageLimit > 0
                ? `${item.usageCount || 0} / ${item.usageLimit} 次`
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

      <Button variant="ghost" size="icon" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

