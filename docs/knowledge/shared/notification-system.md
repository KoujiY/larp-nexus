# Notification System (通知系統)

## Overview
Players receive in-app notifications when events happen to their character (skill used on them, item changes, secrets revealed, etc.).

## Constraints
- **TTL**: 24 hours — notifications expire automatically
- **Limit**: 50 notifications per character — oldest removed when limit exceeded
- Hook: `hooks/use-notification-system.ts`

## Notification Triggers
| Event | Recipient |
|-------|-----------|
| Skill/item used on character | Defender (character.affected) |
| Skill/item use result | Attacker (skill.used) |
| Hidden info revealed | Character owner |
| Hidden task revealed | Character owner |
| Game broadcast | All characters in game |
| Private message | Specific character |
| Stat changed | Character owner |
| Item received/removed | Character owner |
| Temporary effect expired | Character owner |

## GM Broadcast
GM can send broadcasts from the game detail page.
- Game broadcast → all players
- Character message → specific character
See [../gm/game/broadcast-system.md](../gm/game/broadcast-system.md)
