'use client';

/**
 * 角色編輯 — Tab 2：背景故事
 *
 * 佈局：12 欄 grid（參照 game-edit-form 的世界觀公開資訊）
 * - 左欄 (7/12)：角色背景（BackgroundBlockEditor）
 * - 右欄 (5/12)：人物關係（CharacterAvatarList + 關係詳情）
 *
 * 從 character-edit-form.tsx 拆出 background + relationships。
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { updateCharacter } from '@/app/actions/character-update';
import { useFormGuard } from '@/hooks/use-form-guard';

// BackgroundBlockEditor 內含 @dnd-kit/*（16 KB gzip）僅在編輯背景時需要，
// 改走 dynamic chunk。
const BackgroundBlockEditor = dynamic(
  () =>
    import('@/components/gm/background-block-editor').then((m) => ({
      default: m.BackgroundBlockEditor,
    })),
  { ssr: false },
);
import { CharacterAvatarList } from '@/components/player/character-avatar-list';
import type { AvatarCharacter } from '@/components/player/character-avatar-list';
import { DashedAddButton } from '@/components/gm/dashed-add-button';
import { GmEmptyState } from '@/components/gm/gm-empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MoreHorizontal, Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_SCROLLBAR_CLASS,
  GM_SECTION_CARD_CLASS,
  GM_SECTION_TITLE_CLASS,
} from '@/lib/styles/gm-form';
import { toast } from 'sonner';
import type { CharacterData, BackgroundBlock, Relationship } from '@/types/character';
import type { GameCharacterSummary } from '@/components/gm/character-edit-tabs';
import type { RegisterSaveHandler, RegisterDiscardHandler, SaveHandlerOptions } from '@/types/gm-edit';

interface BackgroundStoryTabProps {
  character: CharacterData;
  gameCharacters: GameCharacterSummary[];
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: RegisterSaveHandler;
  onRegisterDiscard?: RegisterDiscardHandler;
}

/**
 * Tab 2：背景故事（角色背景 + 人物關係）
 */
