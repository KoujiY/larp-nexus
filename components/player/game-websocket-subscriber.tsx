'use client';

import { useState } from 'react';
import { useGameWebSocket } from '@/hooks/use-websocket';
import { toast } from 'sonner';
import type { BaseEvent } from '@/types/event';

interface GameWebSocketSubscriberProps {
  gameId: string;
}

export function GameWebSocketSubscriber({ gameId }: GameWebSocketSubscriberProps) {
  const [, setTick] = useState(0);
  
  useGameWebSocket(gameId, (event: BaseEvent) => {
    if (event.type === 'game.broadcast') {
      const { title, message } = event.payload as { title?: string; message?: string };
      toast.info(title || '系統廣播', { description: message });
    } else if (event.type === 'game.started' || event.type === 'game.reset' || event.type === 'game.ended') {
      toast.info('遊戲狀態變更', { description: '請刷新以取得最新狀態' });
      setTick((t) => t + 1);
    }
  });
  
  return null;
}

