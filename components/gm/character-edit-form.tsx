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
import { toast } from 'sonner';
import { X, Plus } from 'lucide-react';
import type { CharacterData } from '@/types/character';

interface CharacterEditFormProps {
  character: CharacterData;
  gameId: string;
}

export function CharacterEditForm({ character }: CharacterEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [formData, setFormData] = useState({
    name: character.name,
    description: character.description || '',
    hasPinLock: character.hasPinLock,
    pin: '',
    publicInfo: {
      background: character.publicInfo?.background || '',
      personality: character.publicInfo?.personality || '',
      relationships: character.publicInfo?.relationships || [],
    },
  });

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
      } = {
        name: formData.name,
        description: formData.description,
        hasPinLock: formData.hasPinLock,
        publicInfo: {
          background: formData.publicInfo.background,
          personality: formData.publicInfo.personality,
          relationships: formData.publicInfo.relationships,
        },
      };

      // 只有在有輸入新 PIN 時才傳送
      if (formData.pin) {
        updateData.pin = formData.pin;
      }

      const result = await updateCharacter(character.id, updateData);

      if (result.success) {
        toast.success('角色更新成功！');
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
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPin ? '🙈' : '👁️'}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {character.hasPinLock
                  ? '輸入新的 PIN 碼以修改，或留空保持原 PIN 不變'
                  : '請設定 PIN 碼，玩家需要此碼才能查看角色卡'}
              </p>
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

      <div className="flex justify-end space-x-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          取消
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? '儲存中...' : '💾 儲存變更'}
        </Button>
      </div>
    </form>
  );
}

