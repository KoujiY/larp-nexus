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
  imageUrl?: string;       // 讀取時依 targetName 比對劇本角色填入的頭像（非持久化）
}
```

**人物關係頭像**：`Relationship` 只持久化 `targetName` / `description`；頭像於讀取時依 `targetName` 比對同劇本角色的圖片取得（兩端一致）。
- GM 端：`background-story-tab.tsx` 於 render 時用 `gameCharacters` 比對。
- 玩家端：`getPublicCharacter` 於回傳前比對並填入 `imageUrl`（僅為本角色關係引用到的名字附圖，不外洩完整角色清單）。
- 比對不到名稱時，前端 fallback 為首字母佔位。

`background` 使用 `BackgroundBlock[]` 結構，與 Game 的 `publicInfo.blocks` 共用同一型別。標題區塊（`type: 'title'`）在玩家端以可摺疊標題渲染，內文區塊（`type: 'body'`）為段落文字。

GM 透過 `BackgroundBlockEditor` 元件編輯（支援新增、刪除、拖拉排序區塊），玩家端以 `BackgroundBlockRenderer` 元件渲染。

## GM Usage
- Write information the player already knows at game start
- Relationships describe the character's perspective on other characters
- This section is always visible once the player unlocks their card (PIN mode) or enters the game
