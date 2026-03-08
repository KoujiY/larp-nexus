'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Plus } from 'lucide-react';
import type { AutoRevealCondition, AutoRevealConditionType } from '@/types/character';
import type { GameItemInfo } from '@/app/actions/games';

/** 隱藏資訊選項（用於 secrets_revealed 條件） */
export interface SecretOption {
  id: string;
  title: string;
}

interface AutoRevealConditionEditorProps {
  /** 當前條件設定 */
  condition: AutoRevealCondition | undefined;
  /** 條件變更回呼 */
  onChange: (condition: AutoRevealCondition | undefined) => void;
  /** 劇本中所有角色的道具列表 */
  availableItems: GameItemInfo[];
  /** 該角色的隱藏資訊列表（僅隱藏目標使用） */
  availableSecrets?: SecretOption[];
  /** 是否允許 secrets_revealed 條件（僅隱藏目標為 true） */
  allowSecretsCondition: boolean;
  /** 是否停用 */
  disabled?: boolean;
}

/** 條件類型選項 */
const CONDITION_TYPE_OPTIONS: Array<{
  value: AutoRevealConditionType;
  label: string;
  requiresSecrets?: boolean;
}> = [
  { value: 'none', label: '無其他自動揭露條件' },
  { value: 'items_viewed', label: '檢視過某幾樣道具' },
  { value: 'items_acquired', label: '取得了某幾樣道具' },
  { value: 'secrets_revealed', label: '某幾樣隱藏資訊已揭露', requiresSecrets: true },
];

/**
 * Phase 7.7: 自動揭露條件編輯器
 *
 * 通用組件，支援隱藏資訊和隱藏目標的揭露條件設定。
 * 提供條件類型選擇、AND/OR 邏輯切換、道具/隱藏資訊選擇器。
 */
