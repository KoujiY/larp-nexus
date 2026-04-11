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
| Preset event broadcast | Target characters |
| Preset event stat change | Target characters |

## GM Broadcast
GM can send broadcasts from the game detail page or via preset events.
- Game broadcast → all players
- Character message → specific character
- Preset event broadcast → all or selected characters
See [../gm/game/broadcast-system.md](../gm/game/broadcast-system.md)

## Preset Event Display Name
When `showName` is enabled on a preset event, players see the event name in notifications and active effects. When disabled (default), they see「未知來源」instead. See [../gm/game/preset-events.md](../gm/game/preset-events.md)
