# API Reference

## Overview
The system uses a mix of **Server Actions** (primary) and **API Routes** (WebSocket auth, file upload, auth).

For complete API spec, see `docs/specs/03_API_SPECIFICATION.md`.

## Server Actions (app/actions/)
| File | Responsibilities |
|------|-----------------|
| `auth.ts` | GM login, magic link, session |
| `games.ts` | Game CRUD, game items query |
| `characters.ts` | Character CRUD (~813 lines, Phase B refactor target) |
| `character-update.ts` | Stat/item/skill updates (~653 lines) |
| `item-use.ts` | Item usage flow — requires PIN session auth (`validatePlayerAccess`) |
| `skill-use.ts` | Skill usage flow — requires PIN session auth (`validatePlayerAccess`) |
| `contest-respond.ts` | Defender response (~561 lines) |
| `contest-select-item.ts` | Target item selection step |
| `contest-cancel.ts` | Cancel pending contest |
| `contest-query.ts` | Query contest state |
| `game-lifecycle.ts` | Start/end game |
| `unlock.ts` | PIN + Game Code unlock — writes `characterId` to `session.unlockedCharacterIds` on success |
| `public.ts` | Player-facing character data (no auth) |
| `item-showcase.ts` | Item showcase action |
| `pending-events.ts` | Pull offline events on reconnect |
| `logs.ts` | Operation log queries |

## API Routes (app/api/)
| Route | Purpose |
|-------|---------|
| `auth/send-magic-link` | Trigger email auth |
| `auth/verify-token` | Verify magic link token |
| `auth/logout` | Clear session |
| `characters/[id]/unlock` | PIN unlock |
| `characters/[id]/verify-game-code` | Game Code verification |
| `webhook/` | Pusher channel auth |
| `upload/` | Image upload to Vercel Blob |
| `cron/check-expired-effects` | Scheduled: expire effects + clean events |

## Response Format
All Server Actions return a consistent envelope:
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
```
