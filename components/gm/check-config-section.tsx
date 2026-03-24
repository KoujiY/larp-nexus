'use client';

/**
 * 檢定系統設定區塊
 *
 * GM 道具編輯（ItemsEditForm）與技能編輯（SkillsEditForm）共用的
 * 檢定類型選擇 + 對應設定 UI。
 *
 * 差異處理：
 *   - 技能表單在切換到「對抗檢定」時需額外更新效果的 targetType，
 *     透過 `onCheckTypeChange` 回呼交由呼叫方處理。
 */

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CheckType } from '@/lib/utils/check-config-validators';
import type { ContestConfig, RandomConfig, Stat } from '@/types/character';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface CheckConfigSectionProps {
  /** 目前的檢定類型 */
  checkType: CheckType;
  /** 對抗檢定設定（checkType 為 'contest' 或 'random_contest' 時使用） */
  contestConfig: ContestConfig | undefined;
  /** 隨機檢定設定（checkType 為 'random' 時使用） */
  randomConfig: RandomConfig | undefined;
  /** 可選擇的數值列表（用於 contest 的 relatedStat 選單） */
  stats: Stat[];
  /** 劇本的隨機對抗檢定上限值（顯示於 random_contest 說明文字） */
  randomContestMaxValue?: number;
  /**
   * 設定欄位變更時的通用回呼
   * 只傳入需要更新的欄位 patch（checkType / contestConfig / randomConfig）
   */
  onChange: (patch: {
    checkType?: CheckType;
    contestConfig?: ContestConfig | undefined;
    randomConfig?: RandomConfig | undefined;
  }) => void;
  /**
   * 當 checkType 切換時的額外回呼（可選）
   * 技能表單用於同步調整效果的 targetType
   */
  onCheckTypeChange?: (newCheckType: CheckType) => void;
}

// ─── 元件 ───────────────────────────────────────────────────────────────────────

