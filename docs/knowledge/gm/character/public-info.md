# Public Info (公開資訊)

## Concept
公開資訊 represents the player's **pre-game knowledge about their own character** — what the player already knows before the game starts. It is NOT what other characters or players can know; each character card is exclusive to one player.

## Data Structure
```typescript
import type { BackgroundBlock } from '@/types/character';
// BackgroundBlock = { type: 'title' | 'body'; content: string }

interface PublicInfo {
  background: BackgroundBlock[];  // 角色背景故事（標題/內文區塊陣列）
  personality: string;            // Character personality traits
  relationships: Relationship[];
}

interface Relationship {
  targetName: string;      // Name of the related character/person
  description: string;     // Nature of the relationship
}
```

`background` 使用 `BackgroundBlock[]` 結構，與 Game 的 `publicInfo.blocks` 共用同一型別。標題區塊（`type: 'title'`）在玩家端以可摺疊標題渲染，內文區塊（`type: 'body'`）為段落文字。

GM 透過 `BackgroundBlockEditor` 元件編輯（支援新增、刪除、拖拉排序區塊），玩家端以 `BackgroundBlockRenderer` 元件渲染。

## GM Usage
- Write information the player already knows at game start
- Relationships describe the character's perspective on other characters
- This section is always visible once the player unlocks their card (PIN mode) or enters the game
