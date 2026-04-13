'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Bot, Trash2, Loader2,
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
 * 新增 provider 只需在此陣列加一筆，並在 PROVIDER_MODELS 加入對應的模型清單。
 */
const AI_PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI（付費方案）',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-nano',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3-flash-preview',
  },
  {
    id: 'custom',
    label: '自訂 (Custom)',
    baseUrl: '',
    defaultModel: '',
  },
] as const;

/** 各 provider 的常用模型清單 */
const PROVIDER_MODELS: Record<string, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano（推薦）' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
  ],
  gemini: [
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash（推薦）' },
    { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro（付費方案）' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro（付費方案）' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2 Flash（付費方案）' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2 Flash Lite（付費方案）' },
  ],
};

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

  // API Key 區塊
  const [apiKey, setApiKey] = useState('');

  // Provider / Model 區塊
  const [provider, setProvider] = useState<ProviderId>(
    (initialConfig.provider as ProviderId) || 'openai'
  );
  const [baseUrl, setBaseUrl] = useState(initialConfig.baseUrl || AI_PROVIDERS[0].baseUrl);
  const [model, setModel] = useState(initialConfig.model || AI_PROVIDERS[0].defaultModel);

  const isKnownProvider = provider !== 'custom';
  const modelOptions = PROVIDER_MODELS[provider];

  const handleProviderChange = (newProvider: string) => {
    const p = newProvider as ProviderId;
    setProvider(p);
    const preset = AI_PROVIDERS.find((x) => x.id === p);
    if (preset) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.defaultModel);
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

      {/* ─── Provider / Model 區塊 ─── */}
      <div className="space-y-4">
        {/* Provider */}
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
          {providerMismatch && (
            <p className="flex items-center gap-1.5 text-xs text-destructive font-medium">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              目前的 API Key 是在 {keyProviderLabel} 驗證通過的，切換供應商後建議重新驗證連線。
            </p>
          )}
        </div>

        {/* Model — known provider: 下拉選單 / custom: text input */}
        {isKnownProvider && modelOptions ? (
          <div className="space-y-2">
            <label className={GM_LABEL_CLASS}>Model</label>
            <Select value={model} onValueChange={setModel} disabled={isAnyLoading}>
              <SelectTrigger className={GM_SELECT_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className={GM_LABEL_CLASS}>Base URL</label>
              <Input
                placeholder="https://api.example.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                disabled={isAnyLoading}
                className={GM_INPUT_CLASS}
              />
            </div>
            <div className="space-y-2">
              <label className={GM_LABEL_CLASS}>Model</label>
              <Input
                placeholder="model-name"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={isAnyLoading}
                className={GM_INPUT_CLASS}
              />
            </div>
          </>
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