export function AutoRevealConditionEditor({
  condition,
  onChange,
  availableItems,
  availableSecrets,
  allowSecretsCondition,
  disabled = false,
}: AutoRevealConditionEditorProps) {
  // 下拉選單暫存選中項目
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [selectedSecretId, setSelectedSecretId] = useState<string>('');

  const currentType: AutoRevealConditionType = condition?.type || 'none';
  const currentItemIds = condition?.itemIds || [];
  const currentSecretIds = condition?.secretIds || [];
  const currentMatchLogic = condition?.matchLogic || 'and';

  /** 處理條件類型變更 */
  const handleTypeChange = (type: AutoRevealConditionType) => {
    if (type === 'none') {
      onChange(undefined);
      return;
    }
    onChange({
      type,
      itemIds: type === 'items_viewed' || type === 'items_acquired' ? [] : undefined,
      secretIds: type === 'secrets_revealed' ? [] : undefined,
      matchLogic: type === 'secrets_revealed' ? undefined : 'and',
    });
  };

  /** 新增道具到條件 */
  const handleAddItem = () => {
    if (!selectedItemId || currentItemIds.includes(selectedItemId)) return;
    onChange({
      ...condition!,
      itemIds: [...currentItemIds, selectedItemId],
    });
    setSelectedItemId('');
  };

  /** 移除條件中的道具 */
  const handleRemoveItem = (itemId: string) => {
    const newItemIds = currentItemIds.filter((id) => id !== itemId);
    if (newItemIds.length === 0) {
      // 條件為空時，自動切回 none
      onChange(undefined);
    } else {
      onChange({
        ...condition!,
        itemIds: newItemIds,
      });
    }
  };

  /** 新增隱藏資訊到條件 */
  const handleAddSecret = () => {
    if (!selectedSecretId || currentSecretIds.includes(selectedSecretId)) return;
    onChange({
      ...condition!,
      secretIds: [...currentSecretIds, selectedSecretId],
    });
    setSelectedSecretId('');
  };

  /** 移除條件中的隱藏資訊 */
  const handleRemoveSecret = (secretId: string) => {
    const newSecretIds = currentSecretIds.filter((id) => id !== secretId);
    if (newSecretIds.length === 0) {
      // 條件為空時，自動切回 none
      onChange(undefined);
    } else {
      onChange({
        ...condition!,
        secretIds: newSecretIds,
      });
    }
  };

  /** 切換 AND/OR 邏輯 */
  const handleMatchLogicChange = (logic: 'and' | 'or') => {
    onChange({
      ...condition!,
      matchLogic: logic,
    });
  };

  /** 根據 itemId 找到對應的顯示名稱 */
  const getItemDisplayName = (itemId: string): string => {
    const item = availableItems.find((i) => i.itemId === itemId);
    if (item) {
      return `${item.characterName} — ${item.itemName}`;
    }
    return `(已刪除) ${itemId}`;
  };

  /** 根據 secretId 找到對應的顯示名稱 */
  const getSecretDisplayName = (secretId: string): string => {
    const secret = availableSecrets?.find((s) => s.id === secretId);
    if (secret) {
      return secret.title;
    }
    return `(已刪除) ${secretId}`;
  };

  // 過濾條件類型選項
  const filteredOptions = CONDITION_TYPE_OPTIONS.filter(
    (opt) => !opt.requiresSecrets || allowSecretsCondition
  );

  // 過濾已選中的道具，避免重複
  const availableItemsFiltered = availableItems.filter(
    (item) => !currentItemIds.includes(item.itemId)
  );

  // 過濾已選中的隱藏資訊，避免重複
  const availableSecretsFiltered = (availableSecrets || []).filter(
    (secret) => !currentSecretIds.includes(secret.id)
  );

  const isItemsCondition = currentType === 'items_viewed' || currentType === 'items_acquired';
  const isSecretsCondition = currentType === 'secrets_revealed';

  return (
    <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
      <Label className="text-sm font-medium">自動揭露條件</Label>

      {/* 條件類型選擇 */}
      <Select
        value={currentType}
        onValueChange={(val) => handleTypeChange(val as AutoRevealConditionType)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="選擇揭露條件類型" />
        </SelectTrigger>
        <SelectContent>
          {filteredOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* AND/OR 邏輯切換（僅 items_viewed 和 items_acquired） */}
      {isItemsCondition && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">匹配邏輯：</span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant={currentMatchLogic === 'and' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleMatchLogicChange('and')}
              disabled={disabled}
              className="h-7 px-3 text-xs"
            >
              都要滿足
            </Button>
            <Button
              type="button"
              variant={currentMatchLogic === 'or' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleMatchLogicChange('or')}
              disabled={disabled}
              className="h-7 px-3 text-xs"
            >
              滿足其一
            </Button>
          </div>
        </div>
      )}

      {/* 道具選擇器（items_viewed 和 items_acquired） */}
      {isItemsCondition && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Select
              value={selectedItemId}
              onValueChange={setSelectedItemId}
              disabled={disabled || availableItemsFiltered.length === 0}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={
                  availableItemsFiltered.length === 0
                    ? '沒有可選的道具'
                    : '選擇道具'
                } />
              </SelectTrigger>
              <SelectContent>
                {availableItemsFiltered.map((item) => (
                  <SelectItem key={`${item.characterId}-${item.itemId}`} value={item.itemId}>
                    {item.characterName} — {item.itemName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              disabled={disabled || !selectedItemId}
              className="shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* 已選道具標籤列表 */}
          {currentItemIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {currentItemIds.map((itemId) => (
                <Badge
                  key={itemId}
                  variant="secondary"
                  className="flex items-center gap-1 pr-1"
                >
                  <span className="text-xs">{getItemDisplayName(itemId)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(itemId)}
                    disabled={disabled}
                    className="ml-0.5 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 隱藏資訊選擇器（secrets_revealed） */}
      {isSecretsCondition && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            所有指定的隱藏資訊都必須已揭露才會觸發（AND 邏輯）
          </p>
          <div className="flex gap-2">
            <Select
              value={selectedSecretId}
              onValueChange={setSelectedSecretId}
              disabled={disabled || availableSecretsFiltered.length === 0}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={
                  availableSecretsFiltered.length === 0
                    ? '沒有可選的隱藏資訊'
                    : '選擇隱藏資訊'
                } />
              </SelectTrigger>
              <SelectContent>
                {availableSecretsFiltered.map((secret) => (
                  <SelectItem key={secret.id} value={secret.id}>
                    {secret.title || '(未命名)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddSecret}
              disabled={disabled || !selectedSecretId}
              className="shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* 已選隱藏資訊標籤列表 */}
          {currentSecretIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {currentSecretIds.map((secretId) => (
                <Badge
                  key={secretId}
                  variant="secondary"
                  className="flex items-center gap-1 pr-1"
                >
                  <span className="text-xs">{getSecretDisplayName(secretId)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSecret(secretId)}
                    disabled={disabled}
                    className="ml-0.5 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
