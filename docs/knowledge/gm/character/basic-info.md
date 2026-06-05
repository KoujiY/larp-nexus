# Basic Info (基本資訊 Tab)

## Location
Character edit page → 📝 基本資訊 tab
Component: `components/gm/character-edit-tabs.tsx` → 📝 基本資訊 tab → `basic-settings-tab.tsx`

## Three Card Sections

### 1. 基本設定
- **Name** (`name`): Character display name
- **Description** (`description`): Brief character description shown on GM card list (public intro for others)
- **Slogan** (`slogan`, optional): One-line roleplay hint shown on player character card hero section. May contain spoilers about the character's true nature — intended for the player only, not other participants
- **Personality** (`personality`): Character behavior guidelines and personality traits (stored in `publicInfo.personality`)
- **PIN**: 4-6 digit lock. If `hasPinLock=true`, player must enter PIN to view character card. Set days before game event.
- **不顯示於世界觀** (`hiddenFromWorld`, Feature 2): 布林旗標。啟用後角色不出現在玩家世界觀頁面（`/g/[gameId]`）的登場角色列表，但角色本身仍正常運作（可登入、可被技能/物品指定為目標）。過濾發生在 `getPublicGame` 的 DB 查詢層（讀取 Baseline），故旗標應於開場前設定；**遊戲進行中（Runtime）此開關隱藏**，避免誤以為能即時生效。GM 角色卡會以「隱藏」Badge 標示已標記的角色。

### 2. 公開資訊 (Public Info)
See [public-info.md](./public-info.md)

### 3. 隱藏資訊 (Hidden Info)
See [hidden-info.md](./hidden-info.md)

## PIN Management Rules
- GM sets PIN when creating/editing character
- PIN is stored in plaintext (4 digits, `pin` field) — this is intentional for LARP game convenience
- Player API never returns PIN; only GM Server Actions can read it
- Same-game PIN uniqueness enforced via sparse compound index (`gameId + pin`)
- Recommend distributing PIN to players days before game — enables preview mode
- **Do not reuse the same Game Code across different game sessions** (security risk)
