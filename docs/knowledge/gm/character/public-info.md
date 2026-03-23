# Public Info (公開資訊)

## Concept
公開資訊 represents the player's **pre-game knowledge about their own character** — what the player already knows before the game starts. It is NOT what other characters or players can know; each character card is exclusive to one player.

## Data Structure
```typescript
interface PublicInfo {
  background: string;      // Character background story
  personality: string;     // Character personality traits
  relationships: Relationship[];
}

interface Relationship {
  targetName: string;      // Name of the related character/person
  description: string;     // Nature of the relationship
}
```

## GM Usage
- Write information the player already knows at game start
- Relationships describe the character's perspective on other characters
- This section is always visible once the player unlocks their card (PIN mode) or enters the game
