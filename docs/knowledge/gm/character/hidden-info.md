# Hidden Info (隱藏資訊)

## Concept
隱藏資訊 represents **what the character does not know about themselves**. All hidden info entries are hidden at game start and are gradually revealed through gameplay. The player cannot see them until the GM reveals them (manually or via auto-reveal).

## Data Structure
```typescript
interface SecretInfo {
  secrets: Secret[];
}

interface Secret {
  id: string;
  title: string;
  content: string;
  isRevealed: boolean;
  revealCondition?: string;             // GM's plain-text note about reveal condition
  autoRevealCondition?: AutoRevealCondition;  // Structured auto-reveal trigger
  revealedAt?: Date;
}
```

## Reveal Methods
1. **GM manual reveal** — GM clicks reveal in character edit
2. **Auto-reveal** — triggered automatically when conditions are met (see [../../shared/auto-reveal-system.md](../../shared/auto-reveal-system.md))

## Important Rules
- ALL secrets are hidden at game start — there are no "pre-revealed" secrets
- `revealCondition` is a free-text note for the GM (not machine-readable)
- `autoRevealCondition` is the structured version that the system can evaluate
- Chain reveals are possible: revealing secret A can trigger revealing secret B (via `secrets_revealed` condition type)

## UI Location
GM editor: `components/gm/secrets-tab.tsx` — 12-column grid (left: list, right: detail panel), soft-delete + status badges
Player view: `components/player/info-secrets-tab.tsx`