export function CheckConfigSection({
  checkType,
  contestConfig,
  randomConfig,
  stats,
  randomContestMaxValue = 100,
  onChange,
  onCheckTypeChange,
}: CheckConfigSectionProps) {

  /** checkType 切換處理：重設相關設定欄位並通知呼叫方 */
  const handleCheckTypeChange = (value: CheckType) => {
    if (value === 'contest' || value === 'random_contest') {
      onChange({
        checkType: value,
        contestConfig: {
          relatedStat: '',
          opponentMaxItems: 0,
          opponentMaxSkills: 0,
          tieResolution: 'attacker_wins',
        },
        randomConfig: undefined,
      });
    } else if (value === 'random') {
      onChange({
        checkType: value,
        contestConfig: undefined,
        randomConfig: { maxValue: 100, threshold: 50 },
      });
    } else {
      onChange({ checkType: value, contestConfig: undefined, randomConfig: undefined });
    }
    onCheckTypeChange?.(value);
  };

  return (
    <div className="space-y-4">
      {/* 檢定類型選擇 */}
      <div className="space-y-2">
        <Label htmlFor="check-type">檢定類型</Label>
        <Select
          value={checkType || 'none'}
          onValueChange={(value) => handleCheckTypeChange(value as CheckType)}
        >
          <SelectTrigger id="check-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">無檢定</SelectItem>
            <SelectItem value="contest">對抗檢定</SelectItem>
            <SelectItem value="random">隨機檢定</SelectItem>
            <SelectItem value="random_contest">隨機對抗檢定</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 對抗檢定設定 */}
      {checkType === 'contest' && (
        <ContestConfigFields
          contestConfig={contestConfig}
          stats={stats}
          showRelatedStat
          onChange={(patch) => onChange({ contestConfig: patch })}
        />
      )}

      {/* 隨機對抗檢定設定 */}
      {checkType === 'random_contest' && (
        <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
          <Label className="text-sm font-medium">隨機對抗檢定設定</Label>
          <div className="p-2 bg-info/10 rounded text-sm text-foreground mb-3">
            <strong>提示：</strong>隨機對抗檢定使用劇本預設的上限值 <strong>{randomContestMaxValue}</strong>。
            攻擊方和防守方都骰 1 到 {randomContestMaxValue} 的隨機數，比拚大小決定勝負。
            防守方只能選擇「隨機對抗檢定」類型的技能/道具來回應。
            可在劇本設定中修改此值。
          </div>
          <ContestConfigFields
            contestConfig={contestConfig}
            stats={stats}
            showRelatedStat={false}
            onChange={(patch) => onChange({ contestConfig: patch })}
          />
        </div>
      )}

      {/* 隨機檢定設定 */}
      {checkType === 'random' && (
        <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
          <Label className="text-sm font-medium">隨機檢定設定</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>上限值 *</Label>
              <Input
                type="number"
                min={1}
                value={randomConfig?.maxValue ?? 100}
                onChange={(e) => {
                  const maxValue = Math.max(1, parseInt(e.target.value) || 100);
                  const threshold = randomConfig?.threshold ?? 50;
                  onChange({
                    randomConfig: {
                      maxValue,
                      threshold: Math.min(threshold, maxValue),
                    },
                  });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>門檻值 *</Label>
              <Input
                type="number"
                min={1}
                max={randomConfig?.maxValue ?? 100}
                value={randomConfig?.threshold ?? 50}
                onChange={(e) => {
                  const threshold = Math.max(1, parseInt(e.target.value) || 50);
                  const maxValue = randomConfig?.maxValue ?? 100;
                  onChange({
                    randomConfig: {
                      maxValue,
                      threshold: Math.min(threshold, maxValue),
                    },
                  });
                }}
              />
              <p className="text-xs text-muted-foreground">
                檢定結果 ≥ 門檻值時通過
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 內部：對抗檢定欄位（contest / random_contest 共用） ─────────────────────────

interface ContestConfigFieldsProps {
  contestConfig: ContestConfig | undefined;
  stats: Stat[];
  showRelatedStat: boolean;
  onChange: (config: ContestConfig) => void;
}

/** 將 Partial<ContestConfig> 合併預設值，確保輸出為完整的 ContestConfig */
function mergeContestConfig(
  existing: ContestConfig | undefined,
  patch: Partial<ContestConfig>,
): ContestConfig {
  return {
    relatedStat: patch.relatedStat ?? existing?.relatedStat ?? '',
    opponentMaxItems: patch.opponentMaxItems ?? existing?.opponentMaxItems ?? 0,
    opponentMaxSkills: patch.opponentMaxSkills ?? existing?.opponentMaxSkills ?? 0,
    tieResolution: patch.tieResolution ?? existing?.tieResolution ?? 'attacker_wins',
  };
}

function ContestConfigFields({
  contestConfig,
  stats,
  showRelatedStat,
  onChange,
}: ContestConfigFieldsProps) {
  return (
    <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
      <Label className="text-sm font-medium">
        {showRelatedStat ? '對抗檢定設定' : '對方限制設定'}
      </Label>
      <div className="space-y-3">
        {showRelatedStat && (
          <div className="space-y-2">
            <Label>使用的數值 *</Label>
            <Select
              value={contestConfig?.relatedStat || ''}
              onValueChange={(value) => onChange(mergeContestConfig(contestConfig, { relatedStat: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="選擇數值" />
              </SelectTrigger>
              <SelectContent>
                {stats.map((stat) => (
                  <SelectItem key={stat.id} value={stat.name}>
                    {stat.name}
                  </SelectItem>
                ))}
                {stats.length === 0 && (
                  <SelectItem value="" disabled>
                    尚無定義數值
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>對方最多可使用道具數</Label>
            <Input
              type="number"
              min={0}
              value={contestConfig?.opponentMaxItems ?? 0}
              onChange={(e) =>
                onChange(mergeContestConfig(contestConfig, { opponentMaxItems: Math.max(0, parseInt(e.target.value) || 0) }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>對方最多可使用技能數</Label>
            <Input
              type="number"
              min={0}
              value={contestConfig?.opponentMaxSkills ?? 0}
              onChange={(e) =>
                onChange(mergeContestConfig(contestConfig, { opponentMaxSkills: Math.max(0, parseInt(e.target.value) || 0) }))
              }
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>平手裁決方式</Label>
          <Select
            value={contestConfig?.tieResolution || 'attacker_wins'}
            onValueChange={(value: 'attacker_wins' | 'defender_wins' | 'both_fail') =>
              onChange(mergeContestConfig(contestConfig, { tieResolution: value }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="attacker_wins">攻擊方獲勝</SelectItem>
              <SelectItem value="defender_wins">防守方獲勝</SelectItem>
              <SelectItem value="both_fail">雙方失敗</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
