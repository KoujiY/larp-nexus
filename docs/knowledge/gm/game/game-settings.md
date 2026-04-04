# Game Settings (遊戲設定)

## Game Data Model
```typescript
import type { BackgroundBlock } from '@/types/character';
// BackgroundBlock = { type: 'title' | 'body'; content: string }

interface Game {
  _id: ObjectId;
  gmUserId: ObjectId;
  name: string;
  description: string;
  coverUrl?: string;           // Game cover image (Vercel Blob)
  isActive: boolean;           // Controls Runtime layer read/write
  gameCode: string;            // 6-char alphanumeric, unique, auto-generated
  publicInfo?: {
    blocks: BackgroundBlock[];  // 與角色背景共用同一段落結構
  };
  randomContestMaxValue?: number;  // Default 100; shared across all characters in game
}

// API 回傳型別（getGames 列表頁）
interface GameData extends Game {
  characterCount?: number;     // 角色數量（僅 getGames 列表頁回傳）
}
```

## Game States
See [game-states.md](./game-states.md) for the full state machine.

## Game Code
- Auto-generated 6-char alphanumeric code
- Used by players on game day to unlock full access (Runtime mode)
- **Do not reuse the same Game Code across different game sessions** — could allow players from a previous session to re-enter

## Cover Image
- Uploaded via `uploadGameCover` server action (`app/actions/games.ts`)
- Stored in Vercel Blob at `games/{gameId}/{timestamp}-{filename}`
- 前端壓縮 preset: `gameCover` (1200×800, quality 0.85, aspect 3:2)
- 舊圖自動清理（上傳新圖時 `del(oldUrl)`）
- 顯示位置：GM 劇本列表卡片、GM 編輯頁封面區、玩家世界觀 Hero 區
- **不同步到 GameRuntime**：封面圖只從 Baseline `Game` 讀取，Runtime 不含此欄位

## Public Info
The game's public info is accessible at `/g/[gameId]` — a public page all players can view regardless of their character card unlock state.

內容使用 `BackgroundBlock[]` 結構（與角色背景相同），由標題區塊（`type: 'title'`）和內文區塊（`type: 'body'`）組成。GM 透過 `BackgroundBlockEditor` 元件編輯（支援拖拉排序）。玩家端以 `BackgroundBlockRenderer` 渲染，標題區塊可摺疊。

世界觀頁面同時顯示同劇本的角色列表（名稱、描述、頭像），由 `GamePublicCharacter` 型別定義。

## randomContestMaxValue
- Sets the upper bound for `random_contest` check type
- Applies to all characters in the game
- Default: 100
