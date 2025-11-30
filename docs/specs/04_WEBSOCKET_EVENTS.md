# WebSocket 事件格式規範

## 版本：v1.0
## 更新日期：2025-11-29
## WebSocket 服務：Pusher

---

## 1. 總覽

本專案使用 **Pusher** 作為 WebSocket 服務，實現 GM 端到玩家端的即時事件推送。

### 1.1 Pusher 配置

- **App ID**：從環境變數讀取
- **Key**：公開金鑰（前端使用）
- **Secret**：私密金鑰（後端使用）
- **Cluster**：依部署區域選擇（建議 `ap3` 亞太區）

### 1.2 頻道類型

| 頻道類型 | 命名格式 | 說明 | 認證需求 |
|---------|---------|------|----------|
| Private Channel | `private-character-{characterId}` | 單一角色專屬頻道 | 需 Pusher Auth |
| Private Channel | `private-game-{gameId}` | 劇本廣播頻道 | 需 Pusher Auth |

**注意**：玩家端不需登入，但需透過 Pusher Auth Endpoint 驗證頻道存取權限。

---

## 2. 事件類型定義

所有事件遵循以下基礎結構：

```typescript
interface BaseEvent {
  type: string;           // 事件類型
  timestamp: number;      // Unix timestamp (ms)
  payload: any;           // 事件資料
}
```

---

### 2.1 角色更新事件 (role.updated)

當 GM 更新角色資訊時觸發。

**頻道**：`private-character-{characterId}`

**事件格式**
```typescript
interface RoleUpdatedEvent extends BaseEvent {
  type: 'role.updated';
  payload: {
    characterId: string;
    updates: {
      name?: string;
      avatar?: string;
      publicInfo?: Partial<PublicInfo>;
      tasks?: Array<Task>;
      items?: Array<Item>;
    };
  };
}
```

**範例**
```json
{
  "type": "role.updated",
  "timestamp": 1701234567890,
  "payload": {
    "characterId": "507f1f77bcf86cd799439013",
    "updates": {
      "publicInfo": {
        "background": "更新後的背景故事..."
      }
    }
  }
}
```

**前端處理**
- 玩家端接收後，更新角色卡顯示內容
- 顯示 Toast 通知：「角色資訊已更新」

---

### 2.2 劇本廣播事件 (game.broadcast)

GM 向劇本所有玩家廣播訊息。

**頻道**：`private-game-{gameId}`

**事件格式**
```typescript
interface GameBroadcastEvent extends BaseEvent {
  type: 'game.broadcast';
  payload: {
    gameId: string;
    title: string;
    message: string;
    priority: 'low' | 'normal' | 'high';  // 優先級
  };
}
```

**範例**
```json
{
  "type": "game.broadcast",
  "timestamp": 1701234567890,
  "payload": {
    "gameId": "507f1f77bcf86cd799439012",
    "title": "劇情進展",
    "message": "午夜鐘聲響起，所有人請前往大廳集合。",
    "priority": "high"
  }
}
```

**前端處理**
- 顯示全螢幕通知（priority=high）
- 或一般 Toast 通知（priority=normal/low）
- 可播放音效

---

### 2.3 秘密解鎖事件 (role.secretUnlocked)

當 GM 手動解鎖或玩家 PIN 解鎖成功時觸發。

**頻道**：`private-character-{characterId}`

**事件格式**
```typescript
interface SecretUnlockedEvent extends BaseEvent {
  type: 'role.secretUnlocked';
  payload: {
    characterId: string;
    secretInfo: {
      secrets: Array<{
        title: string;
        content: string;
      }>;
      hiddenGoals: string;
    };
  };
}
```

**範例**
```json
{
  "type": "role.secretUnlocked",
  "timestamp": 1701234567890,
  "payload": {
    "characterId": "507f1f77bcf86cd799439013",
    "secretInfo": {
      "secrets": [
        {
          "title": "真實身份",
          "content": "你其實是莊園的繼承人..."
        }
      ],
      "hiddenGoals": "在午夜前找到遺囑"
    }
  }
}
```

**前端處理**
- 顯示解鎖動畫
- 展開秘密區塊
- 顯示 Toast：「秘密已解鎖」

---

### 2.4 角色私訊事件 (role.message)

GM 向特定角色發送私人訊息。

**頻道**：`private-character-{characterId}`

**事件格式**
```typescript
interface RoleMessageEvent extends BaseEvent {
  type: 'role.message';
  payload: {
    characterId: string;
    from: string;           // 發送者名稱（通常是 "GM"）
    title: string;
    message: string;
    style?: 'info' | 'warning' | 'success' | 'error';
  };
}
```

