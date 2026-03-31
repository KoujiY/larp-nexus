'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateGame } from '@/app/actions/games';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useFormGuard } from '@/hooks/use-form-guard';
import { SaveButton } from '@/components/gm/save-button';
import { BackgroundBlockEditor } from '@/components/gm/background-block-editor';
import type { GameData } from '@/types/game';
import type { BackgroundBlock } from '@/types/character';

interface GameEditFormProps {
  game: GameData;
  onDirtyChange?: (dirty: boolean) => void;
}

export function GameEditForm({ game, onDirtyChange }: GameEditFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // 保留原始資料用於 dirty state 比較
  const initialData = useMemo(() => ({
    name: game.name,
    description: game.description || '',
    isActive: game.isActive,
    publicInfo: {
      blocks: game.publicInfo?.blocks || [],
    },
    randomContestMaxValue: game.randomContestMaxValue || 100,
  }), [game]);

  const [formData, setFormData] = useState(initialData);
  const [prevInitialData, setPrevInitialData] = useState(initialData);

  /**
   * 當 initialData props 變化時（例如結束遊戲後 router.refresh()），同步更新本地 state
   */
  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setFormData(initialData);
  }

  const { isDirty, resetDirty } = useFormGuard({
    initialData,
    currentData: formData,
  });

  /** 回報 dirty 狀態給父層（用於 tab 切換攔截） */
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  /** 處理 blocks 變更 */
  const handleBlocksChange = (blocks: BackgroundBlock[]) => {
    setFormData((prev) => ({
      ...prev,
      publicInfo: { ...prev.publicInfo, blocks },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const updateData = {
        name: formData.name,
        description: formData.description,
        isActive: formData.isActive,
        publicInfo: {
          blocks: formData.publicInfo.blocks,
        },
        randomContestMaxValue: formData.randomContestMaxValue,
      };

      const result = await updateGame(game.id, updateData);

      if (result.success) {
        toast.success('劇本更新成功！');
        resetDirty();
        router.refresh();
      } else {
        toast.error(result.message || '更新失敗');
      }
    } catch (err) {
      console.error('Error updating game:', err);
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 基本資訊 */}
      <Card>
        <CardHeader>
          <CardTitle>基本資訊</CardTitle>
          <CardDescription>
            設定劇本的名稱、描述與狀態
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              劇本名稱 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              disabled={isLoading}
              required
              placeholder="例：維多利亞時代的謎案"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">劇本描述</Label>
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
              rows={5}
              className="resize-none"
              placeholder="輸入劇本的簡介、類型、適合人數等..."
            />
            <p className="text-xs text-muted-foreground">
              建議不超過 300 字
            </p>
          </div>

          <div className="flex items-center justify-between py-3 px-4 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="isActive" className="text-base font-medium">
                劇本狀態
              </Label>
              <p className="text-sm text-muted-foreground">
                停用後將無法建立新角色
              </p>
            </div>
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isActive: checked }))
              }
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="randomContestMaxValue">
              隨機對抗檢定上限值
            </Label>
            <Input
              id="randomContestMaxValue"
              type="number"
              min={1}
              value={formData.randomContestMaxValue}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  randomContestMaxValue: Math.max(1, parseInt(e.target.value) || 100),
                }))
              }
              disabled={isLoading}
              placeholder="100"
            />
            <p className="text-xs text-muted-foreground">
              設定隨機對抗檢定時使用的上限值（預設 100，必須大於 0）
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 公開資訊（世界觀） */}
      <Card>
        <CardHeader>
          <CardTitle>公開資訊（世界觀）</CardTitle>
          <CardDescription>
            使用標題與內文編排劇本的世界觀、前導故事與章節（所有玩家可見）
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BackgroundBlockEditor
            value={formData.publicInfo.blocks}
            onChange={handleBlocksChange}
            disabled={isLoading}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end space-x-2">
        <SaveButton isDirty={isDirty} isLoading={isLoading} />
      </div>
    </form>
  );
}
