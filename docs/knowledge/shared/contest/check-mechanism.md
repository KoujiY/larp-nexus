# Check Mechanism (檢定機制)

## Check Types
```typescript
type CheckType = 'none' | 'contest' | 'random' | 'random_contest';
```

### none
- No randomness involved
- Effect executes directly
- If `targetType` is 'other'/'any', player still selects a target character
- Does NOT guarantee auto-success — effect type determines the actual action

### random
Uses `RandomConfig`:
```typescript
interface RandomConfig {
  maxValue: number;    // Roll range: 1 to maxValue
  threshold: number;  // Must roll >= threshold to succeed
}
```
- Attacker rolls, if roll >= threshold → success
- Only attacker rolls; no defender involvement

### contest
Uses `ContestConfig`:
```typescript
interface ContestConfig {
  relatedStat: string;              // Both sides use this stat
  opponentMaxItems?: number;        // How many items defender can use (default 0)
  opponentMaxSkills?: number;       // How many skills defender can use (default 0)
  tieResolution?: 'attacker_wins' | 'defender_wins' | 'both_fail';
}
```
- Attacker's stat value vs defender's stat value (+ any defense bonuses)
- Higher value wins
- Tie resolved by `tieResolution` setting

### random_contest
- Both attacker AND defender each roll 1 to `game.randomContestMaxValue` (default 100)
- Higher roll wins
- Neither skills nor items affect the roll value
- Defender can only respond with `random_contest` skills/items (same check type rule)

## 對抗檢定的效果目標限制
當 `checkType` 為 `contest` 或 `random_contest` 時，GM 在 Wizard 設計效果時只能選擇 `self` 或 `other` 作為 `targetType`，`any` 會被 disable。這是為了對抗語意明確：效果要嘛作用於發起者自己，要嘛作用於對手，不會「隨便挑一個人」。

執行階段由 `lib/contest/contest-effect-executor.ts` 做 per-effect 分派，`sourceOwner` 為擁有 actualSource 的角色（依 `contestResult`：攻擊方獲勝 → attacker；防守方獲勝 → defender）。`self` 效果套用到 sourceOwner，`other` 效果套用到對手。`item_take` / `item_steal` 固定為「對手 → sourceOwner」，與 targetType 無關。

## 設計決策：對抗配置欄位與回應限制

### GM 側：`opponentMaxItems` / `opponentMaxSkills` 維持數字型別

`ContestConfig` 中的 `opponentMaxItems` 和 `opponentMaxSkills` 維持 `number` 型別，不轉換為 `boolean`/checkbox。理由：

- 轉換成本過高（型別變更、schema migration、validator 更新、測試更新，涉及 10+ 個檔案）
- 現行數字方式已能正確作為 boolean-like 判斷：`0` = 不允許，`>0` = 允許且限制最大數量
- 數字型別提供更高彈性（未來可調整上限數量）

### 玩家側：回應類型互斥

即使 GM 同時允許道具與技能回應（`opponentMaxItems > 0` 且 `opponentMaxSkills > 0`），玩家只能選擇**一種**回應類型（道具 OR 技能，不可同時使用）。此限制僅在前端 `contest-response-dialog.tsx` 強制執行。

## Defender Response Rules
When attacker uses combat-tagged skill/item:
- Defender can only respond with items/skills that also have the combat tag
- Defender must use the same stat (contest) or same check type (random_contest)

## Equipment Exclusion
裝備類物品（`type: 'equipment'`）為被動增益，不可用於對抗回應：
- 前端 `contest-response-dialog.tsx`：過濾 `item.type === 'equipment'` 排除於回應選項
- 後端 `contest-validator.ts`：驗證時拒絕裝備類，回傳 `INVALID_ITEM_TYPE` 錯誤
