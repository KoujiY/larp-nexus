'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, FileText, Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_CTA_BUTTON_CLASS,
  GM_SECTION_CARD_CLASS,
} from '@/lib/styles/gm-form';
import { cn } from '@/lib/utils';

interface CharacterImportInputProps {
  isParsing: boolean;
  hasAiConfig: boolean;
  initialText?: string;
  onSubmitText: (text: string) => void;
  onSubmitDocx: (formData: FormData) => void;
}

export function CharacterImportInput({
  isParsing,
  hasAiConfig,
  initialText = '',
  onSubmitText,
  onSubmitDocx,
}: CharacterImportInputProps) {
  const [text, setText] = useState(initialText);
  const [inputMode, setInputMode] = useState<'text' | 'docx'>('text');
  const [showGuide, setShowGuide] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextSubmit = () => {
    if (!text.trim()) {
      toast.error('請輸入角色資料文字');
      return;
    }
    onSubmitText(text);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      toast.error('僅支援 .docx 格式');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('檔案大小超過上限 (5MB)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    onSubmitDocx(formData);
  };

  return (
    <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-6')}>
      {/* 標題列 — 桌面版 toggle 在右側 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 角色匯入
          </h3>
          {/* 桌面版 toggle */}
          <div className="hidden md:flex items-center rounded-lg bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => setInputMode('text')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                inputMode === 'text'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              貼上文字
            </button>
            <button
              type="button"
              onClick={() => setInputMode('docx')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                inputMode === 'docx'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              上傳 .docx
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          貼上角色文字資料或上傳 .docx 檔案，AI 將自動解析並填入角色欄位。
        </p>
      </div>

      {/* 手機版分頁列 */}
      <div className="flex md:hidden rounded-lg bg-muted/50 p-0.5">
        <button
          type="button"
          onClick={() => setInputMode('text')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors cursor-pointer',
            inputMode === 'text'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <FileText className="h-4 w-4" />
          貼上文字
        </button>
        <button
          type="button"
          onClick={() => setInputMode('docx')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors cursor-pointer',
            inputMode === 'docx'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Upload className="h-4 w-4" />
          上傳 .docx
        </button>
      </div>

      {/* 內容區 */}
      {inputMode === 'text' ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className={GM_LABEL_CLASS}>角色資料文字</label>
            <Textarea
              placeholder="在此貼上角色的背景故事、數值、任務等資料..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isParsing}
              rows={12}
              className={cn(GM_INPUT_CLASS, 'h-auto py-4 resize-y min-h-[200px]')}
            />
            <p className="text-xs text-muted-foreground text-right">
              {text.length.toLocaleString()} / 50,000
            </p>
          </div>

          <button
            type="button"
            onClick={handleTextSubmit}
            disabled={isParsing || !hasAiConfig || !text.trim()}
            className={cn(GM_CTA_BUTTON_CLASS, 'w-full py-3')}
          >
            {isParsing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在分析...
              </span>
            ) : (
              '開始解析'
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className={GM_LABEL_CLASS}>.docx 檔案</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            onChange={handleFileChange}
            disabled={isParsing || !hasAiConfig}
            className="block w-full text-sm text-muted-foreground
              file:mr-4 file:py-2 file:px-4
              file:rounded-lg file:border-0
              file:text-sm file:font-semibold
              file:bg-primary file:text-primary-foreground
              hover:file:bg-primary/90
              file:cursor-pointer cursor-pointer
              disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            僅支援 .docx 格式，最大 5MB
          </p>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowGuide((prev) => !prev)}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showGuide && 'rotate-180')} />
          建議格式範本
        </button>
        {showGuide && (
          <div className="mt-3 p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground space-y-2 font-mono whitespace-pre-wrap">
{`角色名：[角色名稱]
「[標語/座右銘]」

[背景故事段落...]

性格：[性格描述]

關係：
- [角色名稱] — [關係描述]

【隱藏資訊】
[只有 GM 和角色本人知道的秘密]

【目標/任務】
- [任務描述]

數值：
力量: 7/10
智力: 8`}
          </div>
        )}
      </div>
    </div>
  );
}
