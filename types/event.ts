// WebSocket 事件相關類型定義
export interface BaseEvent<T = unknown> {
  type: string;
  timestamp: number;
  payload: T;
}

export interface RoleUpdatedEvent extends BaseEvent<{
  characterId: string;
  updates: {
    name?: string;
    avatar?: string;
    publicInfo?: Record<string, unknown>;
    tasks?: Array<Record<string, unknown>>;
    items?: Array<Record<string, unknown>>;
  };
}> {
  type: 'role.updated';
}

export interface GameBroadcastEvent extends BaseEvent<{
  gameId: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high';
}> {
  type: 'game.broadcast';
}

export interface SecretUnlockedEvent extends BaseEvent<{
  characterId: string;
  secretInfo: {
    secrets: Array<{
      title: string;
      content: string;
    }>;
    hiddenGoals: string;
  };
}> {
  type: 'role.secretUnlocked';
}

export interface RoleMessageEvent extends BaseEvent<{
  characterId: string;
  from: string;
  title: string;
  message: string;
  style?: 'info' | 'warning' | 'success' | 'error';
}> {
  type: 'role.message';
}

export interface TaskUpdatedEvent extends BaseEvent<{
  characterId: string;
  task: {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'in-progress' | 'completed';
    createdAt?: string;
  };
  action: 'added' | 'updated' | 'deleted';
}> {
  type: 'role.taskUpdated';
}

export interface InventoryUpdatedEvent extends BaseEvent<{
  characterId: string;
  item: {
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    acquiredAt?: string;
  };
  action: 'added' | 'removed';
}> {
  type: 'role.inventoryUpdated';
}

export type WebSocketEvent =
  | RoleUpdatedEvent
  | GameBroadcastEvent
  | SecretUnlockedEvent
  | RoleMessageEvent
  | TaskUpdatedEvent
  | InventoryUpdatedEvent;

