'use client';

import { useState } from 'react';
import { Eye, Edit3, RotateCcw, Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  GM_INPUT_CLASS,
  GM_SECTION_CARD_CLASS,
  GM_SECTION_TITLE_CLASS,
  GM_CTA_BUTTON_CLASS,
  GM_CANCEL_BUTTON_CLASS,
} from '@/lib/styles/gm-form';
import { cn } from '@/lib/utils';
import type { CharacterImportResult } from '@/lib/ai/schemas/character-import';

interface CharacterImportPreviewProps {
  data: CharacterImportResult;
  isCreating: boolean;
  onConfirm: (data: CharacterImportResult) => void;
  onReimport: () => void;
}

export function CharacterImportPreview({
  data,
  isCreating,
  onConfirm,
  onReimport,
}: CharacterImportPreviewProps) {
  const [editData, setEditData] = useState<CharacterImportResult>(data);
  const [editingField, setEditingField] = useState<string | null>(null);

  const updateField = <K extends keyof CharacterImportResult>(
    key: K,
    value: CharacterImportResult[K]
  ) => {
    setEditData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-2')}>
        <div className="flex items-center gap-2 text-primary">
          <Eye className="h-5 w-5" />
          <h3 className="text-lg font-bold">預覽解析結果</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          確認 AI 解析的內容，部分欄位可點擊編輯按鈕微調。
        </p>
      </div>

      {/* 基本資訊 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-4')}>
        <h4 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          基本資訊
        </h4>

        <PreviewField
          label="角色名稱"
          value={editData.name}
          isEditing={editingField === 'name'}
          onEdit={() => setEditingField('name')}
          onDone={() => setEditingField(null)}
          renderEditor={
            <Input
              value={editData.name}
              onChange={(e) => updateField('name', e.target.value)}
              className={cn(GM_INPUT_CLASS, 'h-10')}
              autoFocus
            />
          }
        />

        <PreviewField
          label="角色描述"
          value={editData.description}
          isEditing={editingField === 'description'}
          onEdit={() => setEditingField('description')}
          onDone={() => setEditingField(null)}
          renderEditor={
            <Textarea
              value={editData.description}
              onChange={(e) => updateField('description', e.target.value)}
              className={cn(GM_INPUT_CLASS, 'h-auto py-2 resize-none')}
              rows={3}
              autoFocus
            />
          }
        />

        <PreviewField
          label="標語"
          value={editData.slogan}
          isEditing={editingField === 'slogan'}
          onEdit={() => setEditingField('slogan')}
          onDone={() => setEditingField(null)}
          renderEditor={
            <Input
              value={editData.slogan || ''}
              onChange={(e) => updateField('slogan', e.target.value || null)}
              className={cn(GM_INPUT_CLASS, 'h-10')}
              autoFocus
            />
          }
        />
      </div>

      {/* 背景故事 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-3')}>
        <h4 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          背景故事
        </h4>
        {editData.publicInfo.background.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 italic">未偵測到</p>
        ) : (
          editData.publicInfo.background.map((block, i) => (
            <div key={i} className={block.type === 'title' ? 'font-bold text-sm' : 'text-sm text-muted-foreground whitespace-pre-wrap'}>
              {block.content}
            </div>
          ))
        )}
      </div>

      {/* 性格 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-3')}>
        <h4 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          性格
        </h4>
        <p className="text-sm">
          {editData.publicInfo.personality || <span className="text-muted-foreground/50 italic">未偵測到</span>}
        </p>
      </div>

      {/* 關係 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-3')}>
        <h4 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          人物關係
        </h4>
        {editData.publicInfo.relationships.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 italic">未偵測到</p>
        ) : (
          <div className="space-y-2">
            {editData.publicInfo.relationships.map((rel, i) => (
              <div key={i} className="text-sm">
                <span className="font-semibold">{rel.targetName}</span>
                <span className="text-muted-foreground"> — {rel.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 隱藏資訊 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-3')}>
        <h4 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          隱藏資訊
        </h4>
        {editData.secretInfo.secrets.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 italic">未偵測到</p>
        ) : (
          <div className="space-y-3">
            {editData.secretInfo.secrets.map((secret, i) => (
              <div key={i} className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm font-bold">{secret.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{secret.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 任務 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-3')}>
        <h4 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          任務
        </h4>
        {editData.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 italic">未偵測到</p>
        ) : (
          <div className="space-y-2">
            {editData.tasks.map((task, i) => (
              <div key={i} className="text-sm">
                <span className="font-semibold">{task.title}</span>
                <span className="text-muted-foreground"> — {task.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 數值 */}
      <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-3')}>
        <h4 className={GM_SECTION_TITLE_CLASS}>
          <span className="w-1 h-5 bg-primary rounded-full" />
          數值
        </h4>
        {editData.stats.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 italic">未偵測到</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {editData.stats.map((stat, i) => (
              <div key={i} className="p-3 bg-muted/30 rounded-lg text-center">
                <p className="text-xs text-muted-foreground font-bold uppercase">{stat.name}</p>
                <p className="text-lg font-extrabold mt-1">
                  {stat.value}
                  {stat.maxValue != null && (
                    <span className="text-sm text-muted-foreground font-normal">/{stat.maxValue}</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky bar */}
      <div className="sticky bottom-0 z-10 -mx-8 px-8 py-6 bg-background/80 backdrop-blur-sm border-t border-border/10">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onReimport}
            disabled={isCreating}
            className={cn(GM_CANCEL_BUTTON_CLASS, 'flex items-center gap-1.5')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重新匯入
          </button>
          <button
            type="button"
            onClick={() => onConfirm(editData)}
            disabled={isCreating || !editData.name.trim()}
            className={cn(GM_CTA_BUTTON_CLASS, 'flex items-center gap-2')}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                建立中...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                確認建立
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 可編輯的預覽欄位 */
function PreviewField({
  label,
  value,
  isEditing,
  onEdit,
  onDone,
  renderEditor,
}: {
  label: string;
  value: string | null;
  isEditing: boolean;
  onEdit: () => void;
  onDone: () => void;
  renderEditor: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
        {isEditing ? (
          <button
            type="button"
            onClick={onDone}
            className="text-xs text-primary font-bold cursor-pointer hover:underline"
          >
            完成
          </button>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {isEditing ? (
        renderEditor
      ) : (
        <p className="text-sm font-semibold">
          {value || <span className="text-muted-foreground/50 italic font-normal">未偵測到</span>}
        </p>
      )}
    </div>
  );
}
