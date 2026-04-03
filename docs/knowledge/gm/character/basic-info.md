# Basic Info (基本資訊 Tab)

## Location
Character edit page → 📝 基本資訊 tab
Component: `components/gm/character-edit-form.tsx`

## Three Card Sections

### 1. 基本設定
- **Name** (`name`): Character display name
- **Description** (`description`): Brief character description shown on GM card list (public intro for others)
- **Slogan** (`slogan`, optional): One-line roleplay hint shown on player character card hero section. May contain spoilers about the character's true nature — intended for the player only, not other participants
- **Personality** (`personality`): Character behavior guidelines and personality traits (stored in `publicInfo.personality`)
- **PIN**: 4-6 digit lock. If `hasPinLock=true`, player must enter PIN to view character card. Set days before game event.

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
