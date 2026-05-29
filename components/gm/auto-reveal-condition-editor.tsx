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
import type { GameItemInfo, GameSkillInfo } from '@/app/actions/games';

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
  /** 劇本中所有角色的技能列表 */
  availableSkills?: GameSkillInfo[];
  /** 該角色的隱藏資訊列表（僅隱藏目標使用） */
  availableSecrets?: SecretOption[];
  /** 可選用的條件類型（不含 none；none 由元件自動提供） */
  allowedTypes: AutoRevealConditionType[];
  /** 是否停用 */
  disabled?: boolean;
}

/** 條件類型選項 */
const CONDITION_TYPE_OPTIONS: Array<{
  value: AutoRevealConditionType;
  label: string;
}> = [
  { value: 'none', label: '無其他自動揭露條件' },
  { value: 'items_viewed', label: '檢視過某幾樣物品' },
  { value: 'items_acquired', label: '取得了某幾樣物品' },
  { value: 'secrets_revealed', label: '某幾樣隱藏資訊已揭露' },
  { value: 'skills_revealed', label: '某幾樣隱藏技能已揭露' },
  { value: 'items_revealed', label: '某幾樣隱藏物品已揭露' },
  { value: 'skill_used', label: '某幾樣技能被使用' },
  { value: 'item_used', label: '某幾樣物品被使用' },
];

/** 需要物品選擇器的條件類型 */
const ITEM_TYPES: AutoRevealConditionType[] = [
  'items_viewed',
  'items_acquired',
  'items_revealed',
  'item_used',
];

/** 需要技能選擇器的條件類型 */
const SKILL_TYPES: AutoRevealConditionType[] = ['skills_revealed', 'skill_used'];

/**
 * 自動揭露條件編輯器
 *
 * 通用組件，支援隱藏資訊和隱藏目標的揭露條件設定。
 * 提供兩層下拉（角色 → 物品/技能）、條件類型選擇、AND/OR 邏輯切換。
 */
