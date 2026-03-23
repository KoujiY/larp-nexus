# Task Management (任務管理)

## Concept
Tasks represent objectives assigned to a character. There are two kinds: normal tasks (visible from the start) and hidden tasks (concealed until revealed).

## Data Structure
```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  isHidden: boolean;        // true = hidden task (隱藏目標)
  isRevealed: boolean;      // true = hidden task has been revealed to player
  revealedAt?: Date;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  completedAt?: Date;
  gmNotes?: string;          // GM-only notes, never shown to player
  revealCondition?: string;  // Plain-text note about reveal condition
  autoRevealCondition?: AutoRevealCondition;
  createdAt: Date;
}
```

## Normal Tasks vs Hidden Tasks

| | Normal Task | Hidden Task |
|--|-------------|-------------|
| `isHidden` | `false` | `true` |
| Player visibility | Always visible | Only visible after revealed |
| Reveal mechanism | N/A | Manual (GM) or auto-reveal |

## Player View
- Player sees: normal tasks + revealed hidden tasks
- Player does NOT see: unrevealed hidden tasks, `gmNotes`, `revealCondition`
- Task status (pending/in-progress/completed/failed) IS visible on player side
- Component: `components/player/task-list.tsx`

## GM View
- **✅ 任務管理 tab**: Shows all tasks including unrevealed hidden tasks
- GM can manually reveal hidden tasks at any time

## Related
- [hidden-tasks-and-auto-reveal.md](./hidden-tasks-and-auto-reveal.md) — auto-reveal for hidden tasks
