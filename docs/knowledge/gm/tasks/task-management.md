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
- Player does NOT see: unrevealed hidden tasks, `revealCondition`
- Task status (pending/in-progress/completed/failed) IS visible on player side
- Component: `components/player/task-list.tsx`

## GM View
- Component: `components/gm/tasks-edit-form.tsx`
- **Dual-column layout**: normal tasks (left) + hidden tasks (right), each in a card container with fixed header + scrollable body
- Task cards support expand/collapse, showing description, GM notes, and auto-reveal conditions
- Supports soft-delete (recoverable) + status badges (NEW / MODIFIED)
- Empty state uses `GmEmptyState` component per column
- GM can manually reveal hidden tasks at any time

## Related
- [hidden-tasks-and-auto-reveal.md](./hidden-tasks-and-auto-reveal.md) — auto-reveal for hidden tasks