export function AutoRevealConditionEditor({
  condition,
  onChange,
  availableItems,
  availableSkills = [],
  availableSecrets,
  allowedTypes,
  disabled = false,
}: AutoRevealConditionEditorProps) {
  // 物品選擇器暫存狀態
  const [selectedCharForItem, setSelectedCharForItem] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');

  // 技能選擇器暫存狀態
  const [selectedCharForSkill, setSelectedCharForSkill] = useState<string>('');
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');

  // 隱藏資訊選擇器暫存狀態
  const [selectedSecretId, setSelectedSecretId] = useState<string>('');

  const currentType: AutoRevealConditionType = condition?.type ?? 'none';
  const currentItemIds = condition?.itemIds ?? [];
  const currentSkillIds = condition?.skillIds ?? [];
  const currentSecretIds = condition?.secretIds ?? [];
  const currentMatchLogic = condition?.matchLogic ?? 'and';

  const isItemsCondition = ITEM_TYPES.includes(currentType);
  const isSkillsCondition = SKILL_TYPES.includes(currentType);
  const isSecretsCondition = currentType === 'secrets_revealed';

  /** 處理條件類型變更 */
  const handleTypeChange = (type: AutoRevealConditionType) => {
    if (type === 'none') {
      onChange(undefined);
      return;
    }
    onChange({
      type,
      itemIds: ITEM_TYPES.includes(type) ? [] : undefined,
      secretIds: type === 'secrets_revealed' ? [] : undefined,
      skillIds: SKILL_TYPES.includes(type) ? [] : undefined,
      matchLogic: 'and',
    });
    // 重置所有選擇器狀態
    setSelectedCharForItem('');
    setSelectedItemId('');
    setSelectedCharForSkill('');
    setSelectedSkillId('');
    setSelectedSecretId('');
  };

  // ──────────── 物品處理 ────────────

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
      onChange(undefined);
    } else {
      onChange({ ...condition!, itemIds: newItemIds });
    }
  };

  /** 根據 itemId 找到對應的顯示名稱（transfer-safe：跨所有角色搜尋） */
  const getItemDisplayName = (itemId: string): string => {
    const item = availableItems.find((i) => i.itemId === itemId);
    if (item) {
      return `${item.characterName} — ${item.itemName}`;
    }
    return `(已轉移/已刪除) ${itemId}`;
  };

  // 物品：第一層選擇器用的角色清單（有未選中道具的角色）
  const itemCharacters = Array.from(
    new Map(
      availableItems
        .filter((item) => !currentItemIds.includes(item.itemId))
        .map((item) => [item.characterId, item.characterName])
    ).entries()
  ).map(([characterId, characterName]) => ({ characterId, characterName }));

  // 物品：第二層選擇器用的道具清單（選定角色且未選中的道具）
  const itemsForSelectedChar = selectedCharForItem
    ? availableItems.filter(
        (item) =>
          item.characterId === selectedCharForItem &&
          !currentItemIds.includes(item.itemId)
      )
    : [];

  // ──────────── 技能處理 ────────────

  /** 新增技能到條件 */
  const handleAddSkill = () => {
    if (!selectedSkillId || currentSkillIds.includes(selectedSkillId)) return;
    onChange({
      ...condition!,
      skillIds: [...currentSkillIds, selectedSkillId],
    });
    setSelectedSkillId('');
  };

  /** 移除條件中的技能 */
  const handleRemoveSkill = (skillId: string) => {
    const newSkillIds = currentSkillIds.filter((id) => id !== skillId);
    if (newSkillIds.length === 0) {
      onChange(undefined);
    } else {
      onChange({ ...condition!, skillIds: newSkillIds });
    }
  };

  /** 根據 skillId 找到對應的顯示名稱（transfer-safe：跨所有角色搜尋） */
  const getSkillDisplayName = (skillId: string): string => {
    const skill = availableSkills.find((s) => s.skillId === skillId);
    if (skill) {
      return `${skill.characterName} — ${skill.skillName}`;
    }
    return `(已轉移/已刪除) ${skillId}`;
  };

  // 技能：第一層選擇器用的角色清單（有未選中技能的角色）
  const skillCharacters = Array.from(
    new Map(
      availableSkills
        .filter((skill) => !currentSkillIds.includes(skill.skillId))
        .map((skill) => [skill.characterId, skill.characterName])
    ).entries()
  ).map(([characterId, characterName]) => ({ characterId, characterName }));

  // 技能：第二層選擇器用的技能清單（選定角色且未選中的技能）
  const skillsForSelectedChar = selectedCharForSkill
    ? availableSkills.filter(
        (skill) =>
          skill.characterId === selectedCharForSkill &&
          !currentSkillIds.includes(skill.skillId)
      )
    : [];

  // ──────────── 隱藏資訊處理 ────────────

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
      onChange(undefined);
    } else {
      onChange({ ...condition!, secretIds: newSecretIds });
    }
  };

  /** 根據 secretId 找到對應的顯示名稱 */
  const getSecretDisplayName = (secretId: string): string => {
    const secret = availableSecrets?.find((s) => s.id === secretId);
    if (secret) {
      return secret.title;
    }
    return `(已刪除) ${secretId}`;
  };

  // 過濾已選中的隱藏資訊，避免重複
  const availableSecretsFiltered = (availableSecrets ?? []).filter(
    (secret) => !currentSecretIds.includes(secret.id)
  );

  /** 切換 AND/OR 邏輯 */
  const handleMatchLogicChange = (logic: 'and' | 'or') => {
    onChange({ ...condition!, matchLogic: logic });
  };

  // 條件類型選項過濾：只顯示 none 或 allowedTypes 中的類型
  const filteredOptions = CONDITION_TYPE_OPTIONS.filter(
    (opt) => opt.value === 'none' || allowedTypes.includes(opt.value)
  );

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

      {/* AND/OR 邏輯切換 */}
      {(isItemsCondition || isSkillsCondition || isSecretsCondition) && (
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

      {/* 道具選擇器（items_viewed / items_acquired / items_revealed / item_used） */}
      {isItemsCondition && (
        <div className="space-y-2">
          {/* 第一層：選擇角色 */}
          <Select
            value={selectedCharForItem}
            onValueChange={(val) => {
              setSelectedCharForItem(val);
              setSelectedItemId(''); // 切換角色時清空已選道具
            }}
            disabled={disabled || itemCharacters.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  itemCharacters.length === 0 ? '沒有可選的角色' : '選擇角色'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {itemCharacters.map((char) => (
                <SelectItem key={char.characterId} value={char.characterId}>
                  {char.characterName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 第二層：選擇道具 + 添加按鈕 */}
          <div className="flex gap-2">
            <Select
              value={selectedItemId}
              onValueChange={setSelectedItemId}
              disabled={disabled || !selectedCharForItem || itemsForSelectedChar.length === 0}
            >
              <SelectTrigger className="flex-1">
                <SelectValue
                  placeholder={
                    !selectedCharForItem
                      ? '請先選擇角色'
                      : itemsForSelectedChar.length === 0
                        ? '該角色沒有可選的物品'
                        : '選擇物品'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {itemsForSelectedChar.map((item) => (
                  <SelectItem key={item.itemId} value={item.itemId}>
                    {item.itemName}
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
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>

          {/* 已選道具標籤展示區 */}
          <div className="min-h-[48px] rounded-md border-2 border-dashed border-muted-foreground/25 p-2">
            {currentItemIds.length > 0 ? (
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
            ) : (
              <p className="text-xs text-muted-foreground text-center py-1">
                尚無匹配物品，請點選添加按鈕新增
              </p>
            )}
          </div>
        </div>
      )}

      {/* 技能選擇器（skills_revealed / skill_used） */}
      {isSkillsCondition && (
        <div className="space-y-2">
          {/* 第一層：選擇角色 */}
          <Select
            value={selectedCharForSkill}
            onValueChange={(val) => {
              setSelectedCharForSkill(val);
              setSelectedSkillId(''); // 切換角色時清空已選技能
            }}
            disabled={disabled || skillCharacters.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  skillCharacters.length === 0 ? '沒有可選的角色' : '選擇角色'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {skillCharacters.map((char) => (
                <SelectItem key={char.characterId} value={char.characterId}>
                  {char.characterName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 第二層：選擇技能 + 添加按鈕 */}
          <div className="flex gap-2">
            <Select
              value={selectedSkillId}
              onValueChange={setSelectedSkillId}
              disabled={disabled || !selectedCharForSkill || skillsForSelectedChar.length === 0}
            >
              <SelectTrigger className="flex-1">
                <SelectValue
                  placeholder={
                    !selectedCharForSkill
                      ? '請先選擇角色'
                      : skillsForSelectedChar.length === 0
                        ? '該角色沒有可選的技能'
                        : '選擇技能'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {skillsForSelectedChar.map((skill) => (
                  <SelectItem key={skill.skillId} value={skill.skillId}>
                    {skill.skillName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddSkill}
              disabled={disabled || !selectedSkillId}
              className="shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>

          {/* 已選技能標籤展示區 */}
          <div className="min-h-[48px] rounded-md border-2 border-dashed border-muted-foreground/25 p-2">
            {currentSkillIds.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {currentSkillIds.map((skillId) => (
                  <Badge
                    key={skillId}
                    variant="secondary"
                    className="flex items-center gap-1 pr-1"
                  >
                    <span className="text-xs">{getSkillDisplayName(skillId)}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skillId)}
                      disabled={disabled}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-1">
                尚無匹配技能，請點選添加按鈕新增
              </p>
            )}
          </div>
        </div>
      )}

      {/* 隱藏資訊選擇器（secrets_revealed） */}
      {isSecretsCondition && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Select
              value={selectedSecretId}
              onValueChange={setSelectedSecretId}
              disabled={disabled || availableSecretsFiltered.length === 0}
            >
              <SelectTrigger className="flex-1">
                <SelectValue
                  placeholder={
                    availableSecretsFiltered.length === 0
                      ? '沒有可選的隱藏資訊'
                      : '選擇隱藏資訊'
                  }
                />
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
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>

          {/* 已選隱藏資訊標籤展示區 */}
          <div className="min-h-[48px] rounded-md border-2 border-dashed border-muted-foreground/25 p-2">
            {currentSecretIds.length > 0 ? (
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
            ) : (
              <p className="text-xs text-muted-foreground text-center py-1">
                尚無匹配隱藏資訊，請點選添加按鈕新增
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
