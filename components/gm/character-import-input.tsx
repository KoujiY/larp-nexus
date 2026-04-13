'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import {
  Upload, FileText, Sparkles, Loader2, ChevronDown, Info, BookOpen,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
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
  initialInputMode?: 'text' | 'docx';
  includeSecret: boolean;
  onIncludeSecretChange: (value: boolean) => void;
  allowAiFill: boolean;
  onAllowAiFillChange: (value: boolean) => void;
  customPrompt: string;
  onCustomPromptChange: (value: string) => void;
  onSubmitText: (text: string) => void;
  onSubmitDocx: (formData: FormData) => void;
}

export function CharacterImportInput({
  isParsing,
  hasAiConfig,
  initialText = '',
  initialInputMode = 'text',
  includeSecret,
  onIncludeSecretChange,
  allowAiFill,
  onAllowAiFillChange,
  customPrompt,
  onCustomPromptChange,
  onSubmitText,
  onSubmitDocx,
}: CharacterImportInputProps) {
  const [text, setText] = useState(initialText);
  const [inputMode, setInputMode] = useState<'text' | 'docx'>(initialInputMode);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!file.name.endsWith('.docx')) {
      toast.error('僅支援 .docx 格式');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSelectedFile(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('檔案大小超過上限 (5MB)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleDocxSubmit = () => {
    if (!selectedFile) {
      toast.error('請先選擇 .docx 檔案');
      return;
    }
    const formData = new FormData();
    formData.append('file', selectedFile);
    onSubmitDocx(formData);
  };

  const canSubmit = inputMode === 'text'
    ? !isParsing && hasAiConfig && !!text.trim()
    : !isParsing && hasAiConfig && !!selectedFile;

  return (
    <div className={cn(GM_SECTION_CARD_CLASS, 'space-y-5')}>
      {/* ─── 標題列 ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 角色匯入
          </h3>
          {/* 桌面版 mode toggle */}
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
          <br />
          強烈建議使用標題以增進 AI 分類的準確度，可參考格式範本中推薦的標題名稱。
        </p>
      </div>

      {/* ─── AI 選項：Toggle x2 + 摺疊自訂提示 ─── */}
      <TooltipProvider>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-1.5">
                <label htmlFor="include-secret" className="text-sm font-medium cursor-pointer">
                  包含隱藏資訊
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    啟用後將解析角色紙中的秘密與隱藏任務
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                id="include-secret"
                checked={includeSecret}
                onCheckedChange={onIncludeSecretChange}
                disabled={isParsing}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-1.5">
                <label htmlFor="allow-ai-fill" className="text-sm font-medium cursor-pointer">
                  允許 AI 補足欄位
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    允許 AI 根據角色形象推測並填入原文中缺少的欄位
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                id="allow-ai-fill"
                checked={allowAiFill}
                onCheckedChange={onAllowAiFillChange}
                disabled={isParsing}
              />
            </div>
          </div>

          {/* 摺疊：自訂提示（卡片式） */}
          <div className={cn(
            'rounded-xl border border-border/10 shadow-sm transition-all',
            showCustomPrompt && 'shadow-md',
            customPrompt.trim() && !showCustomPrompt && 'border-primary/20',
          )}>
            <button
              type="button"
              onClick={() => setShowCustomPrompt((prev) => !prev)}
              className="w-full p-4 flex items-center justify-between gap-2 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <ChevronDown className={cn(
                  'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
                  showCustomPrompt && 'rotate-180',
                )} />
                <span className="text-sm font-bold">自訂提示</span>
                {customPrompt.trim() && !showCustomPrompt && (
                  <span className="text-xs text-primary/80 font-medium">（已填寫）</span>
                )}
              </div>
            </button>
            {showCustomPrompt && (
              <div className="mx-4 pb-4 pt-3 border-t border-border/10 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                <Textarea
                  placeholder="輸入額外的指示給 AI，例如：「性格描述請拆成多個特質條列」..."
                  value={customPrompt}
                  onChange={(e) => onCustomPromptChange(e.target.value)}
                  disabled={isParsing}
                  rows={3}
                  className={cn(GM_INPUT_CLASS, 'h-auto py-3 resize-y min-h-[72px] text-sm')}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {customPrompt.length} / 500
                </p>
              </div>
            )}
          </div>
        </div>
      </TooltipProvider>

      {/* ─── 手機版 mode toggle ─── */}
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

      {/* ─── 輸入區（隨模式切換） ─── */}
      {inputMode === 'text' ? (
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
      ) : (
        <div className="space-y-2">
          <label className={GM_LABEL_CLASS}>上傳檔案</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            onChange={handleFileChange}
            disabled={isParsing || !hasAiConfig}
            className="sr-only"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing || !hasAiConfig}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer shrink-0',
                'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none'
              )}
            >
              <Upload className="h-4 w-4" />
              選擇檔案
            </button>
            <p className="text-xs text-muted-foreground truncate">
              {selectedFile
                ? <>已選擇：<span className="font-semibold text-foreground">{selectedFile.name}</span></>
                : '僅支援 .docx 格式，最大 5MB'}
            </p>
          </div>
        </div>
      )}

      {/* ─── 底部列：格式範本（左） + 開始解析（右） ─── */}
      <div className="flex items-center justify-between pt-1">
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <BookOpen className="h-3.5 w-3.5" />
              格式範本
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[360px] sm:w-[400px] overflow-y-auto [&>button]:hidden">
            <SheetHeader className="sr-only">
              <SheetTitle>格式範本</SheetTitle>
            </SheetHeader>
            <div className="px-4 pt-6 pb-6 space-y-6">
              {/* 推薦標題 */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold">推薦標題</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  使用以下標題能讓 AI 更準確地分類內容。標題名稱不需要完全一致，AI 會根據內容性質判斷。
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { title: '背景', desc: '經歷、故事、事件' },
                    { title: '性格', desc: '性格特質、行為傾向' },
                    { title: '人物關係', desc: '對特定人物的認知' },
                    { title: '目標', desc: '任務、使命' },
                    { title: '隱藏資訊', desc: '秘密、只有自己知道' },
                    { title: '數值', desc: 'STR、HP 等數值' },
                  ].map((item) => (
                    <div key={item.title} className="p-2.5 bg-muted/30 rounded-lg border border-border/10">
                      <p className="text-sm font-bold">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 建議格式 */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold">建議格式範本</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  AI 也能處理自由格式的角色文字，但格式越接近範本，解析結果越準確。
                </p>
                <div className="p-4 bg-muted/30 rounded-lg text-[13px] text-muted-foreground/90 font-mono whitespace-pre-wrap leading-[1.8] border border-border/10">
{`角色名：[角色名稱]
「[標語/座右銘]」

背景
[背景故事段落...]

性格
[性格描述]

人物關係
[角色名稱] — [關係描述]
[角色名稱] — [關係描述]

【隱藏資訊】
[只有 GM 和角色本人知道的秘密]

【目標】
- [任務描述]

數值
力量: 7/10
智力: 8`}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <button
          type="button"
          onClick={inputMode === 'text' ? handleTextSubmit : handleDocxSubmit}
          disabled={!canSubmit}
          className={cn(GM_CTA_BUTTON_CLASS, 'px-6')}
        >
          {isParsing ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              分析中...
            </span>
          ) : (
            '開始解析'
          )}
        </button>
      </div>
    </div>
  );
}
