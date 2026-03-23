# Project Structure Legacy (Archived)

> Original: `docs/specs/01_PROJECT_STRUCTURE.md` v1.7 (2026-03-04)
> This snapshot may be outdated. Refer to the actual codebase for current structure.

## Top-Level Directory Map
```
app/          Next.js App Router (auth, gm, player routes + API routes + Server Actions)
components/   React components (ui/, gm/, player/)
lib/          Business logic (contest/, item/, skill/, reveal/, character/, db/models/)
hooks/        Custom React hooks
types/        TypeScript type definitions
docs/         Documentation
```

## Key Route Groups
- `(auth)/` — GM login, email verify
- `(gm)/` — Dashboard, game management, character editing (requires auth)
- `(player)/c/[characterId]` — Player character card (no auth)
- `app/unlock/` — PIN + Game Code unlock flow

## Key Server Actions
- `characters.ts` — character CRUD
- `character-update.ts` — stats/items/skills updates
- `item-use.ts`, `skill-use.ts` — usage flows
- `contest-respond.ts`, `contest-select-item.ts` — contest flow
- `game-lifecycle.ts` — start/end game
- `public.ts` — player-facing data queries