**範例**
```json
{
  "type": "role.message",
  "timestamp": 1701234567890,
  "payload": {
    "characterId": "507f1f77bcf86cd799439013",
    "from": "GM",
    "title": "線索提示",
    "message": "你注意到管家的表情有些不對勁...",
    "style": "info"
  }
}
```

**前端處理**
- 顯示訊息通知
- 可選擇性記錄到「訊息歷史」區

---

### 2.5 任務更新事件 (role.taskUpdated)

GM 新增或更新任務。

**頻道**：`private-character-{characterId}`

**事件格式**
```typescript
interface TaskUpdatedEvent extends BaseEvent {
  type: 'role.taskUpdated';
  payload: {
    characterId: string;
    task: {
      id: string;
      title: string;
      description: string;
      status: 'pending' | 'in-progress' | 'completed';
      createdAt?: string;
    };
    action: 'added' | 'updated' | 'deleted';
  };
}
```

**範例**
```json
{
  "type": "role.taskUpdated",
  "timestamp": 1701234567890,
  "payload": {
    "characterId": "507f1f77bcf86cd799439013",
    "task": {
      "id": "task-002",
      "title": "調查圖書館",
      "description": "仔細搜索圖書館中的古老書籍",
      "status": "pending"
    },
    "action": "added"
  }
}
```

**前端處理**
- 根據 `action` 更新任務列表
- 若為 `added`，顯示 Toast：「新任務：{title}」
- 播放提示音效

---

### 2.6 道具更新事件 (role.inventoryUpdated)

GM 新增或移除道具。

**頻道**：`private-character-{characterId}`

**事件格式**
```typescript
interface InventoryUpdatedEvent extends BaseEvent {
  type: 'role.inventoryUpdated';
  payload: {
    characterId: string;
    item: {
      id: string;
      name: string;
      description: string;
      imageUrl?: string;
      acquiredAt?: string;
    };
    action: 'added' | 'removed';
  };
}
```

**範例**
```json
{
  "type": "role.inventoryUpdated",
  "timestamp": 1701234567890,
  "payload": {
    "characterId": "507f1f77bcf86cd799439013",
    "item": {
      "id": "item-002",
      "name": "神秘鑰匙",
      "description": "一把古老的黃銅鑰匙，上面刻有奇怪的符號",
      "imageUrl": "https://..."
    },
    "action": "added"
  }
}
```

**前端處理**
- 更新道具列表
- 若為 `added`，顯示獲得道具動畫
- 顯示 Toast：「獲得道具：{name}」

---

## 3. 前端實作指引

### 3.1 Pusher Client 初始化

```typescript
// lib/websocket/pusher-client.ts
import Pusher from 'pusher-js';

export function initPusher() {
  const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    authEndpoint: '/api/webhook/pusher-auth',
  });
  
  return pusher;
}
```

### 3.2 訂閱角色頻道（玩家端）

```typescript
// hooks/use-websocket.ts
import { useEffect, useState } from 'react';
import { initPusher } from '@/lib/websocket/pusher-client';
import type { BaseEvent } from '@/types/event';

export function useCharacterWebSocket(characterId: string) {
  const [events, setEvents] = useState<BaseEvent[]>([]);
  
  useEffect(() => {
    const pusher = initPusher();
    const channel = pusher.subscribe(`private-character-${characterId}`);
    
    // 監聽所有事件類型
    const eventTypes = [
      'role.updated',
      'role.secretUnlocked',
      'role.message',
      'role.taskUpdated',
      'role.inventoryUpdated',
    ];
    
    eventTypes.forEach(eventType => {
      channel.bind(eventType, (data: BaseEvent) => {
        setEvents(prev => [...prev, data]);
        handleEvent(data);
      });
    });
    
    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`private-character-${characterId}`);
    };
  }, [characterId]);
  
  return { events };
}

function handleEvent(event: BaseEvent) {
  // 根據事件類型顯示不同的 Toast 或處理邏輯
  switch (event.type) {
    case 'role.message':
      showToast(event.payload.title, event.payload.message);
      break;
    case 'role.taskUpdated':
      if (event.payload.action === 'added') {
        showToast('新任務', event.payload.task.title);
      }
      break;
    // ... 其他事件處理
  }
}
```

---

### 3.3 訂閱劇本頻道（玩家端）

