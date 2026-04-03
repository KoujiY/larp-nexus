# Contest System Spike (Archived)

> Original: `docs/requirements/CONTEST_SYSTEM_SPIKE_NOTE.md`

## Contest Notification Rules (6 Scenarios)

All implemented. Key rules:
- Attacker always receives `skill.used` result notification
- Winner's effects execute; loser receives `character.affected` if affected
- Steal/remove items require target selection step before final notification
- Compound effects (stat + steal) follow same rules, steal adds selection step
- Page refresh: attacker returns to skill/item dialog; defender returns to contest response dialog — these dialogs cannot be manually closed
