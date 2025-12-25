# WebSocket 事件格式規範

## 版本：v1.4
## 更新日期：2025-01-XX（Phase 8 時效性效果）
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

### 2.7 通知紀錄（玩家端顯示策略）

- **目的**：在玩家端記錄所有收到的事件，不顯示觸發者來源，提供簡要訊息與時間戳。
- **涵蓋事件**：`role.updated`、`role.taskUpdated`、`role.inventoryUpdated`、`skill.used`、`skill.cooldown`、`skill.contest`、`character.affected`、`item.transferred` 等。
- **顯示內容**：事件類型（友善文字）、摘要（如「獲得道具：X」「數值 Y 改變」）、時間。
- **隱私要求**：不顯示觸發者/來源角色，只顯示結果。
- **儲存策略**：前端狀態 + 可選 localStorage 緩存，僅保留最近 N 筆（避免膨脹）。
- **提醒方式**：新事件來時顯示徽章或輕量提示；點擊後展開「通知紀錄」面板/抽屜查看細節。
- **未讀提示**：新事件進來加總未讀數/紅點，開啟面板時清除未讀。
- **遊戲狀態事件**：需納入 `game.started`、`game.reset`/`game.ended`（開始/重置/結束遊戲）提示，玩家收到後刷新或提示狀態變更。

---

### 2.8 技能使用事件 (skill.used) - Phase 6

當玩家使用技能時觸發。

**頻道**：`private-character-{characterId}`

**事件格式**
```typescript
interface SkillUsedEvent extends BaseEvent {
  type: 'skill.used';
  payload: {
    characterId: string;
    skillId: string;
    skillName: string;
    checkType: 'none' | 'contest' | 'random';
    checkPassed: boolean;
    checkResult?: number;          // 檢定結果（random 類型）
    effectsApplied?: string[];     // 已執行的效果描述列表
  };
}
```

**範例**
```json
{
  "type": "skill.used",
  "timestamp": 1701234567890,
  "payload": {
    "characterId": "507f1f77bcf86cd799439013",
    "skillId": "skill-001",
    "skillName": "治療術",
    "checkType": "random",
    "checkPassed": true,
    "checkResult": 75,
    "effectsApplied": ["HP +10"]
  }
}
```

**前端處理**
- 更新技能冷卻時間與使用次數
- 顯示技能使用結果（Toast）
- 若檢定失敗，顯示失敗訊息

---

### 2.9 技能冷卻更新事件 (skill.cooldown) - Phase 6

當技能冷卻時間變化時觸發（用於即時更新冷卻倒數）。

**頻道**：`private-character-{characterId}`

**事件格式**
```typescript
interface SkillCooldownEvent extends BaseEvent {
  type: 'skill.cooldown';
  payload: {
    characterId: string;
    skillId: string;
    remainingSeconds: number;      // 剩餘冷卻時間（秒）
  };
}
```

**前端處理**
- 更新技能列表中的冷卻時間顯示
- 當 `remainingSeconds` 為 0 時，移除冷卻狀態

---

### 2.10 對抗檢定事件 (skill.contest) - Phase 7 / Phase 7.6 ✅ 已完成

當玩家使用對抗檢定技能或道具時觸發（攻擊方與防守方都會收到）。

**頻道**：`private-character-{attackerId}`、`private-character-{defenderId}`