```typescript
export function useGameWebSocket(gameId: string) {
  useEffect(() => {
    const pusher = initPusher();
    const channel = pusher.subscribe(`private-game-${gameId}`);
    
    channel.bind('game.broadcast', (data: GameBroadcastEvent) => {
      if (data.payload.priority === 'high') {
        showFullScreenNotification(data.payload.title, data.payload.message);
      } else {
        showToast(data.payload.title, data.payload.message);
      }
    });
    
    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`private-game-${gameId}`);
    };
  }, [gameId]);
}
```

---

## 4. 後端推送實作

### 4.1 Pusher Server 初始化

```typescript
// lib/websocket/pusher.ts
import Pusher from 'pusher';

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});
```

### 4.2 推送事件範例

```typescript
// lib/websocket/events.ts
import { pusher } from './pusher';
import type { RoleMessageEvent } from '@/types/event';

export async function pushCharacterMessage(
  characterId: string,
  title: string,
  message: string
) {
  const event: RoleMessageEvent = {
    type: 'role.message',
    timestamp: Date.now(),
    payload: {
      characterId,
      from: 'GM',
      title,
      message,
      style: 'info',
    },
  };
  
  await pusher.trigger(
    `private-character-${characterId}`,
    'role.message',
    event
  );
}

export async function pushTaskUpdate(
  characterId: string,
  task: any,
  action: 'added' | 'updated' | 'deleted'
) {
  const event: TaskUpdatedEvent = {
    type: 'role.taskUpdated',
    timestamp: Date.now(),
    payload: {
      characterId,
      task,
      action,
    },
  };
  
  await pusher.trigger(
    `private-character-${characterId}`,
    'role.taskUpdated',
    event
  );
}
```

---

## 5. Pusher 認證實作

### 5.1 認證 Endpoint

```typescript
// app/api/webhook/pusher-auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pusher } from '@/lib/websocket/pusher';

export async function POST(req: NextRequest) {
  const { socket_id, channel_name } = await req.json();
  
  // 驗證頻道格式
  if (!channel_name.startsWith('private-character-') && 
      !channel_name.startsWith('private-game-')) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 403 });
  }
  
  // 可選：驗證使用者是否有權限存取該頻道
  // 例如：檢查 characterId 是否存在於資料庫
  
  const auth = pusher.authorizeChannel(socket_id, channel_name);
  
  return NextResponse.json(auth);
}
```

---

## 6. 事件優先級與 QoS

### 6.1 優先級定義

| 優先級 | 說明 | 前端處理 |
|-------|------|----------|
| `high` | 重要劇情事件 | 全螢幕通知 + 音效 |
| `normal` | 一般更新 | Toast 通知 |
| `low` | 背景更新 | 僅更新資料，不顯示通知 |

### 6.2 斷線重連機制

Pusher 預設會自動重連，前端需處理：

```typescript
pusher.connection.bind('connected', () => {
  console.log('WebSocket connected');
  // 重新同步資料
  refetchCharacterData();
});

pusher.connection.bind('disconnected', () => {
  console.log('WebSocket disconnected');
  // 顯示離線提示
  showOfflineIndicator();
});
```

---

## 7. 測試建議

### 7.1 單元測試

測試事件推送函式：

```typescript
describe('pushCharacterMessage', () => {
  it('should send message to correct channel', async () => {
    const characterId = '507f1f77bcf86cd799439013';
    await pushCharacterMessage(characterId, 'Test', 'Hello');
    
    expect(pusher.trigger).toHaveBeenCalledWith(
      `private-character-${characterId}`,
      'role.message',
      expect.objectContaining({ type: 'role.message' })
    );
  });
});
```

### 7.2 整合測試

使用 Pusher 提供的 Test 工具或 Mock Pusher Client 進行測試。

---

## 8. 效能考量

### 8.1 批次推送

若需同時推送多個角色，使用 `pusher.triggerBatch()`：

```typescript
await pusher.triggerBatch([
  { channel: 'private-character-xxx', name: 'role.message', data: {...} },
  { channel: 'private-character-yyy', name: 'role.message', data: {...} },
]);
```

### 8.2 事件大小限制

Pusher 單一事件大小限制為 **10KB**，需注意：

- 避免在 `payload` 中傳送過大的資料
- 若需傳送大量資料，可僅推送通知，由前端主動 fetch API

---

## 附註

- 所有事件需包含 `timestamp` 以便前端排序
- 前端需實作事件去重機制（避免重複顯示）
- Pusher 免費方案限制：100 個連線 + 200,000 訊息/天
- 生產環境建議升級至付費方案以獲得更好的效能與支援

此文件將隨需求變更持續更新。

