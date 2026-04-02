'use client';

import { useState, useTransition } from 'react';
import { Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { pushEvent } from '@/app/actions/events';
import { PillToggle } from '@/components/gm/pill-toggle';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { GM_LABEL_CLASS } from '@/lib/styles/gm-form';

interface GameBroadcastPanelProps {
  gameId: string;
  characters: Array<{ id: string; name: string }>;
  /** 廣播成功後的回呼（用於刷新 Event Log） */
  onBroadcastSent?: () => void;
}

/**
 * Runtime 控制台 — 快速廣播面板
 *
 * 支援全體廣播和指定角色推播。
 * 視覺風格：自製 pill toggle + GM 表單樣式 + gradient 發送按鈕
 */
export function GameBroadcastPanel({ gameId, characters, onBroadcastSent }: GameBroadcastPanelProps) {
  const [type, setType] = useState<'broadcast' | 'character'>('broadcast');
  const [targetCharacterId, setTargetCharacterId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error('標題為必填');
      return;
    }
    if (type === 'character' && !targetCharacterId.trim()) {
      toast.error('請選擇角色');
      return;
    }

    startTransition(async () => {
      const res = await pushEvent({
        type,
        gameId,
        targetCharacterId: type === 'character' ? targetCharacterId.trim() : undefined,
        title: title.trim(),
        message: message.trim(),
      });
      if (res.success) {
        toast.success('已推送');
        setMessage('');
        setTitle('');
        if (type === 'character') setTargetCharacterId('');
        onBroadcastSent?.();
      } else {
        toast.error(res.message || '推送失敗');
      }
    });
  };

  const canSubmit = title.trim() && (type === 'broadcast' || targetCharacterId.trim());

  return (
    <div className="bg-card p-6 rounded-xl border border-border/40 shadow-sm">
      {/* Header */}
      <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary" />
        快速廣播
      </h3>

      {/* Mode Toggle */}
      <div className="mb-6">
        <PillToggle
          options={[
            { value: 'broadcast', label: '全體廣播' },
            { value: 'character', label: '指定角色' },
          ]}
          value={type}
          onValueChange={setType}
        />
      </div>

      {/* Form */}
      <div className="space-y-4">
        {/* 指定角色模式：角色選擇 */}
        {type === 'character' && (
          <div>
            <label className={GM_LABEL_CLASS}>目標角色</label>
            <Select
              value={targetCharacterId}
              onValueChange={setTargetCharacterId}
            >
              <SelectTrigger className="w-full bg-muted border-none rounded-lg h-10 text-sm font-semibold focus:ring-1 focus:ring-primary">
                <SelectValue placeholder="選擇角色" />
              </SelectTrigger>
              <SelectContent>
                {characters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 標題 */}
        <div>
          <label className={GM_LABEL_CLASS}>標題</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="輸入廣播標題..."
            className="w-full bg-muted border-none rounded-lg text-sm px-4 py-2.5 focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>

        {/* 訊息 */}
        <div>
          <label className={GM_LABEL_CLASS}>訊息內容</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="在此輸入要傳送給玩家的訊息..."
            rows={4}
            className="w-full bg-muted border-none rounded-lg text-sm px-4 py-2.5 focus:ring-1 focus:ring-primary focus:outline-none resize-none"
          />
        </div>

        {/* 發送按鈕 */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !canSubmit}
          className="w-full py-3 bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-bold rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? '發送中...' : '發送廣播'}
        </button>
      </div>
    </div>
  );
}