**事件格式**
```typescript
interface SkillContestEvent extends BaseEvent {
  type: 'skill.contest';
  payload: {
    attackerId: string;
    attackerName: string;
    defenderId: string;
    defenderName: string;
    skillId?: string;              // Phase 7: 改為可選，支援道具檢定
    skillName?: string;            // Phase 7: 改為可選，支援道具檢定
    itemId?: string;               // Phase 7: 道具檢定時使用
    itemName?: string;             // Phase 7: 道具檢定時使用
    sourceType?: 'skill' | 'item'; // Phase 7: 來源類型
    checkType: 'contest' | 'random_contest'; // Phase 7.6: 檢定類型
    relatedStat?: string;          // Phase 7.6: 數值判定名稱（contest 類型時使用）
    attackerValue: number;         // 攻擊方數值（0 表示請求事件，非 0 表示結果事件）
    attackerItems?: string[];      // 攻擊方使用的道具 ID
    attackerSkills?: string[];     // 攻擊方使用的技能 ID
    defenderValue: number;         // 防守方數值（請求事件時為 0）
    defenderItems?: string[];      // 防守方使用的道具 ID
    defenderSkills?: string[];     // 防守方使用的技能 ID
    result?: 'attacker_wins' | 'defender_wins' | 'both_fail'; // 結果事件時才有
    effectsApplied?: string[];     // 已執行的效果描述列表（結果事件時，僅成功方）
    opponentMaxItems?: number;     // Phase 7: 防守方可使用的道具數量限制
    opponentMaxSkills?: number;    // Phase 7: 防守方可使用的技能數量限制
    targetItemId?: string;         // Phase 7: 目標道具 ID（用於 item_take 和 item_steal）
    needsTargetItemSelection?: boolean; // Phase 7: 是否需要攻擊方選擇目標道具
    randomContestMaxValue?: number; // Phase 7.6: 隨機對抗檢定上限值（random_contest 類型時）
  };
}
```

**事件類型**
- **請求事件**：`attackerValue === 0`，防守方收到，需要回應
- **結果事件**：`attackerValue !== 0`，雙方都收到，顯示對抗結果

**Phase 7.6 擴展說明**：
- **檢定類型**：`checkType` 欄位標示檢定類型（`contest` 或 `random_contest`）
- **數值匹配**：防守方只能使用相同 `checkType` 和 `relatedStat` 的技能/道具回應
- **隨機對抗檢定**：`checkType === 'random_contest'` 時，使用 `randomContestMaxValue` 作為上限值
- **效果結算**：僅成功方（攻擊方或防守方）的效果會被執行

**前端處理**
- **請求事件（防守方）**：
  - 顯示對抗請求通知
  - **Phase 7.6**：根據 `checkType` 和 `relatedStat` 過濾可用的技能/道具
  - **Phase 7.6**：僅顯示具有 "戰鬥"（`combat`）標籤的技能/道具
  - 打開回應 Dialog，可選擇道具/技能
  - 狀態持久化（重新整理後恢復）
- **結果事件（攻擊方）**：
  - 顯示對抗結果
  - 若獲勝且需要選擇目標道具，顯示目標道具選擇 Dialog
  - 狀態持久化（重新整理後恢復）
  - 跨分頁處理（自動切換到對應分頁）
- **結果事件（防守方）**：
  - 顯示對抗結果
  - **Phase 7.6**：若防守方獲勝，顯示防守方效果執行結果
  - 若受到影響，顯示 `character.affected` 事件

---

### 2.11 跨角色影響事件 (character.affected) - Phase 6.5（方案 A）/ Phase 7.6

當角色被他人技能/道具影響時觸發。

**頻道**：`private-character-{targetCharacterId}`

**事件格式**
```typescript
interface CharacterAffectedEvent extends BaseEvent {
  type: 'character.affected';
  payload: {
    targetCharacterId: string;
    sourceCharacterId: string;
    sourceCharacterName: string;       // Phase 7.6: 若來源具有 "隱匿"（stealth）標籤，此欄位可能為空或隱藏
    sourceType: 'skill' | 'item';      // 影響來源類型
    sourceName: string;                 // Phase 7.6: 技能/道具名稱（不顯示在防守方訊息中）
    sourceHasStealthTag?: boolean;      // Phase 7.6: 來源是否具有 "隱匿" 標籤
    effectType: 'stat_change' | 'item_take' | 'item_steal'; // Phase 7.6: 支援多種效果類型
    changes: {
      stats?: Array<{                   // 數值變化陣列
        name: string;                    // 數值名稱
        deltaValue?: number;             // 目前值變化
        deltaMax?: number;               // 最大值變化
        newValue: number;                // 新的目前值
        newMax?: number;                 // 新的最大值
      }>;
      items?: Array<{                   // Phase 7: 道具變化
        id: string;
        name: string;
        action: 'taken' | 'stolen';     // Phase 7: 支援 taken 和 stolen
        quantity: number;
      }>;
    };
  };
}
```

