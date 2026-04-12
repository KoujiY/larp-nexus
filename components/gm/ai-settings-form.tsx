'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Bot, ChevronDown, ChevronUp, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_SELECT_CLASS,
  GM_SECTION_CARD_CLASS,
  GM_SECTION_TITLE_CLASS,
  GM_CTA_BUTTON_CLASS,
} from '@/lib/styles/gm-form';
import { saveAiConfig, deleteAiConfig } from '@/app/actions/ai-config';
import { cn } from '@/lib/utils';

/**
 * AI Provider 預設設定
 *
 * 新增 provider 只需在此陣列加一筆資料。
 * model 為預設值，使用者可自由修改。
 */
const AI_PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
  },
  {
    id: 'custom',
    label: '自訂 (Custom)',
    baseUrl: '',
    defaultModel: '',
  },
] as const;

type ProviderId = (typeof AI_PROVIDERS)[number]['id'];

interface AiSettingsFormProps {
  initialConfig: {
    hasApiKey: boolean;
    provider?: string;
    baseUrl?: string;
    model?: string;
  };
}

export function AiSettingsForm({ initialConfig }: AiSettingsFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 表單狀態
  const [provider, setProvider] = useState<ProviderId>(
    (initialConfig.provider as ProviderId) || 'openai'
  );
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(initialConfig.baseUrl || AI_PROVIDERS[0].baseUrl);
  const [model, setModel] = useState(initialConfig.model || AI_PROVIDERS[0].defaultModel);

  // Provider 切換時自動帶入預設值
  const handleProviderChange = (newProvider: string) => {
    const p = newProvider as ProviderId;
    setProvider(p);
    const preset = AI_PROVIDERS.find((x) => x.id === p);
    if (preset) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.defaultModel);
    }
    // custom 時展開進階設定
    if (p === 'custom') {
      setShowAdvanced(true);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast.error('請輸入 API Key');
      return;
    }

    setIsLoading(true);
    try {
      const result = await saveAiConfig({
        provider,
        apiKey: apiKey.trim(),
        baseUrl,
        model,
      });

      if (result.success) {
        toast.success('AI 設定已儲存');
        setApiKey(''); // 清除輸入的 key
        router.refresh();
      } else {
        toast.error(result.message || 'AI 設定儲存失敗');
      }
    } catch {
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAiConfig();
      if (result.success) {
        toast.success('AI 設定已刪除');
        setProvider('openai');
        setBaseUrl(AI_PROVIDERS[0].baseUrl);
        setModel(AI_PROVIDERS[0].defaultModel);
        setApiKey('');
        router.refresh();
      } else {
        toast.error(result.message || '刪除失敗');
      }
    } catch {
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className={cn(GM_SECTION_CARD_CLASS, 'space-y-6')}>
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <h2 className={GM_SECTION_TITLE_CLASS}>
          <Bot className="h-5 w-5 text-primary" />
          AI 服務設定
        </h2>
        {initialConfig.hasApiKey && (
          <div className="flex items-center gap-2 text-xs text-success font-bold">
            <CheckCircle2 className="h-4 w-4" />
            已設定
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        設定 AI 服務以啟用角色匯入功能。您的 API Key 將加密儲存，系統不會保留明文。
      </p>

      {/* Provider 選擇 */}
      <div className="space-y-2">
        <label className={GM_LABEL_CLASS}>Provider</label>
        <Select value={provider} onValueChange={handleProviderChange}>
          <SelectTrigger className={GM_SELECT_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_PROVIDERS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <label className={GM_LABEL_CLASS}>API Key</label>
        <Input
          type="password"
          placeholder={initialConfig.hasApiKey ? '已設定（輸入新的 Key 可更新）' : '輸入你的 API Key'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={isLoading}
          className={cn(GM_INPUT_CLASS, 'h-12')}
        />
      </div>

      {/* 進階設定 */}
      <button
        type="button"
        onClick={() => setShowAdvanced((prev) => !prev)}
        className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        進階設定
      </button>

      {showAdvanced && (
        <div className="space-y-4 pl-4 border-l-2 border-border/30">
          <div className="space-y-2">
            <label className={GM_LABEL_CLASS}>Base URL</label>
            <Input
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={isLoading}
              className={GM_INPUT_CLASS}
            />
          </div>
          <div className="space-y-2">
            <label className={GM_LABEL_CLASS}>Model</label>
            <Input
              placeholder="gpt-4o"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isLoading}
              className={GM_INPUT_CLASS}
            />
          </div>
        </div>
      )}

      {/* 操作按鈕 */}
      <div className="flex items-center justify-between pt-2">
        {initialConfig.hasApiKey ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || isLoading}
            className="flex items-center gap-1.5 text-xs font-bold text-destructive hover:text-destructive/80 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeleting ? '刪除中...' : '刪除設定'}
          </button>
        ) : (
          <div />
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={isLoading || (!apiKey.trim() && !initialConfig.hasApiKey)}
          className={GM_CTA_BUTTON_CLASS}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              驗證中...
            </span>
          ) : initialConfig.hasApiKey ? (
            '更新設定'
          ) : (
            '儲存設定'
          )}
        </button>
      </div>
    </section>
  );
}
