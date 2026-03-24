'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { pushEvent } from '@/app/actions/events';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';

interface GameBroadcastPanelProps {
  gameId: string;
  characters: Array<{ id: string; name: string }>;
}

export function GameBroadcastPanel({ gameId, characters }: GameBroadcastPanelProps) {
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
      } else {
        toast.error(res.message || '推送失敗');
      }
    });
  };

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">即時推播</h3>
          <p className="text-sm text-muted-foreground">推送給劇本內玩家或單一角色</p>
        </div>
      </div>

      <Tabs value={type} onValueChange={(v) => setType(v as 'broadcast' | 'character')}>
        <TabsList className="w-full">
          <TabsTrigger value="broadcast" className="w-1/2">劇本廣播</TabsTrigger>
          <TabsTrigger value="character" className="w-1/2">單一角色</TabsTrigger>
        </TabsList>

        <TabsContent value="broadcast" className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label>
              標題 <span className="text-destructive">*</span>
            </Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：系統公告" />
          </div>
          <div className="space-y-2">
            <Label>訊息</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="要推送的內容（可留空）" />
          </div>
          <Button onClick={handleSubmit} disabled={isPending || !title.trim()}>推送廣播</Button>
        </TabsContent>

        <TabsContent value="character" className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label>
              目標角色 <span className="text-destructive">*</span>
            </Label>
            <Select
              value={targetCharacterId}
              onValueChange={(v) => setTargetCharacterId(v)}
            >
              <SelectTrigger className="w-full justify-between text-left">
                <SelectValue placeholder="選擇角色" />
              </SelectTrigger>
              <SelectContent>
                {characters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.id.slice(0, 6)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              標題 <span className="text-destructive">*</span>
            </Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：密語提醒" />
          </div>
          <div className="space-y-2">
            <Label>訊息</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="要推送的內容（可留空）" />
          </div>
          <Button onClick={handleSubmit} disabled={isPending || !title.trim() || !targetCharacterId.trim()}>推送給角色</Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