**Phase 7.6 隱匿標籤影響**：
- **隱匿標籤**：若來源技能/道具具有 "隱匿"（`stealth`）標籤，`sourceCharacterName` 不會顯示在防守方的通知訊息中
- **訊息格式**：
  - 無隱匿標籤：「XXX 對你使用了 YYY，效果：HP +5」
  - 有隱匿標籤：「你受到了 YYY 的影響，效果：HP +5」（不顯示攻擊方姓名）
- **技能/道具名稱**：無論是否有隱匿標籤，`sourceName` 都不會顯示在防守方訊息中（依需求文件要求）

**前端處理**
- 顯示被影響的通知（Toast）
  - **Phase 7.6**：根據 `sourceHasStealthTag` 決定是否顯示攻擊方姓名
  - 格式（無隱匿標籤）：「XXX 對你造成了影響」
  - 格式（有隱匿標籤）：「你受到了影響」（不顯示攻擊方姓名）
  - 顯示具體效果（如「HP +5」或「道具被偷取：神秘信件」）
- 記錄到通知面板
- 刷新角色資料（`router.refresh()`）
- 即時更新數值/道具列表

---

### 2.12 道具轉移事件 (item.transferred) - Phase 6.5

當道具在角色間轉移時觸發（轉出方與轉入方都會收到）。

**頻道**：`private-character-{fromCharacterId}`、`private-character-{toCharacterId}`

**事件格式**
```typescript
interface ItemTransferredEvent extends BaseEvent {
  type: 'item.transferred';
  payload: {
    fromCharacterId: string;
    fromCharacterName: string;
    toCharacterId: string;
    toCharacterName: string;
    itemId: string;
    itemName: string;
    quantity: number;
    transferType: 'give' | 'take' | 'steal';  // 轉移類型
    skillId?: string;              // 若由技能觸發
    skillName?: string;
  };
}
```

**前端處理**
- 轉出方：顯示道具失去通知
- 轉入方：顯示道具獲得通知
- 更新道具列表

---

### 2.13 時效性效果過期事件 (effect.expired) - Phase 8

當時效性效果過期並恢復數值時觸發。

**頻道**：`private-character-{targetCharacterId}`

**事件格式**
```typescript
interface EffectExpiredEvent extends BaseEvent {
  type: 'effect.expired';
  payload: {
    targetCharacterId: string;
    effectId: string;                // 過期效果的 ID
    sourceType: 'skill' | 'item';    // 來源類型
    sourceId: string;                 // 技能/道具 ID
    sourceCharacterId: string;       // 施放者角色 ID
    sourceCharacterName: string;      // 施放者角色名稱（用於顯示）
    sourceName: string;               // 技能/道具名稱（用於顯示）
    effectType: 'stat_change';       // 效果類型（Phase 1 僅支援 stat_change）
    targetStat: string;              // 目標數值名稱
    restoredValue: number;            // 恢復後的數值
    restoredMax?: number;             // 恢復後的最大值（若有）
    statChangeTarget: 'value' | 'maxValue'; // 變化目標
    duration: number;                // 持續時間（秒）
  };
}
```

**範例**
```json
{
  "type": "effect.expired",
  "timestamp": 1701234567890,
  "payload": {
    "targetCharacterId": "507f1f77bcf86cd799439013",
    "effectId": "eff-xxx-123",
    "sourceType": "skill",
    "sourceId": "skill-001",
    "sourceCharacterId": "507f1f77bcf86cd799439014",
    "sourceCharacterName": "玩家A",
    "sourceName": "力量強化",
    "effectType": "stat_change",
    "targetStat": "力量",
    "restoredValue": 10,
    "statChangeTarget": "value",
    "duration": 60
  }
}
```

**前端處理**
- **玩家端**：
  - 顯示效果過期通知（Toast）
  - 格式：「[技能/道具名稱] 的效果已結束，[數值名稱] 已恢復」
  - 更新角色數值顯示
  - 記錄到通知面板
  - 刷新角色資料（`router.refresh()`）
- **GM 端**：
  - 更新角色數值顯示
  - 從時效性效果卡片中移除該效果
  - 顯示通知（可選）

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
      'skill.used',              // Phase 6
      'skill.cooldown',         // Phase 6
      'skill.contest',         // Phase 6.5
      'character.affected',     // Phase 6.5
      'item.transferred',       // Phase 6.5
      'effect.expired',         // Phase 8
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

