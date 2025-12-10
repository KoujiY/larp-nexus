'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Package, Zap, Clock, ArrowRightLeft, Sparkles, User } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Image from 'next/image';
import type { Item } from '@/types/character';
import { formatDate } from '@/lib/utils/date';
import { getTransferTargets, type TransferTargetCharacter } from '@/app/actions/public';

interface ItemListProps {
  items?: Item[];
  characterId: string;
  gameId: string;
  characterName: string;
  onUseItem?: (itemId: string, targetCharacterId?: string) => Promise<void>;
  onTransferItem?: (itemId: string, targetCharacterId: string) => Promise<void>;
}

export function ItemList({ items, characterId, gameId, characterName, onUseItem, onTransferItem }: ItemListProps) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [isUsing, setIsUsing] = useState(false);
  // 用於實時更新冷卻倒數的時間戳
  const [, setTick] = useState(0);
  
  // 轉移相關狀態
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferTargets, setTransferTargets] = useState<TransferTargetCharacter[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  
  // Phase 6.5: 使用道具時的目標選擇狀態
  const [useTargets, setUseTargets] = useState<TransferTargetCharacter[]>([]);
  const [selectedUseTargetId, setSelectedUseTargetId] = useState<string | undefined>(undefined);

  // 檢查是否有任何道具在冷卻中
  const hasAnyCooldown = items?.some((item) => {
    if (!item.cooldown || item.cooldown <= 0 || !item.lastUsedAt) return false;
    const lastUsed = new Date(item.lastUsedAt).getTime();
    const cooldownMs = item.cooldown * 1000;
    return Date.now() - lastUsed < cooldownMs;
  });

  // 每秒更新一次（僅當有道具在冷卻中時）
  useEffect(() => {
    if (!hasAnyCooldown) return;
    
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [hasAnyCooldown]);

  // 檢查道具是否可使用
  const canUseItem = (item: Item): { canUse: boolean; reason?: string } => {
    // 消耗品數量檢查
    if (item.type === 'consumable' && item.quantity <= 0) {
      return { canUse: false, reason: '數量不足' };
    }

    // 使用次數檢查
    if (item.usageLimit && item.usageLimit > 0) {
      if ((item.usageCount || 0) >= item.usageLimit) {
        return { canUse: false, reason: '已達使用次數上限' };
      }
    }

    // 冷卻時間檢查
    if (item.cooldown && item.cooldown > 0 && item.lastUsedAt) {
      const lastUsed = new Date(item.lastUsedAt).getTime();
      const now = Date.now();
      const cooldownMs = item.cooldown * 1000;
      if (now - lastUsed < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
        return { canUse: false, reason: `冷卻中 (${remainingSeconds}s)` };
      }
    }

    return { canUse: true };
  };

  // 計算冷卻剩餘時間
  const getCooldownRemaining = (item: Item): number | null => {
    if (!item.cooldown || item.cooldown <= 0 || !item.lastUsedAt) return null;
    
    const lastUsed = new Date(item.lastUsedAt).getTime();
    const now = Date.now();
    const cooldownMs = item.cooldown * 1000;
    const remaining = Math.ceil((cooldownMs - (now - lastUsed)) / 1000);
    
    return remaining > 0 ? remaining : null;
  };

  // Phase 6.5: 當選中道具變化時，若需要選擇目標則載入可選角色
  useEffect(() => {
    const loadUseTargets = async () => {
      if (!selectedItem || !selectedItem.effect?.requiresTarget) {
        setUseTargets([]);
        setSelectedUseTargetId(undefined);
        return;
      }

      if (!gameId || !characterId) {
        setUseTargets([]);
        setSelectedUseTargetId(undefined);
        return;
      }

      const result = await getTransferTargets(gameId, characterId);
      const effectTargetType = selectedItem.effect?.targetType;
      const shouldIncludeSelf = effectTargetType === 'any';

      if (result.success && result.data) {
        const targets = [...result.data];

        if (shouldIncludeSelf) {
          const alreadyHasSelf = targets.some((t) => t.id === characterId);
          if (!alreadyHasSelf) {
            targets.unshift({
              id: characterId,
              name: `${characterName}（自己）`,
              imageUrl: undefined,
            });
          }
        }

        setUseTargets(targets);
        setSelectedUseTargetId(undefined);
      } else {
        // 即便查詢失敗，若允許自己為目標，至少提供自己選項
        if (shouldIncludeSelf) {
          setUseTargets([
            { id: characterId, name: `${characterName}（自己）`, imageUrl: undefined },
          ]);
        } else {
          setUseTargets([]);
        }
        setSelectedUseTargetId(undefined);
      }
    };

    loadUseTargets();
  }, [selectedItem, gameId, characterId, characterName]);

  const isEmpty = !items || items.length === 0;
  if (isEmpty) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="space-y-4">
            <Package className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">背包是空的</h3>
              <p className="text-sm text-muted-foreground mt-2">
                你還沒有獲得任何道具
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 使用道具
  const handleUseItem = async () => {
    if (!selectedItem || !onUseItem) return;
    
    const { canUse } = canUseItem(selectedItem);
    if (!canUse) {
      return;
    }

    if (selectedItem.effect?.requiresTarget && !selectedUseTargetId) {
      return;
    }

    setIsUsing(true);
    try {
      await onUseItem(selectedItem.id, selectedUseTargetId);
      setSelectedItem(null);
      setSelectedUseTargetId(undefined);
    } finally {
      setIsUsing(false);
    }
  };

  // 開啟轉移 Dialog
  const handleOpenTransfer = async () => {
    if (!selectedItem || !gameId || !characterId) return;
    
    // 檢查道具是否可轉移
    if (!selectedItem.isTransferable) return;

    setIsLoadingTargets(true);
    setIsTransferDialogOpen(true);
    
    try {
      const result = await getTransferTargets(gameId, characterId);
      if (result.success && result.data) {
        setTransferTargets(result.data);
      } else {
        setTransferTargets([]);
      }
    } finally {
      setIsLoadingTargets(false);
    }
  };

  // 執行轉移
  const handleTransfer = async () => {
    if (!selectedItem || !selectedTargetId || !onTransferItem) return;

    setIsTransferring(true);
    try {
      await onTransferItem(selectedItem.id, selectedTargetId);
      setIsTransferDialogOpen(false);
      setSelectedItem(null);
      setSelectedTargetId('');
    } finally {
      setIsTransferring(false);
    }
  };

  // 分類道具
  const consumables = items.filter((i) => i.type === 'consumable');
  const equipment = items.filter((i) => i.type === 'equipment');

  return (
    <>
      <div className="space-y-6">
        {/* 消耗品 */}
        {consumables.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />
              消耗品
            </h4>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {consumables.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  cooldownRemaining={getCooldownRemaining(item)}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          </div>
        )}

        {/* 裝備/道具 */}
        {equipment.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              裝備/道具
            </h4>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {equipment.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  cooldownRemaining={getCooldownRemaining(item)}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 道具詳情 Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => {
        setSelectedItem(null);
        setSelectedUseTargetId(undefined);
      }}>
        <DialogContent>
          {selectedItem && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={selectedItem.type === 'consumable' ? 'secondary' : 'outline'}>
                    {selectedItem.type === 'consumable' ? '消耗品' : '裝備'}
                  </Badge>
                  {selectedItem.effect && (
                    <Badge variant="default">
                      <Sparkles className="h-3 w-3 mr-1" />
                      有效果
                    </Badge>
                  )}
                  {selectedItem.isTransferable && (
                    <Badge variant="outline">
                      <ArrowRightLeft className="h-3 w-3 mr-1" />
                      可轉移
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-xl">
                  {selectedItem.name}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-4 mt-4">
                    {/* 道具圖片 */}
                    {selectedItem.imageUrl && (
                      <div className="relative h-48 w-full rounded-lg overflow-hidden bg-muted">
                        <Image
                          src={selectedItem.imageUrl}
                          alt={selectedItem.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                    )}

                    {/* 道具描述 */}
                    {selectedItem.description && (
                      <p className="text-foreground whitespace-pre-wrap">
                        {selectedItem.description}
                      </p>
                    )}

                    {/* 道具屬性 */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-muted-foreground mb-1">數量</div>
                        <div className="font-semibold text-lg">{selectedItem.quantity}</div>
                      </div>
                      
                      {selectedItem.usageLimit && selectedItem.usageLimit > 0 && (
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-muted-foreground mb-1">剩餘使用次數</div>
                          <div className="font-semibold text-lg">
                            {selectedItem.usageLimit - (selectedItem.usageCount || 0)} / {selectedItem.usageLimit}
                          </div>
                        </div>
                      )}

                      {selectedItem.cooldown && selectedItem.cooldown > 0 && (
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-muted-foreground mb-1">冷卻時間</div>
                          <div className="font-semibold text-lg flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {selectedItem.cooldown}s
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 使用效果 */}
                    {selectedItem.effect && (
                      <div className="p-3 bg-purple-50 rounded-lg space-y-2">
                        <div className="text-sm font-medium text-purple-800 mb-1 flex items-center gap-1">
                          <Sparkles className="h-4 w-4" />
                          使用效果
                        </div>
                        <div className="text-purple-700 space-y-2">
                          {selectedItem.effect.type === 'stat_change' && (() => {
                            const target = selectedItem.effect.statChangeTarget ?? 'value';
                            const syncValue = selectedItem.effect.syncValue;
                            const value = selectedItem.effect.value ?? 0;
                            const targetStat = selectedItem.effect.targetStat ?? '數值';
                            
                            if (target === 'maxValue') {
                              return (
                                <span>
                                  {targetStat} 最大值 {value > 0 ? '+' : ''}{value}
                                  {syncValue && '，目前值同步調整'}
                                </span>
                              );
                            } else {
                              return (
                                <span>
                                  {targetStat} {value > 0 ? '+' : ''}{value}
                                </span>
                              );
                            }
                          })()}
                          {selectedItem.effect.type === 'custom' && (
                            <span>{selectedItem.effect.description}</span>
                          )}

                          {selectedItem.effect.requiresTarget && (
                            <div className="space-y-2 pt-1">
                              <div className="flex items-center gap-2 text-sm font-medium text-purple-800">
                                <User className="h-4 w-4" />
                                目標角色 <span className="text-destructive">*</span>
                              </div>
                              {useTargets.length === 0 ? (
                                <p className="text-sm text-purple-700">沒有可選擇的目標</p>
                              ) : (
                                <Select
                                  value={selectedUseTargetId}
                                  onValueChange={setSelectedUseTargetId}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="選擇目標角色" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {useTargets.map((target) => (
                                      <SelectItem key={target.id} value={target.id}>
                                        {target.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          )}

                          {!selectedItem.effect.requiresTarget && selectedItem.effect.targetType && (
                            <div className="space-y-1 pt-1 text-sm">
                              <div className="flex items-center gap-2 font-medium text-purple-800">
                                <User className="h-4 w-4" />
                                目標角色
                              </div>
                              <p>
                                {selectedItem.effect.targetType === 'self'
                                  ? '自己'
                                  : selectedItem.effect.targetType === 'other'
                                  ? '其他玩家'
                                  : selectedItem.effect.targetType === 'any'
                                  ? '任一名玩家'
                                  : '未指定'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 獲得時間 */}
                    <div className="text-sm text-muted-foreground pt-2 border-t">
                      獲得於：{formatDate(selectedItem.acquiredAt)}
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>

              {/* 操作按鈕 */}
              <DialogFooter className="flex-col sm:flex-row gap-2">
                {/* 使用按鈕 */}
                {(selectedItem.effect || onUseItem) && (() => {
                  const { canUse, reason } = canUseItem(selectedItem);
                  return (
                    <Button
                      onClick={handleUseItem}
                      disabled={
                        !canUse ||
                        isUsing ||
                        !onUseItem ||
                        (selectedItem.effect?.requiresTarget && !selectedUseTargetId)
                      }
                      className="w-full sm:w-auto"
                    >
                      {isUsing ? '使用中...' : canUse ? '使用道具' : reason}
                    </Button>
                  );
                })()}
                
                {/* 轉移按鈕 */}
                {selectedItem.isTransferable && onTransferItem && gameId && characterId && (
                  <Button
                    variant="outline"
                    onClick={handleOpenTransfer}
                    className="w-full sm:w-auto"
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    轉移道具
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 轉移選擇 Dialog */}
      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>選擇轉移對象</DialogTitle>
            <DialogDescription>
              將「{selectedItem?.name}」轉移給其他角色
            </DialogDescription>
          </DialogHeader>

          {isLoadingTargets ? (
            <div className="py-8 text-center text-muted-foreground">
              載入中...
            </div>
          ) : transferTargets.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <User className="mx-auto h-12 w-12 mb-4" />
              <p>沒有其他角色可以轉移</p>
            </div>
          ) : (
            <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="選擇角色..." />
              </SelectTrigger>
              <SelectContent>
                {transferTargets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsTransferDialogOpen(false);
                setSelectedTargetId('');
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={!selectedTargetId || isTransferring}
            >
              {isTransferring ? '轉移中...' : '確認轉移'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// 道具卡片元件
interface ItemCardProps {
  item: Item;
  cooldownRemaining: number | null;
  onClick: () => void;
}

function ItemCard({ item, cooldownRemaining, onClick }: ItemCardProps) {
  const isOnCooldown = cooldownRemaining !== null && cooldownRemaining > 0;

  return (
    <Card 
      className={`overflow-hidden cursor-pointer transition-all hover:shadow-lg ${
        isOnCooldown ? 'opacity-60' : ''
      }`}
      onClick={onClick}
    >
      <div className="aspect-square relative overflow-hidden bg-muted">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            {item.type === 'consumable' ? (
              <Zap className="h-12 w-12 text-muted-foreground" />
            ) : (
              <Package className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
        )}
        
        {/* 數量標籤 */}
        {item.quantity > 1 && (
          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">
            x{item.quantity}
          </div>
        )}

        {/* 冷卻中標籤 */}
        {isOnCooldown && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-white text-center">
              <Clock className="h-6 w-6 mx-auto mb-1" />
              <span className="text-sm font-mono">{cooldownRemaining}s</span>
            </div>
          </div>
        )}

        {/* 有效果標籤 */}
        {item.effect && !isOnCooldown && (
          <div className="absolute top-2 left-2">
            <Sparkles className="h-4 w-4 text-yellow-400 drop-shadow-lg" />
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <h4 className="font-semibold text-sm line-clamp-1">{item.name}</h4>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
            {item.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
