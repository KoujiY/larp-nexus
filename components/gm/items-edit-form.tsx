'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/characters';
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

interface ItemsEditFormProps {
  characterId: string;
  initialItems: Item[];
  stats: Stat[]; // 用於效果選擇目標數值
}

export function ItemsEditForm({ characterId, initialItems, stats }: ItemsEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const selectedStat = stats.find((stat) => stat.name === editingItem?.effect?.targetStat);
  const selectedStatHasMax = selectedStat?.maxValue !== undefined && selectedStat?.maxValue !== null;

  // 新增道具
  const handleAddItem = () => {
    const newItem: Item = {
      id: `item-${Date.now()}`,
      name: '',
      description: '',
      type: 'consumable',
      quantity: 1,
      usageLimit: 1, // 消耗品預設1次
      isTransferable: true,
      acquiredAt: new Date(),
    };
    setEditingItem(newItem);
    setIsDialogOpen(true);
  };

  // 編輯道具
  const handleEditItem = (item: Item) => {
    // 修復舊資料：如果是 stat_change 但沒有 statChangeTarget，自動補上
    const fixedItem = { ...item };
    if (fixedItem.effect?.type === 'stat_change') {
      if (!fixedItem.effect.statChangeTarget) {
        fixedItem.effect = {
          ...fixedItem.effect,
          statChangeTarget: 'value',
        };
      }
    }
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

    const existingIndex = items.findIndex((i) => i.id === editingItem.id);
    if (existingIndex >= 0) {
      // 編輯現有道具（數量改變時不分割，僅更新）
      const updatedItems = [...items];
      updatedItems[existingIndex] = editingItem;
      setItems(updatedItems);
    } else {
      // 新增道具：如果數量 > 1，產生多張獨立的道具卡
      const quantity = editingItem.quantity || 1;
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
        toast.success(`已新增 ${quantity} 張「${editingItem.name}」道具卡`);
      } else {
        setItems([...items, { ...editingItem, quantity: 1 }]);
      }
    }
    
    setIsDialogOpen(false);
    setEditingItem(null);
  };

  // 刪除道具
  const handleRemoveItem = (itemId: string) => {
    setItems(items.filter((i) => i.id !== itemId));
  };

  // 快速調整數量
  const handleQuantityChange = (itemId: string, delta: number) => {
    setItems(items.map((item) => {
      if (item.id !== itemId) return item;
      const newQuantity = Math.max(0, item.quantity + delta);
      return { ...item, quantity: newQuantity };
    }));
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
                  onQuantityChange={(delta) => handleQuantityChange(item.id, delta)}
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
                  onQuantityChange={(delta) => handleQuantityChange(item.id, delta)}
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
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingItem && items.find((i) => i.id === editingItem.id) ? '編輯道具' : '新增道具'}
              </DialogTitle>
              <DialogDescription>
                設定道具屬性與效果
              </DialogDescription>
            </DialogHeader>

            {editingItem && (
              <div className="space-y-4">
                {/* 基本資訊 */}
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
                    rows={2}
                  />
                </div>

                  <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>道具類型</Label>
                    <Select
                      value={editingItem.type}
                      onValueChange={(value: 'consumable' | 'equipment') => {
                        // 切換類型時，消耗品預設使用次數1，非消耗品預設0
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
                      <p className="text-xs text-muted-foreground">
                        將產生 {editingItem.quantity} 張獨立的道具卡，每張都有獨立的使用次數
                      </p>
                    )}
                  </div>
                </div>

                {/* 使用效果 */}
                <div className="border-t pt-4">
                  <Label className="text-base font-medium">使用效果（可選）</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    設定道具使用時的效果
                  </p>
                  
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>效果類型</Label>
                      <Select
                        value={editingItem.effect?.type || 'none'}
                        onValueChange={(value) => {
                          if (value === 'none') {
                            setEditingItem({ ...editingItem, effect: undefined });
                          } else if (value === 'stat_change') {
                            // stat_change 必須設定預設的 statChangeTarget
                            setEditingItem({
                              ...editingItem,
                              effect: {
                                type: 'stat_change',
                                targetStat: editingItem.effect?.targetStat,
                                value: editingItem.effect?.value,
                                statChangeTarget: editingItem.effect?.statChangeTarget || 'value',
                                syncValue: editingItem.effect?.syncValue,
                                description: editingItem.effect?.description,
                              },
                            });
                          } else {
                            // custom 類型
                            setEditingItem({
                              ...editingItem,
                              effect: {
                                type: value as ItemEffect['type'],
                                description: editingItem.effect?.description,
                              },
                            });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="選擇效果類型" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">無效果</SelectItem>
                          <SelectItem value="stat_change">數值變化</SelectItem>
                          <SelectItem value="custom">自訂效果</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {editingItem.effect?.type === 'stat_change' && (() => {
                      const targetType: 'self' | 'other' | 'any' = editingItem.effect?.targetType || 'self';
                      
                      return (
                        <div className="space-y-3">
                          {/* Phase 6.5: 目標對象選擇 */}
                          <div className="space-y-2">
                            <Label>目標對象</Label>
                            <Select
                              value={targetType}
                              onValueChange={(value: 'self' | 'other' | 'any') => {
                                setEditingItem({
                                  ...editingItem,
                                  effect: {
                                    ...editingItem.effect!,
                                    targetType: value,
                                    requiresTarget: value !== 'self', // 自己不需要選擇，其他都需要
                                  },
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="self">自己</SelectItem>
                                <SelectItem value="other">其他玩家</SelectItem>
                                <SelectItem value="any">任一名玩家（包含自己）</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-sm text-muted-foreground">
                              {targetType === 'self' && '只能影響自己'}
                              {targetType === 'other' && '使用時需選擇其他角色'}
                              {targetType === 'any' && '使用時可選擇任意角色（包含自己）'}
                            </p>
                          </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>目標數值</Label>
                          <Select
                            value={editingItem.effect.targetStat || ''}
                            onValueChange={(value) => {
                              const stat = stats.find((s) => s.name === value);
                              const hasMax = stat?.maxValue !== undefined && stat?.maxValue !== null;
                              setEditingItem({
                                ...editingItem,
                                effect: {
                                  ...editingItem.effect!,
                                  targetStat: value,
                                  statChangeTarget: hasMax ? (editingItem.effect?.statChangeTarget || 'value') : 'value',
                                  syncValue: hasMax ? editingItem.effect?.syncValue : undefined,
                                },
                              });
                            }}
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
                          <div className="space-y-2">
                            <Label>變化值</Label>
                            <Input
                              type="number"
                              value={editingItem.effect.value || 0}
                              onChange={(e) => setEditingItem({
                                ...editingItem,
                                effect: { ...editingItem.effect!, value: parseInt(e.target.value) || 0 },
                              })}
                              placeholder="正數增加，負數減少"
                            />
                          </div>
                        </div>

                        {selectedStatHasMax && (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>作用目標</Label>
                              <Select
                                value={editingItem.effect.statChangeTarget || 'value'}
                                onValueChange={(value: 'value' | 'maxValue') =>
                                  setEditingItem({
                                    ...editingItem,
                                    effect: { ...editingItem.effect!, statChangeTarget: value },
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="value">目前值</SelectItem>
                                  <SelectItem value="maxValue">最大值</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {editingItem.effect.statChangeTarget === 'maxValue' && (
                              <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                  <span>同步目前值</span>
                                  <Switch
                                    checked={Boolean(editingItem.effect.syncValue)}
                                    onCheckedChange={(checked) =>
                                      setEditingItem({
                                        ...editingItem,
                                        effect: { ...editingItem.effect!, syncValue: checked },
                                      })
                                    }
                                  />
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  勾選時，最大值變動會連帶調整目前值（不超過新上限）
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                    })()}

                    {editingItem.effect?.type === 'custom' && (
                      <div className="space-y-2">
                        <Label>效果描述</Label>
                        <Textarea
                          value={editingItem.effect.description || ''}
                          onChange={(e) => setEditingItem({
                            ...editingItem,
                            effect: { ...editingItem.effect!, description: e.target.value },
                          })}
                          placeholder="描述道具的自訂效果..."
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 使用限制 */}
                <div className="border-t pt-4">
                  <Label className="text-base font-medium">使用限制（可選）</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    設定使用次數與冷卻時間
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4">
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
                          : '非消耗品可設為 0（無限使用）'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cooldown">冷卻時間（秒）</Label>
                      <Input
                        id="cooldown"
                        type="number"
                        min={0}
                        value={editingItem.cooldown || ''}
                        onChange={(e) => setEditingItem({
                          ...editingItem,
                          cooldown: e.target.value ? parseInt(e.target.value) : undefined,
                        })}
                        placeholder="0 或空白 = 無冷卻"
                      />
                    </div>
                  </div>
                </div>

                {/* 流通性 */}
                <div className="flex items-center justify-between border-t pt-4">
                  <div className="space-y-0.5">
                    <Label>可轉移</Label>
                    <p className="text-sm text-muted-foreground">
                      允許玩家將此道具轉移給其他角色
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
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSaveItem}>
                確認
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
  onQuantityChange: (delta: number) => void;
}

function ItemCard({ item, onEdit, onRemove, onQuantityChange }: ItemCardProps) {
  return (
    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate">{item.name || '未命名道具'}</span>
          {item.effect && (
            <Badge variant="secondary" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              有效果
            </Badge>
          )}
          {item.cooldown && item.cooldown > 0 && (
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {item.cooldown}s
            </Badge>
          )}
        </div>
        {item.description && (
          <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onQuantityChange(-1)}
          disabled={item.quantity <= 1}
        >
          -
        </Button>
        <span className="w-8 text-center font-mono">{item.quantity}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onQuantityChange(1)}
        >
          +
        </Button>
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

