# Requirements Update (Archived)

> Original: `docs/requirements/LARP_NEXUX_REQUIREMENTS_UPDATE.md`

## Key Changes from Original PRD

1. **Combat system removed** — too complex to scope; replaced by skill system with combat tag
2. **Tag system added** — `combat` tag restricts which skills/items can be used in contests; `stealth` tag hides attacker identity
3. **Check types expanded** — added `random_contest` (both sides roll random number, compare results)
4. **Temporary effects added** — stat changes can have duration; server-side timer; multiple effects stack independently
5. **Contest notification rules** — attacker always receives result; affected party receives `character.affected`; defender name shown unless stealth tag
