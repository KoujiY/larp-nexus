# Character Card (角色卡)

## Overview
A character card is the core unit of LARP Nexus. Each character belongs to one game and represents a single player's role. The character card is the exclusive interface for that player — each player only sees their own card.

## Character Card Editor (GM Side)

The character edit page has **5 tabs**:

| Tab | Emoji | Content |
|-----|-------|---------|
| 基本資訊 | 📝 | Name, description, PIN, public info, hidden info |
| 角色數值 | 📊 | Stats (name/value/max) + active temporary effects |
| 任務管理 | ✅ | Normal tasks + hidden tasks |
| 道具管理 | 🎒 | Items inventory |
| 技能管理 | ⚡ | Skills |

## Core Data Model

```typescript
interface CharacterData {
  id: string;
  gameId: string;
  name: string;
  description: string;
  imageUrl?: string;
  hasPinLock: boolean;
  publicInfo?: PublicInfo;
  secretInfo?: SecretInfo;      // hidden info (隱藏資訊)
  tasks?: Task[];
  items?: Item[];
  stats?: Stat[];
  skills?: Skill[];
  temporaryEffects?: TemporaryEffect[];
  isGameActive?: boolean;
}
```

## Related Knowledge
- [basic-info.md](./basic-info.md) — name, description, PIN
- [public-info.md](./public-info.md) — player's pre-game knowledge
- [hidden-info.md](./hidden-info.md) — what character doesn't know about themselves
- [stats.md](./stats.md) — numeric stats and temporary effects
- [../tasks/task-management.md](../tasks/task-management.md) — tasks
- [../items/item-concepts.md](../items/item-concepts.md) — items
- [../skills/skill-concepts.md](../skills/skill-concepts.md) — skills
