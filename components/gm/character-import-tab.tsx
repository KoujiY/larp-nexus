'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Settings, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { CharacterImportInput } from '@/components/gm/character-import-input';
import { CharacterImportPreview } from '@/components/gm/character-import-preview';
import { parseCharacterFromText, parseCharacterFromDocx } from '@/app/actions/character-import';
import { createCharacter } from '@/app/actions/characters';
import { updateCharacter } from '@/app/actions/character-update';
import type { CharacterImportResult } from '@/lib/ai/schemas/character-import';
import type { UpdateCharacterInput } from '@/types/character';
import { GM_SECTION_CARD_CLASS, GM_CTA_BUTTON_CLASS } from '@/lib/styles/gm-form';
import { cn } from '@/lib/utils';

type ImportStage = 'input' | 'parsing' | 'preview' | 'creating';

interface CharacterImportTabProps {
  gameId: string;
  hasAiConfig: boolean;
  isActive?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

export function CharacterImportTab({ gameId, hasAiConfig, isActive, onDirtyChange }: CharacterImportTabProps) {
  const router = useRouter();
  const [stage, setStage] = useState<ImportStage>('input');
  const [lastText, setLastText] = useState('');
  const [parseResult, setParseResult] = useState<CharacterImportResult | null>(null);

  // Dirty state：有解析結果但尚未建立角色
  const isDirty = parseResult !== null && stage !== 'creating';

  // 通知父層 dirty 狀態（用於 tab 琥珀金圓點）
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // beforeunload 防護
  useEffect(() => {
    if (!isDirty && stage !== 'parsing') return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, stage]);

  // Runtime 模式提示
  if (isActive) {
    return (
      <div className={cn(GM_SECTION_CARD_CLASS, 'text-center py-12')}>
        <p className="text-muted-foreground font-medium">
          遊戲進行中無法匯入角色，請先結束遊戲再進行匯入。
        </p>
      </div>
    );
  }

  // 未設定 AI 提示
  if (!hasAiConfig) {
    return (
      <div className={cn(GM_SECTION_CARD_CLASS, 'text-center py-12 space-y-4')}>
        <Settings className="h-10 w-10 text-muted-foreground/30 mx-auto" />
        <div className="space-y-2">
          <p className="font-bold">尚未設定 AI 服務</p>
          <p className="text-sm text-muted-foreground">
            使用 AI 角色匯入功能前，請先至個人設定頁完成 AI 服務設定。
          </p>
        </div>
        <Link href="/profile">
          <button type="button" className={GM_CTA_BUTTON_CLASS}>
            前往設定
          </button>
        </Link>
      </div>
    );
  }

  const handleSubmitText = async (text: string) => {
    setLastText(text);
    setStage('parsing');

    const result = await parseCharacterFromText(text);
    if (result.success && result.data) {
      setParseResult(result.data);
      setStage('preview');
    } else {
      toast.error(result.message || '解析失敗');
      setStage('input');
    }
  };

  const handleSubmitDocx = async (formData: FormData) => {
    setStage('parsing');

    const result = await parseCharacterFromDocx(formData);
    if (result.success && result.data) {
      setParseResult(result.data);
      setStage('preview');
    } else {
      toast.error(result.message || '解析失敗');
      setStage('input');
    }
  };

  const handleReimport = () => {
    setParseResult(null);
    setStage('input');
  };

  const handleConfirm = async (data: CharacterImportResult) => {
    setStage('creating');

    try {
      // Step 1: 建立角色（基本欄位）
      const createResult = await createCharacter({
        gameId,
        name: data.name,
        description: data.description || undefined,
        hasPinLock: false,
      });

      if (!createResult.success || !createResult.data) {
        toast.error(createResult.message || '角色建立失敗');
        setStage('preview');
        return;
      }

      const characterId = createResult.data.id;

      // Step 2: 更新所有匯入的欄位
      const updateData: UpdateCharacterInput = {
        slogan: data.slogan || undefined,
        publicInfo: {
          background: data.publicInfo.background,
          personality: data.publicInfo.personality || undefined,
          relationships: data.publicInfo.relationships,
        },
        secretInfo: {
          secrets: data.secretInfo.secrets.map((s) => ({
            id: crypto.randomUUID(),
            title: s.title,
            content: s.content,
            isRevealed: false,
          })),
        },
        tasks: data.tasks.map((t) => ({
          id: crypto.randomUUID(),
          title: t.title,
          description: t.description,
          isHidden: false,
          isRevealed: true,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        })),
        stats: data.stats.map((s) => ({
          id: crypto.randomUUID(),
          name: s.name,
          value: s.value,
          maxValue: s.maxValue,
        })),
      };

      const updateResult = await updateCharacter(characterId, updateData);

      if (!updateResult.success) {
        // 角色已建立但更新失敗 — 導航到編輯頁讓使用者手動完成
        toast.warning('角色已建立，但部分欄位更新失敗。請在編輯頁手動補全。');
        router.push(`/games/${gameId}/characters/${characterId}`);
        return;
      }

      toast.success(`角色「${data.name}」建立成功！`);
      router.push(`/games/${gameId}/characters/${characterId}`);
    } catch (error) {
      console.error('[CharacterImportTab] 建立失敗:', error);
      toast.error('角色建立失敗，請稍後重試');
      setStage('preview');
    }
  };

  // Parsing 中間狀態
  if (stage === 'parsing') {
    return (
      <div className={cn(GM_SECTION_CARD_CLASS, 'text-center py-16 space-y-4')}>
        <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />
        <div className="space-y-2">
          <p className="font-bold">AI 正在分析您的角色資料</p>
          <p className="text-sm text-muted-foreground">
            請勿重新整理頁面，解析可能需要 10-30 秒...
          </p>
        </div>
      </div>
    );
  }

  // Preview 階段
  if (stage === 'preview' && parseResult) {
    return (
      <CharacterImportPreview
        data={parseResult}
        isCreating={stage === 'creating'}
        onConfirm={handleConfirm}
        onReimport={handleReimport}
      />
    );
  }

  // Input 階段（預設）
  return (
    <CharacterImportInput
      isParsing={false}
      hasAiConfig={hasAiConfig}
      initialText={lastText}
      onSubmitText={handleSubmitText}
      onSubmitDocx={handleSubmitDocx}
    />
  );
}
