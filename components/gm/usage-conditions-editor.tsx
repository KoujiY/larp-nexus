'use client';

/**
 * Feature 3: 使用條件編輯器（技能 / 物品共用，置於 AbilityEditWizard Step 3）
 *
 * 多條件 AND。兩種條件：
 * - 數值門檻/成本：要求某 stat ≥ value；consume 時使用後扣除 value
 * - 持有物品：要求持有某 item 數量 ≥ quantity；consume 時使用後扣除 quantity
 *
 * 為避免 discriminated-union 在「列內切換型別」時的欄位重置複雜度，
 * 採「新增數值條件 / 新增物品條件」兩顆按鈕，型別於新增時固定，需更換則刪除重加。
 */

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { GM_SELECT_CLASS } from '@/lib/styles/gm-form';
import type { UsageCondition } from '@/types/character';

interface UsageConditionsEditorProps {
  conditions: UsageCondition[];
  /** 角色數值清單（填數值條件下拉） */
  stats: Array<{ name: string }>;
  /** 角色物品清單（填物品條件下拉） */
  availableItems: Array<{ id: string; name: string }>;
  onChange: (next: UsageCondition[]) => void;
  disabled?: boolean;
}

const ROW_INPUT = 'w-24 bg-card border border-border rounded-lg py-2 px-3 h-auto font-bold text-sm';

export function UsageConditionsEditor({
  conditions,
  stats,
  availableItems,
  onChange,
  disabled,
}: UsageConditionsEditorProps) {
  // 為每列維護穩定的 React key（UsageCondition 無 id，不適合用 index 當 key —
  // 刪除中間列會造成 controlled 元件 reconcile 錯位 / focus 跳動）。
  // 內部 add/remove 同步維護；外部重置（切換能力、裝備清空）時依長度落差重建。
  const [keys, setKeys] = useState<string[]>(() => conditions.map(() => crypto.randomUUID()));
  if (keys.length !== conditions.length) {
    setKeys(conditions.map(() => crypto.randomUUID()));
  }

  const updateAt = (index: number, patch: Partial<UsageCondition>) => {
    onChange(
      conditions.map((c, i) => (i === index ? ({ ...c, ...patch } as UsageCondition) : c)),
    );
  };
  const removeAt = (index: number) => {
    setKeys((prev) => prev.filter((_, i) => i !== index));
    onChange(conditions.filter((_, i) => i !== index));
  };
  const addStat = () => {
    setKeys((prev) => [...prev, crypto.randomUUID()]);
    onChange([
      ...conditions,
      { type: 'stat', statName: stats[0]?.name ?? '', value: 1, consume: true },
    ]);
  };
  // 物品條件依「名稱」比對 → 下拉去重同名（同名多條目只需出現一次）
  const itemNames = Array.from(new Set(availableItems.map((i) => i.name)));
  const addItem = () => {
    setKeys((prev) => [...prev, crypto.randomUUID()]);
    onChange([
      ...conditions,
      { type: 'item', itemName: itemNames[0] ?? '', quantity: 1, consume: true },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end">
        <label className="text-sm font-extrabold text-foreground tracking-tight">使用條件</label>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          Usage Conditions
        </span>
      </div>

      {conditions.length === 0 ? (
        <p className="text-xs text-muted-foreground font-medium">
          尚無條件。可設定數值門檻（如 MP ≥ 10）或持有物品作為使用前提；勾選「扣除」則為成本（使用後扣減）。
        </p>
      ) : (
        <div className="space-y-2">
          {conditions.map((cond, index) => (
            <div
              key={keys[index]}
              className="flex flex-wrap items-center gap-2 bg-muted rounded-xl p-3 border border-border/50"
            >
              {cond.type === 'stat' ? (
                <>
                  <span className="text-xs font-extrabold text-muted-foreground shrink-0">數值</span>
                  <select
                    value={cond.statName}
                    disabled={disabled}
                    onChange={(e) => updateAt(index, { statName: e.target.value })}
                    className={`${GM_SELECT_CLASS} flex-1 min-w-28`}
                  >
                    {stats.length === 0 && <option value="">（尚無數值）</option>}
                    {stats.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs font-bold text-muted-foreground shrink-0">≥</span>
                  <Input
                    type="number"
                    min={1}
                    value={cond.value}
                    disabled={disabled}
                    onChange={(e) => updateAt(index, { value: Math.max(1, parseInt(e.target.value) || 1) })}
                    className={ROW_INPUT}
                  />
                </>
              ) : (
                <>
                  <span className="text-xs font-extrabold text-muted-foreground shrink-0">物品</span>
                  <select
                    value={cond.itemName}
                    disabled={disabled}
                    onChange={(e) => updateAt(index, { itemName: e.target.value })}
                    className={`${GM_SELECT_CLASS} flex-1 min-w-28`}
                  >
                    {itemNames.length === 0 && <option value="">（尚無物品）</option>}
                    {itemNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs font-bold text-muted-foreground shrink-0">×</span>
                  <Input
                    type="number"
                    min={1}
                    value={cond.quantity}
                    disabled={disabled}
                    onChange={(e) => updateAt(index, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className={ROW_INPUT}
                  />
                </>
              )}

              <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
                <Switch
                  checked={cond.consume}
                  disabled={disabled}
                  onCheckedChange={(checked) => updateAt(index, { consume: checked })}
                  className="cursor-pointer"
                />
                <span className="text-xs font-bold text-muted-foreground">扣除</span>
              </label>

              <button
                type="button"
                disabled={disabled}
                onClick={() => removeAt(index)}
                className="ml-auto shrink-0 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                aria-label="刪除條件"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={addStat}
          className="flex items-center gap-1.5 text-xs font-extrabold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-2 rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> 數值條件
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={addItem}
          className="flex items-center gap-1.5 text-xs font-extrabold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-2 rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> 物品條件
        </button>
      </div>
    </div>
  );
}
