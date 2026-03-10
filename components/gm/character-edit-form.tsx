'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { getGameItems } from '@/app/actions/games';
import { checkPinAvailability } from '@/app/actions/characters'; // Phase 10.9.3
import type { GameItemInfo } from '@/app/actions/games';
import { AutoRevealConditionEditor } from '@/components/gm/auto-reveal-condition-editor';
import { cleanSecretConditions } from '@/lib/reveal/condition-cleaner';
import { useFormGuard } from '@/hooks/use-form-guard';
import { useGuardedNavigation } from '@/hooks/use-guarded-navigation';
import { SaveButton } from '@/components/gm/save-button';
import { NavigationGuardDialog } from '@/components/gm/navigation-guard-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { X, Plus, Lock } from 'lucide-react';
import type { CharacterData, Secret, AutoRevealCondition } from '@/types/character';

interface CharacterEditFormProps {
  character: CharacterData;
  gameId: string;
  onDirtyChange?: (dirty: boolean) => void;
}

export function CharacterEditForm({ character, gameId, onDirtyChange }: CharacterEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [availableItems, setAvailableItems] = useState<GameItemInfo[]>([]);

  // Phase 10.9.3: PIN 即時檢查狀態
  const [pinCheckStatus, setPinCheckStatus] = useState<
    'idle' | 'checking' | 'available' | 'unavailable' | 'invalid'
  >('idle');

  // 保留原始資料用於 dirty state 比較
  const initialData = useMemo(() => ({
    name: character.name,
    description: character.description || '',
    hasPinLock: character.hasPinLock,
    pin: '',
    publicInfo: {
      background: character.publicInfo?.background || '',
      personality: character.publicInfo?.personality || '',
      relationships: character.publicInfo?.relationships || [],
    },
    secretInfo: {
      secrets: (character.secretInfo?.secrets || []) as Secret[],
    },
  }), [character]);

  const [formData, setFormData] = useState(initialData);
  const [prevInitialData, setPrevInitialData] = useState(initialData);

  /**
   * 當 initialData props 變化時（例如 router.refresh() 後），同步更新本地 state
   */
  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setFormData(initialData);
  }

  const { isDirty, resetDirty } = useFormGuard({
    initialData,
    currentData: formData,
  });

  const { guardedBack, showDialog, confirmNavigation, cancelNavigation } =
    useGuardedNavigation(isDirty);

  /** 回報 dirty 狀態給父層（用於 tab 切換攔截） */
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // Phase 7.7: 載入劇本中所有道具（用於自動揭露條件設定）
  useEffect(() => {
    getGameItems(gameId).then((result) => {
      if (result.success && result.data) {
        setAvailableItems(result.data);
      }
    }).catch((error) => {
      console.error('Failed to load game items:', error);
    });
  }, [gameId]);

  // Phase 7.7-G: 道具載入後，清理隱藏資訊中引用已刪除道具的揭露條件
  useEffect(() => {
    if (availableItems.length === 0) return;

    const existingItemIds = availableItems.map((item) => item.itemId);
    const { secrets: cleanedSecrets, result } = cleanSecretConditions(
      formData.secretInfo.secrets,
      existingItemIds
    );

    if (result.cleaned) {
      setFormData((prev) => ({
        ...prev,
        secretInfo: { secrets: cleanedSecrets },
      }));
      toast.info(`已自動清理 ${result.removedCount} 個失效的揭露條件引用`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 僅在 availableItems 載入完成後執行一次
  }, [availableItems]);

  // Phase 10.9.3: PIN 即時檢查（防抖 500ms）
  const checkPin = useCallback(
    async (pin: string) => {
      const trimmedPin = pin.trim();

      // 驗證格式（4-6 位數字）
      if (!trimmedPin || trimmedPin.length < 4 || !/^\d{4,6}$/.test(trimmedPin)) {
        setPinCheckStatus('invalid');
        return;
      }

      setPinCheckStatus('checking');

      try {
        // 編輯時，排除當前角色（使用 character.id）
        const result = await checkPinAvailability(gameId, trimmedPin, character.id);
        if (result.success && result.data) {
          setPinCheckStatus(result.data.isAvailable ? 'available' : 'unavailable');
        } else {
          setPinCheckStatus('invalid');
        }
      } catch (err) {
        console.error('Error checking PIN:', err);
        setPinCheckStatus('invalid');
      }
    },
    [gameId, character.id]
  );

  // Phase 10.9.3: 當 PIN 變更時，觸發即時檢查（防抖 500ms）
  useEffect(() => {
    // 如果未啟用 PIN 鎖，或 PIN 為空（編輯時可留空），則不檢查
    if (!formData.hasPinLock || !formData.pin) {
      setPinCheckStatus('idle');
      return;
    }

    const timeoutId = setTimeout(() => {
      checkPin(formData.pin);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.hasPinLock, formData.pin, checkPin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const updateData: {
        name: string;
        description: string;
        hasPinLock: boolean;
        pin?: string;
        publicInfo?: {
          background: string;
          personality: string;
          relationships: Array<{ targetName: string; description: string }>;
        };
        secretInfo?: {
          secrets: Array<{
            id: string;
            title: string;
            content: string;
            isRevealed: boolean;
            revealCondition?: string;
            autoRevealCondition?: AutoRevealCondition;
          }>;
        };
      } = {
        name: formData.name,
        description: formData.description,
        hasPinLock: formData.hasPinLock,
        publicInfo: {
          background: formData.publicInfo.background,
          personality: formData.publicInfo.personality,
          relationships: formData.publicInfo.relationships,
        },
        secretInfo: {
          secrets: formData.secretInfo.secrets.map((secret) => ({
            id: secret.id,
            title: secret.title,
            content: secret.content,
            isRevealed: secret.isRevealed,
            revealCondition: secret.revealCondition || '',
            autoRevealCondition: secret.autoRevealCondition,
          })),
        },
      };

      // 只有在有輸入新 PIN 時才傳送
      if (formData.pin) {
        updateData.pin = formData.pin;
      }

      const result = await updateCharacter(character.id, updateData);

      if (result.success) {
        toast.success('角色更新成功！');
        resetDirty();
        router.refresh();
        // 清空 PIN 輸入框
        setFormData((prev) => ({ ...prev, pin: '' }));
      } else {
        toast.error(result.message || '更新失敗');
      }
    } catch (err) {
      console.error('Error updating character:', err);
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>基本資訊</CardTitle>
          <CardDescription>
            設定角色的名稱、描述與 PIN 鎖定選項
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              角色名稱 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              disabled={isLoading}
              required
              placeholder="例：瑪格麗特夫人"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">角色描述</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              disabled={isLoading}
              rows={8}
              className="resize-none"
              placeholder="輸入角色的背景故事、性格特徵等..."
            />
            <p className="text-xs text-muted-foreground">
              可輸入多行文字，建議不超過 1000 字
            </p>
          </div>

          <div className="flex items-center justify-between py-3 px-4 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="hasPinLock" className="text-base font-medium">
                PIN 解鎖保護
              </Label>
              <p className="text-sm text-muted-foreground">
                啟用後玩家需輸入 PIN 才能查看角色卡
              </p>
            </div>
            <Switch
              id="hasPinLock"
              checked={formData.hasPinLock}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, hasPinLock: checked }))
              }
              disabled={isLoading}
            />
          </div>

          {formData.hasPinLock && (
            <div className="space-y-2 p-4 rounded-lg border bg-blue-50/50">
              <Label htmlFor="pin">
                {character.hasPinLock ? '新 PIN 碼（留空保持不變）' : 'PIN 碼 *'}
              </Label>
              <div className="relative">
                <Input
                  id="pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]{4,6}"
                  placeholder="4-6 位數字"
                  value={formData.pin}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      pin: e.target.value.replace(/\D/g, '').slice(0, 6),
                    }))
                  }
                  disabled={isLoading}
                  required={formData.hasPinLock && !character.hasPinLock}
                  className="pr-20"
                />
                {/* Phase 10.9.3: PIN 檢查狀態指示器 */}
                <div className="absolute right-12 top-1/2 -translate-y-1/2">
                  {pinCheckStatus === 'checking' && (
                    <span className="text-gray-400 text-sm">⏳</span>
                  )}
                  {pinCheckStatus === 'available' && (
                    <span className="text-green-600 text-sm">✓</span>
                  )}
                  {pinCheckStatus === 'unavailable' && (
                    <span className="text-red-600 text-sm">✗</span>
                  )}
                  {pinCheckStatus === 'invalid' && (
                    <span className="text-orange-600 text-sm">⚠</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPin ? '🙈' : '👁️'}
                </button>
              </div>
              {/* Phase 10.9.3: PIN 檢查狀態提示 */}
              {pinCheckStatus === 'checking' && (
                <p className="text-xs text-gray-500">檢查中...</p>
              )}
              {pinCheckStatus === 'available' && (
                <p className="text-xs text-green-600">此 PIN 可以使用</p>
              )}
              {pinCheckStatus === 'unavailable' && (
                <p className="text-xs text-red-600">
                  此 PIN 在本遊戲中已被使用，請使用其他 PIN
                </p>
              )}
              {pinCheckStatus === 'invalid' && (
                <p className="text-xs text-orange-600">
                  PIN 格式錯誤（需要 4-6 位數字）
                </p>
              )}
              {pinCheckStatus === 'idle' && (
                <p className="text-xs text-muted-foreground">
                  {character.hasPinLock
                    ? '輸入新的 PIN 碼以修改，或留空保持原 PIN 不變'
                    : '請設定 PIN 碼，玩家需要此碼才能查看角色卡'}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase 3: 公開資訊編輯 */}
      <Card>
        <CardHeader>
          <CardTitle>公開資訊</CardTitle>
          <CardDescription>
            設定角色的公開資訊（PIN 解鎖後玩家可見）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="background">角色背景</Label>
            <Textarea
              id="background"
              value={formData.publicInfo.background}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  publicInfo: {
                    ...prev.publicInfo,
                    background: e.target.value,
                  },
                }))
              }
              disabled={isLoading}
              rows={6}
              className="resize-none"
              placeholder="輸入角色的背景故事、出身、經歷等..."
            />
            <p className="text-xs text-muted-foreground">
              可輸入多行文字，建議不超過 2000 字
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="personality">性格特徵</Label>
            <Textarea
              id="personality"
              value={formData.publicInfo.personality}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  publicInfo: {
                    ...prev.publicInfo,
                    personality: e.target.value,
                  },
                }))
              }
              disabled={isLoading}
              rows={4}
              className="resize-none"
              placeholder="輸入角色的性格、特質、行為模式等..."
            />
            <p className="text-xs text-muted-foreground">
              可輸入多行文字，建議不超過 500 字
            </p>
          </div>

          <div className="space-y-2">
            <Label>人物關係</Label>
            <div className="space-y-3">
              {formData.publicInfo.relationships.map((rel, index) => (
                <div
                  key={index}
                  className="flex gap-2 p-3 rounded-lg border bg-card"
                >
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="關係對象名稱"
                      value={rel.targetName}
                      onChange={(e) => {
                        const newRelationships = [...formData.publicInfo.relationships];
                        newRelationships[index] = {
                          ...newRelationships[index],
                          targetName: e.target.value,
                        };
                        setFormData((prev) => ({
                          ...prev,
                          publicInfo: {
                            ...prev.publicInfo,
                            relationships: newRelationships,
                          },
                        }));
                      }}
                      disabled={isLoading}
                    />
                    <Textarea
                      placeholder="關係描述"
                      value={rel.description}
                      onChange={(e) => {
                        const newRelationships = [...formData.publicInfo.relationships];
                        newRelationships[index] = {
                          ...newRelationships[index],
                          description: e.target.value,
                        };
                        setFormData((prev) => ({
                          ...prev,
                          publicInfo: {
                            ...prev.publicInfo,
                            relationships: newRelationships,
                          },
                        }));
                      }}
                      disabled={isLoading}
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newRelationships = formData.publicInfo.relationships.filter(
                        (_, i) => i !== index
                      );
                      setFormData((prev) => ({
                        ...prev,
                        publicInfo: {
                          ...prev.publicInfo,
                          relationships: newRelationships,
                        },
                      }));
                    }}
                    disabled={isLoading}
                    className="shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFormData((prev) => ({
                    ...prev,
                    publicInfo: {
                      ...prev.publicInfo,
                      relationships: [
                        ...prev.publicInfo.relationships,
                        { targetName: '', description: '' },
                      ],
                    },
                  }));
                }}
                disabled={isLoading}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                新增關係
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              可新增多個人物關係，每個關係包含對象名稱與描述
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Phase 3.5: 隱藏資訊編輯 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Lock className="mr-2 h-5 w-5" />
            隱藏資訊
          </CardTitle>
          <CardDescription>
            設定角色的隱藏資訊，每個隱藏資訊可獨立設定揭露條件與揭露狀態
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.secretInfo.secrets.map((secret, index) => (
            <Card key={secret.id} className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">隱藏資訊 #{index + 1}</CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newSecrets = formData.secretInfo.secrets.filter(
                        (_, i) => i !== index
                      );
                      setFormData((prev) => ({
                        ...prev,
                        secretInfo: { secrets: newSecrets },
                      }));
                    }}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>標題</Label>
                  <Input
                    placeholder="隱藏資訊標題"
                    value={secret.title}
                    onChange={(e) => {
                      const newSecrets = [...formData.secretInfo.secrets];
                      newSecrets[index] = { ...newSecrets[index], title: e.target.value };
                      setFormData((prev) => ({
                        ...prev,
                        secretInfo: { secrets: newSecrets },
                      }));
                    }}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label>內容</Label>
                  <Textarea
                    placeholder="隱藏資訊內容"
                    value={secret.content}
                    onChange={(e) => {
                      const newSecrets = [...formData.secretInfo.secrets];
                      newSecrets[index] = { ...newSecrets[index], content: e.target.value };
                      setFormData((prev) => ({
                        ...prev,
                        secretInfo: { secrets: newSecrets },
                      }));
                    }}
                    disabled={isLoading}
                    rows={6}
                    className="resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label>揭露條件</Label>
                  <Input
                    placeholder="例：完成任務 A 後揭露"
                    value={secret.revealCondition || ''}
                    onChange={(e) => {
                      const newSecrets = [...formData.secretInfo.secrets];
                      newSecrets[index] = { ...newSecrets[index], revealCondition: e.target.value };
                      setFormData((prev) => ({
                        ...prev,
                        secretInfo: { secrets: newSecrets },
                      }));
                    }}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    描述此隱藏資訊的揭露條件（僅供 GM 參考，玩家可見）
                  </p>
                </div>

                {/* Phase 7.7: 自動揭露條件編輯器 */}
                <AutoRevealConditionEditor
                  condition={secret.autoRevealCondition}
                  onChange={(newCondition) => {
                    const newSecrets = [...formData.secretInfo.secrets];
                    newSecrets[index] = { ...newSecrets[index], autoRevealCondition: newCondition };
                    setFormData((prev) => ({
                      ...prev,
                      secretInfo: { secrets: newSecrets },
                    }));
                  }}
                  availableItems={availableItems}
                  allowSecretsCondition={false}
                  disabled={isLoading}
                />

                <div className="flex items-center justify-between py-3 px-4 rounded-lg border bg-muted/30">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">
                      {secret.isRevealed ? '已揭露' : '未揭露'}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {secret.isRevealed
                        ? '玩家目前可以查看此隱藏資訊'
                        : '玩家目前無法查看此隱藏資訊'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-sm font-medium ${
                        secret.isRevealed ? 'text-green-600' : 'text-gray-500'
                      }`}
                    >
                      {secret.isRevealed ? '✓ 已揭露' : '✗ 未揭露'}
                    </span>
                    <Switch
                      checked={secret.isRevealed}
                      onCheckedChange={(checked) => {
                        const newSecrets = [...formData.secretInfo.secrets];
                        newSecrets[index] = { ...newSecrets[index], isRevealed: checked };
                        setFormData((prev) => ({
                          ...prev,
                          secretInfo: { secrets: newSecrets },
                        }));
                      }}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // 生成唯一 ID
              const newId = `secret-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
              setFormData((prev) => ({
                ...prev,
                secretInfo: {
                  secrets: [
                    ...prev.secretInfo.secrets,
                    {
                      id: newId,
                      title: '',
                      content: '',
                      isRevealed: false,
                      revealCondition: '',
                    },
                  ],
                },
              }));
            }}
            disabled={isLoading}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            新增隱藏資訊
          </Button>

          <p className="text-xs text-muted-foreground">
            提示：只有已揭露的隱藏資訊才會顯示在玩家角色卡上
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end space-x-2">
        <Button
          type="button"
          variant="outline"
          onClick={guardedBack}
          disabled={isLoading}
        >
          取消
        </Button>
        <SaveButton
          isDirty={isDirty}
          isLoading={isLoading}
          disabled={
            formData.hasPinLock &&
            formData.pin.length > 0 &&
            (pinCheckStatus === 'checking' ||
              pinCheckStatus === 'unavailable' ||
              pinCheckStatus === 'invalid')
          }
        />
      </div>
      </form>

      <NavigationGuardDialog
        open={showDialog}
        onConfirm={confirmNavigation}
        onCancel={cancelNavigation}
      />
    </>
  );
}