export function BackgroundStoryTab({
  character,
  gameCharacters,
  onDirtyChange,
  onRegisterSave,
  onRegisterDiscard,
}: BackgroundStoryTabProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const initialData = useMemo(() => ({
    background: character.publicInfo?.background || ([] as BackgroundBlock[]),
    relationships: character.publicInfo?.relationships || ([] as Relationship[]),
  }), [character]);

  const [formData, setFormData] = useState(initialData);
  const [prevInitialData, setPrevInitialData] = useState(initialData);

  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setFormData(initialData);
  }

  const { isDirty, resetDirty } = useFormGuard({
    initialData,
    currentData: formData,
  });

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // ── 人物關係頭像列表 ──

  /** 當前選中的關係索引 */
  const [activeRelIdx, setActiveRelIdx] = useState<number | undefined>(
    formData.relationships.length > 0 ? 0 : undefined,
  );

  const activeRel = activeRelIdx !== undefined ? formData.relationships[activeRelIdx] : undefined;

  /** 將 relationships 轉為 AvatarCharacter[]，匹配劇本角色帶上 imageUrl */
  const avatarCharacters: AvatarCharacter[] = useMemo(() => {
    return formData.relationships.map((rel, idx) => {
      const matched = gameCharacters.find(
        (gc) => gc.name === rel.targetName,
      );
      return {
        id: String(idx),
        name: rel.targetName || '未命名',
        imageUrl: matched?.imageUrl,
      };
    });
  }, [formData.relationships, gameCharacters]);

  const handleAvatarSelect = useCallback((id: string) => {
    setActiveRelIdx(Number(id));
  }, []);

  // ── 關係 CRUD ──

  const updateRelationship = (index: number, field: keyof Relationship, value: string) => {
    setFormData((prev) => {
      const updated = [...prev.relationships];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, relationships: updated };
    });
  };

  const addRelationship = () => {
    setFormData((prev) => {
      const newRels = [...prev.relationships, { targetName: '', description: '' }];
      setActiveRelIdx(newRels.length - 1);
      return { ...prev, relationships: newRels };
    });
  };

  const removeRelationship = (index: number) => {
    setFormData((prev) => {
      const newRels = prev.relationships.filter((_, i) => i !== index);
      return { ...prev, relationships: newRels };
    });
    // 調整選中索引
    setActiveRelIdx((prev) => {
      if (prev === undefined) return undefined;
      if (prev === index) return formData.relationships.length > 1 ? Math.min(index, formData.relationships.length - 2) : undefined;
      if (prev > index) return prev - 1;
      return prev;
    });
  };

  // ── Save / Discard ──

  const save = useCallback(async (options?: SaveHandlerOptions) => {
    setIsLoading(true);

    try {
      const result = await updateCharacter(character.id, {
        publicInfo: {
          background: formData.background,
          relationships: formData.relationships,
        },
      });

      if (result.success) {
        if (!options?.silent) toast.success('背景故事已儲存');
        resetDirty();
        router.refresh();
      } else {
        toast.error(result.message || '更新失敗');
      }
    } catch (err) {
      console.error('Error updating background:', err);
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

  return (
    <form onSubmit={handleSubmit} className="h-full">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full min-h-0 items-start">
        {/* ── 左欄：角色背景 ── */}
        <section className={cn('lg:col-span-7 lg:overflow-hidden lg:max-h-full', GM_SECTION_CARD_CLASS, 'lg:flex lg:flex-col')}>
          <h2 className={cn(GM_SECTION_TITLE_CLASS, 'mb-8 shrink-0')}>
            <span className="w-1 h-5 bg-primary rounded-full" />
            角色背景
          </h2>
          <div className={cn('lg:flex-1 lg:overflow-y-auto lg:min-h-0 lg:-mx-8 lg:px-8 lg:pb-2', GM_SCROLLBAR_CLASS)}>
            <BackgroundBlockEditor
              value={formData.background}
              onChange={(blocks) =>
                setFormData((prev) => ({ ...prev, background: blocks }))
              }
              disabled={isLoading}
            />
          </div>
        </section>

        {/* ── 右欄：人物關係 ── */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          {formData.relationships.length === 0 ? (
            <GmEmptyState
              icon={<Users className="h-10 w-10" />}
              title="尚未新增任何人物關係"
              description="為角色建立與其他角色之間的關係，豐富劇本的人際網絡。"
              actionLabel="新增關係"
              onAction={addRelationship}
              disabled={isLoading}
            />
          ) : (
            <>
              <div className="bg-card rounded-2xl border border-border/10 shadow-sm overflow-hidden flex flex-col">
                {/* Header：標題 + 頭像列表 */}
                <div className="p-8 border-b border-border/30 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className={GM_SECTION_TITLE_CLASS}>
                      <span className="w-1 h-5 bg-primary rounded-full" />
                      人物關係
                    </h2>
                    {activeRel && activeRelIdx !== undefined && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={isLoading}
                            className="cursor-pointer p-2 rounded-xl hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors"
                          >
                            <MoreHorizontal className="h-5 w-5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => removeRelationship(activeRelIdx)}
                          >
                            <Trash2 />
                            刪除此關係
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* 頭像列表 */}
                  <CharacterAvatarList
                    characters={avatarCharacters}
                    activeId={activeRelIdx !== undefined ? String(activeRelIdx) : undefined}
                    onSelect={handleAvatarSelect}
                  />
                </div>

                {/* Body：選中關係的表單 */}
                {activeRel && activeRelIdx !== undefined && (
                  <div className="p-8 space-y-6">
                    <div>
                      <label className={GM_LABEL_CLASS}>名稱</label>
                      <Input
                        value={activeRel.targetName}
                        onChange={(e) => updateRelationship(activeRelIdx, 'targetName', e.target.value)}
                        disabled={isLoading}
                        placeholder="角色名稱"
                        className={GM_INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label className={GM_LABEL_CLASS}>關係描述</label>
                      <Textarea
                        value={activeRel.description}
                        onChange={(e) => updateRelationship(activeRelIdx, 'description', e.target.value)}
                        disabled={isLoading}
                        rows={4}
                        className="bg-muted border-none shadow-none px-4 py-3 font-semibold focus-visible:ring-primary resize-none"
                        placeholder="描述與此角色的關係..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 新增關係按鈕（卡片外） */}
              <DashedAddButton
                label="新增關係"
                onClick={addRelationship}
                disabled={isLoading}
                className="py-4"
              />
            </>
          )}
        </section>
      </div>
    </form>
  );
}
