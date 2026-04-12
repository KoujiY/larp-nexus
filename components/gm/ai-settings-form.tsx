'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Bot, ChevronDown, ChevronUp, Trash2, Loader2,
  CheckCircle2, KeyRound, AlertTriangle, Zap,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_SELECT_CLASS,
  GM_SECTION_CARD_CLASS,
  GM_SECTION_TITLE_CLASS,
  GM_CTA_BUTTON_CLASS,
} from '@/lib/styles/gm-form';
import {
  saveAiConfig, updateAiSettings, testAiConfig, deleteAiConfig,
} from '@/app/actions/ai-config';
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
    keyProvider?: string;
  };
}

export function AiSettingsForm({ initialConfig }: AiSettingsFormProps) {
  const router = useRouter();
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // API Key 區塊
  const [apiKey, setApiKey] = useState('');

  // Provider / 進階設定區塊
  const [provider, setProvider] = useState<ProviderId>(
    (initialConfig.provider as ProviderId) || 'openai'
  );
  const [baseUrl, setBaseUrl] = useState(initialConfig.baseUrl || AI_PROVIDERS[0].baseUrl);
  const [model, setModel] = useState(initialConfig.model || AI_PROVIDERS[0].defaultModel);

  const handleProviderChange = (newProvider: string) => {
    const p = newProvider as ProviderId;
    setProvider(p);
    const preset = AI_PROVIDERS.find((x) => x.id === p);
    if (preset) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.defaultModel);
    }
    if (p === 'custom') {
      setShowAdvanced(true);
    }
  };

  /** 儲存 API Key（同時寫入 provider/baseUrl/model） */
  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      toast.error('請輸入 API Key');
      return;
    }

    setIsSavingKey(true);
    try {
      const result = await saveAiConfig({
        provider,
        apiKey: apiKey.trim(),
        baseUrl,
        model,
      });

      if (result.success) {
        toast.success(initialConfig.hasApiKey ? 'API Key 已更新' : 'API Key 已儲存');
        setApiKey('');
        router.refresh();
      } else {
        toast.error(result.message || 'API Key 儲存失敗');
      }
    } catch {
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsSavingKey(false);
    }
  };

  /** 驗證目前的 AI 設定是否可連線 */
  const handleTest = async () => {
    setIsTesting(true);
    try {
      const result = await testAiConfig();

      if (result.success) {
        toast.success('連線驗證成功');
        router.refresh();
      } else {
        toast.error(result.message || '連線驗證失敗');
      }
    } catch {
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsTesting(false);
    }
  };

  /** 更新 Provider / Base URL / Model（不需要重新輸入 API Key） */
  const handleUpdateSettings = async () => {
    setIsUpdating(true);
    try {
      const result = await updateAiSettings({ provider, baseUrl, model });

      if (result.success) {
        toast.success('設定已更新');
        router.refresh();
      } else {
        toast.error(result.message || '更新失敗');
      }
    } catch {
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsUpdating(false);
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

  const isAnyLoading = isSavingKey || isUpdating || isTesting || isDeleting;

  // 判斷 provider/model 是否有變更（相對於已儲存的值）
  const settingsChanged =
    provider !== (initialConfig.provider || 'openai') ||
    baseUrl !== (initialConfig.baseUrl || AI_PROVIDERS[0].baseUrl) ||
    model !== (initialConfig.model || AI_PROVIDERS[0].defaultModel);

  // Provider 與 key 驗證時的 provider 不一致
  const keyProvider = initialConfig.keyProvider;
  const providerMismatch = initialConfig.hasApiKey && keyProvider && provider !== keyProvider;

  // 找出 keyProvider 的顯示名稱
  const keyProviderLabel = AI_PROVIDERS.find((p) => p.id === keyProvider)?.label || keyProvider;

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

      {/* ─── API Key 區塊 ─── */}
      <div className="space-y-2">
        <label className={GM_LABEL_CLASS}>
          <KeyRound className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
          API Key
        </label>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder={initialConfig.hasApiKey ? '已設定（輸入新的 Key 可更新）' : '輸入你的 API Key'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={isAnyLoading}
            className={cn(GM_INPUT_CLASS, 'h-11 flex-1')}
          />
          <button
            type="button"
            onClick={handleSaveKey}
            disabled={isAnyLoading || !apiKey.trim()}
            className={cn(GM_CTA_BUTTON_CLASS, 'shrink-0 h-11 px-5')}
          >
            {isSavingKey ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : initialConfig.hasApiKey ? (
              '更新 Key'
            ) : (
              '儲存'
            )}
          </button>
        </div>
      </div>

      {/* ─── 分隔線 ─── */}
      <div className="border-t border-border/30" />

      {/* ─── Provider / 進階設定區塊 ─── */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label className={GM_LABEL_CLASS}>Provider</label>
          <Select value={provider} onValueChange={handleProviderChange} disabled={isAnyLoading}>
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
          {/* Provider 與 key 不符提示 */}
          {providerMismatch && (
            <p className="flex items-center gap-1.5 text-xs text-destructive font-medium">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              目前的 API Key 是在 {keyProviderLabel} 驗證通過的，切換供應商後建議重新驗證連線。
            </p>
          )}
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
                disabled={isAnyLoading}
                className={GM_INPUT_CLASS}
              />
            </div>
            <div className="space-y-2">
              <label className={GM_LABEL_CLASS}>Model</label>
              <Input
                placeholder="gpt-4o"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={isAnyLoading}
                className={GM_INPUT_CLASS}
              />
            </div>
          </div>
        )}
      </div>

      {/* ─── 操作按鈕 ─── */}
      <div className="flex items-center justify-between pt-2">
        {initialConfig.hasApiKey ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isAnyLoading}
            className="flex items-center gap-1.5 text-xs font-bold text-destructive hover:text-destructive/80 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeleting ? '刪除中...' : '刪除設定'}
          </button>
        ) : (
          <div />
        )}
        {initialConfig.hasApiKey && (
          <div className="flex items-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={isAnyLoading}
                    className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    驗證連線
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  使用已儲存的資料驗證，請先更新 Key/設定
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              type="button"
              onClick={handleUpdateSettings}
              disabled={isAnyLoading || !settingsChanged}
              className={GM_CTA_BUTTON_CLASS}
            >
              {isUpdating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  更新中...
                </span>
              ) : (
                '更新設定'
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
