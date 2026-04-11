'use client';

/**
 * 角色編輯 — Tab 1：基本設定
 *
 * 欄位：角色名稱（必填）、角色描述、角色標語、人格特質、PIN 解鎖保護
 * 佈局：平坦 flex-col gap-8（無 Card wrapper）
 * 樣式：GM_LABEL_CLASS / GM_INPUT_CLASS 統一風格
 *
 * 從 character-edit-form.tsx 拆出，僅保留基本設定相關邏輯。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharacter } from '@/app/actions/character-update';
import { useFormGuard } from '@/hooks/use-form-guard';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { PinField } from '@/components/gm/pin-field';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_SECTION_CARD_CLASS,
} from '@/lib/styles/gm-form';
import { toast } from 'sonner';
import type { CharacterData } from '@/types/character';
import type { RegisterSaveHandler, RegisterDiscardHandler, SaveHandlerOptions } from '@/types/gm-edit';

interface BasicSettingsTabProps {
  character: CharacterData;
  gameId: string;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: RegisterSaveHandler;
  onRegisterDiscard?: RegisterDiscardHandler;
}

/**
 * Tab 1：基本設定（名稱、描述、PIN、人格特質）
 */
export function BasicSettingsTab({ character, gameId, onDirtyChange, onRegisterSave, onRegisterDiscard }: BasicSettingsTabProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const initialData = useMemo(() => ({
    name: character.name,
    description: character.description || '',
    slogan: character.slogan || '',
    hasPinLock: character.hasPinLock,
    pin: '',
    personality: character.publicInfo?.personality || '',
  }), [character]);

  const [formData, setFormData] = useState(initialData);
  const [prevInitialData, setPrevInitialData] = useState(initialData);

  // 外部 props 變化時同步
  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setFormData(initialData);
  }

  const { isDirty, resetDirty } = useFormGuard({
    initialData,
    currentData: formData,
  });

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // ── Save / Discard ──

  const save = useCallback(async (options?: SaveHandlerOptions) => {
    setIsLoading(true);

    try {
      const updateData: {
        name: string;
        description: string;
        slogan: string;
        hasPinLock: boolean;
        pin?: string;
        publicInfo?: { personality: string };
      } = {
        name: formData.name,
        description: formData.description,
        slogan: formData.slogan,
        hasPinLock: formData.hasPinLock,
        publicInfo: { personality: formData.personality },
      };

      if (formData.pin) {
        updateData.pin = formData.pin;
      }

      const result = await updateCharacter(character.id, updateData);

      if (result.success) {
        if (!options?.silent) toast.success('基本設定已儲存');
        resetDirty();
        router.refresh();
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
  }, [character.id, formData, resetDirty, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save();
  };

  const discard = useCallback(() => {
    setFormData(initialData);
  }, [initialData]);

  useEffect(() => { onRegisterSave?.(save); }, [onRegisterSave, save]);
  useEffect(() => { onRegisterDiscard?.(discard); }, [onRegisterDiscard, discard]);

  const update = <K extends keyof typeof formData>(key: K, value: (typeof formData)[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      {/* 1. 角色名稱 */}
      <section>
        <label className={GM_LABEL_CLASS}>
          角色名稱 <span className="text-destructive">*</span>
        </label>
        <Input
          value={formData.name}
          onChange={(e) => update('name', e.target.value)}
          disabled={isLoading}
          required
          placeholder="例：瑪格麗特夫人"
          className={GM_INPUT_CLASS}
        />
      </section>

      {/* 2. 角色描述 */}
      <section>
        <label className={GM_LABEL_CLASS}>角色描述</label>
        <Textarea
          value={formData.description}
          onChange={(e) => update('description', e.target.value)}
          disabled={isLoading}
          rows={8}
          className="bg-muted border-none shadow-none px-4 py-3 font-semibold focus-visible:ring-primary resize-none"
          placeholder="輸入角色的背景故事、性格特徵等..."
        />
        <p className="text-[11px] text-muted-foreground/60 font-medium mt-2">
          可輸入多行文字，建議不超過 1000 字
        </p>
      </section>

      {/* 3. 角色標語 */}
      <section>
        <label className={GM_LABEL_CLASS}>角色標語</label>
        <Input
          value={formData.slogan}
          onChange={(e) => update('slogan', e.target.value)}
          disabled={isLoading}
          placeholder="例：外表高雅的貴婦人，實則是黑市情報販子"
          className={GM_INPUT_CLASS}
        />
        <p className="text-[11px] text-muted-foreground/60 font-medium mt-2">
          顯示在玩家角色卡上的一句話提示，可包含扮演方向或角色真面目
        </p>
      </section>

      {/* 4. 人格特質 */}
      <section>
        <label className={GM_LABEL_CLASS}>人格特質</label>
        <Textarea
          value={formData.personality}
          onChange={(e) => update('personality', e.target.value)}
          disabled={isLoading}
          rows={4}
          className="bg-muted border-none shadow-none px-4 py-3 font-semibold focus-visible:ring-primary resize-none"
          placeholder="描述角色的行為準則與個性..."
        />
      </section>

      {/* 5. PIN 解鎖保護 */}
      <section className={cn(GM_SECTION_CARD_CLASS, 'max-w-lg space-y-6')}>
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h3 className="text-sm font-bold tracking-tight">PIN 解鎖保護</h3>
            <p className="text-xs text-muted-foreground">
              啟用後玩家需輸入 PIN 才能查看角色卡
            </p>
          </div>
          <Switch
            checked={formData.hasPinLock}
            onCheckedChange={(checked) => update('hasPinLock', checked)}
            disabled={isLoading}
            className="cursor-pointer"
          />
        </div>

        {/* PIN 輸入 */}
        {formData.hasPinLock && (
          <div className="pt-4 border-t border-border/15 max-w-xs">
            <PinField
              gameId={gameId}
              excludeCharacterId={character.id}
              value={formData.pin}
              onChange={(value) => update('pin', value)}
              disabled={isLoading}
              required={formData.hasPinLock && !character.hasPinLock}
              placeholder={character.hasPinLock ? '留空保持不變' : '4 位數字'}
              idleHint={
                character.hasPinLock
                  ? '輸入新的 PIN 碼以修改，或留空保持原 PIN 不變'
                  : '請設定 PIN 碼，玩家需要此碼才能查看角色卡'
              }
            />
          </div>
        )}
      </section>
    </form>
  );
}
