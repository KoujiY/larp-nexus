# Basic Info (基本資訊 Tab)

## Location
Character edit page → 📝 基本資訊 tab
Component: `components/gm/character-edit-form.tsx`

## Three Card Sections

### 1. 基本設定
- **Name** (`name`): Character display name
- **Description** (`description`): Brief character description shown on GM card list
- **PIN**: 4-digit lock. If `hasPinLock=true`, player must enter PIN to view character card. Set days before game event.

### 2. 公開資訊 (Public Info)
See [public-info.md](./public-info.md)

### 3. 隱藏資訊 (Hidden Info)
See [hidden-info.md](./hidden-info.md)

## PIN Management Rules
- GM sets PIN when creating/editing character
- PIN is hashed before storage (`pinHash` field)
- Plain PIN is never stored
- Recommend distributing PIN to players days before game — enables preview mode
- **Do not reuse the same Game Code across different game sessions** (security risk)
