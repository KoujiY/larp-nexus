'use client';

/**
 * AbilityEditWizard — 道具/技能編輯 Wizard
 *
 * 共用元件，透過 mode: 'item' | 'skill' 控制差異。
 * 4 步驟：基本資訊 → 檢定系統 → 使用限制 → 效果設計
 *
 * 設計來源：
 * - Stepper: Stitch Step 3
 * - Footer 按鈕: Stitch Step 2
 * - Input: Stitch Step 4 (bg-muted, no border)
 * - Card Selector: Stitch Step 1 (check_circle, tinted bg)
 * - 整體配色: Stitch Step 4 (淺色)
 */

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WizardStepper } from './wizard-stepper';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Plus,
  Trash2,
  CheckCircle,
  FlaskConical,
  Shield,
  ImagePlus,
  Ban,
  Swords,
  Dice5,
  Brain,
  Settings2,
  Info,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { validateCheckConfig, type CheckType } from '@/lib/utils/check-config-validators';
import { normalizeCheckConfig } from '@/lib/utils/check-config-normalizers';
import { getItemEffects } from '@/lib/item/get-item-effects';
import type { Item, Skill, ItemEffect, SkillEffect, Stat, ContestConfig } from '@/types/character';
import { cn } from '@/lib/utils';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_SELECT_CLASS,
  GM_SCROLLBAR_CLASS,
  GM_ERROR_RING_CLASS,
  GM_ERROR_TEXT_CLASS,
} from '@/lib/styles/gm-form';

// ─── Types ──────────────────────────────────────────────────────────────────────

type AbilityEditWizardProps = {
  mode: 'item' | 'skill';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: Item | Skill;
  isNew: boolean;
  stats: Stat[];
  randomContestMaxValue?: number;
  onSave: (data: Item | Skill) => void;
};

// ─── Constants ──────────────────────────────────────────────────────────────────

const STEP_LABELS = ['基本資訊', '檢定系統', '使用限制', '效果設計'];
const TOTAL_STEPS = 4;

/** 向下相容別名 — 統一由 gm-form.ts 匯出 */
const LABEL_CLASS = GM_LABEL_CLASS;
const INPUT_CLASS = GM_INPUT_CLASS;
const SELECT_CLASS = GM_SELECT_CLASS;
const WIZARD_SCROLL = GM_SCROLLBAR_CLASS;

/** Step 2 check type 選項 */
const CHECK_TYPE_OPTIONS: { value: CheckType; label: string; icon: typeof Ban }[] = [
  { value: 'none', label: '無檢定', icon: Ban },
  { value: 'contest', label: '對抗檢定', icon: Swords },
  { value: 'random', label: '隨機檢定', icon: Dice5 },
  { value: 'random_contest', label: '隨機對抗', icon: Brain },
];

/** 效果類型中文對照 */
const EFFECT_TYPE_LABELS: Record<string, string> = {
  stat_change: '數值變更',
  custom: '自訂效果',
  item_take: '移除道具',
  item_steal: '竊取道具',
  task_reveal: '揭露任務',
  task_complete: '完成任務',
};

/** 不可變合併 ContestConfig */
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

// ─── Main Component ─────────────────────────────────────────────────────────────

export function AbilityEditWizard({
  mode,
  open,
  onOpenChange,
  initialData,
  isNew,
  stats,
  randomContestMaxValue = 100,
  onSave,
}: AbilityEditWizardProps) {
  const [data, setData] = useState<Item | Skill>(initialData);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedEffectIndex, setSelectedEffectIndex] = useState(0);
  const [showNameError, setShowNameError] = useState(false);
  const nameFieldRef = useRef<HTMLDivElement>(null);

  // Reset state when dialog opens with new initialData
  const [prevInitialData, setPrevInitialData] = useState(initialData);
  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setData(initialData);
    setCurrentStep(0);
    setSelectedEffectIndex(0);
    setShowNameError(false);
  }

  const isItemMode = mode === 'item';
  const itemData = data as Item;
  const skillData = data as Skill;
  const checkType = (data.checkType || 'none') as CheckType;
  const isContestType = checkType === 'contest' || checkType === 'random_contest';

  const updateData = (patch: Partial<Item & Skill>) => {
    setData((prev) => ({ ...prev, ...patch }));
  };

  // ─── Effects Management ───────────────────────────────────────────────────────

  const effects: (ItemEffect | SkillEffect)[] = isItemMode
    ? (getItemEffects(itemData) || [])
    : (skillData.effects || []);

  const handleAddEffect = () => {
    const newEffect: ItemEffect | SkillEffect = isItemMode
      ? { type: 'stat_change', targetType: 'self', requiresTarget: false, statChangeTarget: 'value' }
      : { type: 'stat_change', ...(isContestType ? { targetType: 'other' as const, requiresTarget: true } : {}) };
    const updatedEffects = [...effects, newEffect];
    updateData({ effects: updatedEffects as ItemEffect[] & SkillEffect[] });
    setSelectedEffectIndex(updatedEffects.length - 1);
  };

  const handleEditEffect = (index: number, effect: ItemEffect | SkillEffect) => {
    const updatedEffects = [...effects];
    updatedEffects[index] = effect;
    updateData({ effects: updatedEffects as ItemEffect[] & SkillEffect[] });
  };

  const handleDeleteEffect = (index: number) => {
    const updatedEffects = effects.filter((_, i) => i !== index);
    updateData({ effects: updatedEffects as ItemEffect[] & SkillEffect[] });
    if (selectedEffectIndex >= updatedEffects.length) {
      setSelectedEffectIndex(Math.max(0, updatedEffects.length - 1));
    }
  };

  /** 更新目前選取的效果 */
  const updateSelectedEffect = (patch: Partial<ItemEffect & SkillEffect>) => {
    const current = effects[selectedEffectIndex];
    if (!current) return;
    handleEditEffect(selectedEffectIndex, { ...current, ...patch } as ItemEffect | SkillEffect);
  };

  // ─── Check Type Change（合併 CheckConfigSection + skill 效果同步邏輯） ────────

  const handleCheckTypeSelect = (value: CheckType) => {
    if (value === checkType) return;

    if (value === 'contest' || value === 'random_contest') {
      updateData({
        checkType: value,
        contestConfig: { relatedStat: '', opponentMaxItems: 0, opponentMaxSkills: 0, tieResolution: 'attacker_wins' },
        randomConfig: undefined,
      });
    } else if (value === 'random') {
      updateData({ checkType: value, contestConfig: undefined, randomConfig: { maxValue: 100, threshold: 50 } });
    } else {
      updateData({ checkType: value, contestConfig: undefined, randomConfig: undefined });
    }

    // Skill mode: 切換到對抗時，同步效果 targetType
    if (!isItemMode && (value === 'contest' || value === 'random_contest')) {
      const currentEffects = skillData.effects || [];
      if (currentEffects.length > 0) {
        const updatedEffects: SkillEffect[] = currentEffects.map((e) => ({
          ...e, targetType: 'other' as const, requiresTarget: true,
        }));
        setData((prev) => ({ ...prev, checkType: value, effects: updatedEffects } as Skill));
      }
    }
  };

  // ─── Effect Type Change（複製 EffectEditor 邏輯） ─────────────────────────────

  const handleEffectTypeChange = (value: string) => {
    const effect = effects[selectedEffectIndex];
    if (!effect) return;

    let updated: ItemEffect | SkillEffect;
    if (value === 'stat_change') {
      updated = { ...effect, type: 'stat_change', targetType: effect.targetType || 'self', requiresTarget: effect.targetType !== 'self', statChangeTarget: effect.statChangeTarget || 'value' };
    } else if (value === 'item_take' || value === 'item_steal') {
      updated = { ...effect, type: value, targetType: 'other', requiresTarget: true };
    } else if (value === 'custom') {
      updated = { ...effect, type: 'custom', description: effect.description };
    } else if (value === 'task_reveal' || value === 'task_complete') {
      updated = { ...effect, type: value, targetTaskId: (effect as SkillEffect).targetTaskId } as SkillEffect;
    } else {
      return;
    }
    handleEditEffect(selectedEffectIndex, updated);
  };

  // ─── Navigation ───────────────────────────────────────────────────────────────

  const handleNext = () => {
    if (currentStep === 0 && !data.name.trim()) {
      setShowNameError(true);
      toast.error(`${isItemMode ? '道具' : '技能'}名稱不可為空`);
      nameFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
  };

  const handleBack = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const handleSave = () => {
    if (!data.name.trim()) {
      toast.error(`${isItemMode ? '道具' : '技能'}名稱不可為空`);
      setCurrentStep(0);
      setShowNameError(true);
      requestAnimationFrame(() => nameFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    const validation = validateCheckConfig(checkType, data.contestConfig, data.randomConfig);
    if (!validation.valid) {
      toast.error(validation.errorMessage);
      setCurrentStep(1);
      return;
    }
    const configPatch = normalizeCheckConfig(checkType, data.contestConfig, data.randomConfig);
    const finalData = isItemMode
      ? { ...itemData, effects: getItemEffects(itemData), ...configPatch }
      : { ...skillData, ...configPatch };
    onSave(finalData);
    onOpenChange(false);
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  const getEffectLabel = (effect: ItemEffect | SkillEffect): string => {
    switch (effect.type) {
      case 'stat_change':
        return effect.targetStat
          ? `數值變更: ${effect.targetStat} ${(effect.value ?? 0) >= 0 ? '+' : ''}${effect.value ?? 0}`
          : '數值變更';
      case 'custom':
        return effect.description ? `自訂: ${effect.description.slice(0, 15)}` : '自訂效果';
      case 'item_take': return '移除道具';
      case 'item_steal': return '竊取道具';
      case 'task_reveal': return '揭露任務';
      case 'task_complete': return '完成任務';
      default: return '未知效果';
    }
  };

  // ─── Step 1: 基本資訊 ────────────────────────────────────────────────────────

  const renderBasicInfoStep = () => {
    const currentTags = data.tags ?? [];
    const toggleTag = (tag: string) => {
      const newTags = currentTags.includes(tag)
        ? currentTags.filter((t) => t !== tag)
        : [...currentTags, tag];
      updateData({ tags: newTags });
    };

    const tagCheckbox = (tag: string, label: string) => {
      const checked = currentTags.includes(tag);
      return (
        <button key={tag} type="button" onClick={() => toggleTag(tag)} className="flex items-center gap-3 cursor-pointer group">
          <div className={cn(
            'w-5 h-5 border-2 rounded flex items-center justify-center transition-all',
            checked ? 'border-primary bg-primary' : 'border-border/30 group-hover:border-border/50',
          )}>
            {checked && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
          </div>
          <span className={cn('text-sm font-semibold', checked ? 'text-foreground' : 'text-muted-foreground')}>
            {label}
          </span>
        </button>
      );
    };

    return (
      <div className="space-y-8 max-w-2xl mx-auto">
        {/* 名稱 + 數量 */}
        <div className={cn('grid gap-8', isItemMode ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1')}>
          <div ref={nameFieldRef} className={cn('relative', isItemMode ? 'md:col-span-2' : '')}>
            <label className={LABEL_CLASS}>{isItemMode ? '道具' : '技能'}名稱 *</label>
            <Input
              value={data.name}
              onChange={(e) => { updateData({ name: e.target.value }); if (showNameError) setShowNameError(false); }}
              placeholder={isItemMode ? '輸入道具名稱...' : '輸入技能名稱...'}
              className={cn(INPUT_CLASS, showNameError && !data.name.trim() && GM_ERROR_RING_CLASS)}
            />
            {showNameError && !data.name.trim() && (
              <p className={GM_ERROR_TEXT_CLASS}>此欄位為必填，請輸入名稱後繼續</p>
            )}
          </div>
          {isItemMode && (
            <div>
              <label className={LABEL_CLASS}>道具數量</label>
              <Input
                type="number" min={1} value={itemData.quantity}
                onChange={(e) => updateData({ quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                className={cn(INPUT_CLASS, 'text-center')}
              />
            </div>
          )}
        </div>

        {/* 描述 */}
        <div>
          <label className={LABEL_CLASS}>{isItemMode ? '道具' : '技能'}描述</label>
          <Textarea
            value={data.description}
            onChange={(e) => updateData({ description: e.target.value })}
            placeholder={isItemMode ? '描述此道具的外觀、來源或特殊傳說...' : '描述技能的效果和使用方式...'}
            rows={3} className="bg-muted border-none shadow-none h-auto py-3 px-4 font-semibold focus-visible:ring-primary resize-none"
          />
        </div>

        {/* 圖片上傳預留區 */}
        {isItemMode ? (
          <div>
            <label className={LABEL_CLASS}>道具圖片</label>
            <div className="border-2 border-dashed border-border/30 rounded-xl p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground/50">
              <ImagePlus className="h-8 w-8" />
              <span className="text-[10px] font-bold uppercase tracking-widest">圖片上傳</span>
              <Badge variant="secondary" className="text-[10px]">即將推出</Badge>
            </div>
          </div>
        ) : (
          <div>
            <label className={LABEL_CLASS}>技能圖示</label>
            <div className="border-2 border-dashed border-border/30 rounded-xl p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground/50">
              <ImagePlus className="h-8 w-8" />
              <span className="text-[10px] font-bold uppercase tracking-widest">圖片上傳</span>
              <Badge variant="secondary" className="text-[10px]">即將推出</Badge>
            </div>
          </div>
        )}

        {/* 道具類型選擇 */}
        {isItemMode && (
          <div>
            <label className={LABEL_CLASS}>道具類型</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ItemTypeCard icon={<FlaskConical className="h-6 w-6" />} title="消耗品" subtitle="用完即棄" selected={itemData.type === 'consumable'} onClick={() => updateData({ type: 'consumable', usageLimit: 1 })} />
              <ItemTypeCard icon={<Shield className="h-6 w-6" />} title="裝備" subtitle="長期持有" selected={itemData.type === 'equipment'} onClick={() => updateData({ type: 'equipment', usageLimit: 0 })} />
            </div>
          </div>
        )}

        {/* 可轉移開關 + 標籤（2-column grid） */}
        {isItemMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-4">
            <div className="flex items-center justify-between p-5 bg-muted rounded-xl border border-border/10">
              <span className="text-sm font-bold text-foreground">允許玩家之間轉移此道具</span>
              <Switch checked={itemData.isTransferable} onCheckedChange={(checked) => updateData({ isTransferable: checked })} />
            </div>
            <div className="space-y-4">
              <label className={LABEL_CLASS}>附加標籤</label>
              <div className="flex flex-wrap gap-6">
                {tagCheckbox('combat', '戰鬥道具')}
                {tagCheckbox('stealth', '隱匿道具')}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className={LABEL_CLASS}>附加標籤</label>
            <div className="flex flex-wrap gap-6">
              {tagCheckbox('combat', '戰鬥')}
              {tagCheckbox('stealth', '隱匿')}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Step 2: 檢定系統 ────────────────────────────────────────────────────────

  const renderCheckConfigStep = () => {
    const showRelatedStat = checkType === 'contest';
    const showContestFields = checkType === 'contest' || checkType === 'random_contest';
    const showRandomFields = checkType === 'random';

    const selectTriggerClass = SELECT_CLASS;

    return (
      <div className="max-w-2xl mx-auto space-y-10">
        {/* 檢定類型卡片選擇 */}
        <div>
          <label className={cn(LABEL_CLASS, 'mb-6')}>檢定類型選擇</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CHECK_TYPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = checkType === opt.value;
              return (
                <button
                  key={opt.value} type="button" onClick={() => handleCheckTypeSelect(opt.value)}
                  className={cn(
                    'group relative p-5 rounded-xl transition-all flex flex-col items-center text-center gap-3 overflow-hidden',
                    selected ? 'bg-card border-2 border-primary shadow-md' : 'bg-card/60 border border-transparent hover:bg-card hover:shadow-md',
                  )}
                >
                  {selected && (
                    <div className="absolute top-0 right-0 p-1 bg-primary rounded-bl-lg">
                      <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                    </div>
                  )}
                  <Icon className={cn('h-6 w-6', selected ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                  <span className={cn('font-bold text-sm', selected ? 'text-foreground' : 'text-muted-foreground')}>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 對抗檢定 / 隨機對抗檢定詳細配置 */}
        {showContestFields && (
          <section className="p-8 bg-muted rounded-xl space-y-8">
            <div className="flex items-center gap-3">
              <Settings2 className="h-5 w-5 text-primary" />
              <h3 className="font-bold tracking-tight text-foreground">
                {checkType === 'contest' ? '對抗檢定詳細配置' : '隨機對抗檢定配置'}
              </h3>
            </div>

            {checkType === 'random_contest' && (
              <div className="p-4 bg-card rounded-lg text-sm text-muted-foreground leading-relaxed">
                隨機對抗檢定使用劇本預設的上限值 <strong className="text-foreground">{randomContestMaxValue}</strong>。
                攻擊方和防守方都骰 1 到 {randomContestMaxValue} 的隨機數，比拚大小決定勝負。
              </div>
            )}

            {showRelatedStat && (
              <div className="space-y-3">
                <label className={LABEL_CLASS}>關聯屬性設定</label>
                <Select
                  value={data.contestConfig?.relatedStat || ''}
                  onValueChange={(value) => updateData({ contestConfig: mergeContestConfig(data.contestConfig, { relatedStat: value }) })}
                >
                  <SelectTrigger className={selectTriggerClass}><SelectValue placeholder="選擇數值" /></SelectTrigger>
                  <SelectContent>
                    {stats.map((stat) => (<SelectItem key={stat.id} value={stat.name}>{stat.name}</SelectItem>))}
                    {stats.length === 0 && <SelectItem value="" disabled>尚無定義數值</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-3">
              <label className={LABEL_CLASS}>防禦方權限</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-4 bg-card/60 rounded-lg cursor-pointer hover:bg-card transition-colors">
                  <input
                    type="checkbox" checked={(data.contestConfig?.opponentMaxItems ?? 0) > 0}
                    onChange={(e) => updateData({ contestConfig: mergeContestConfig(data.contestConfig, { opponentMaxItems: e.target.checked ? 99 : 0 }) })}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-foreground">允許防守方使用道具回應</span>
                </label>
                <label className="flex items-center gap-3 p-4 bg-card/60 rounded-lg cursor-pointer hover:bg-card transition-colors">
                  <input
                    type="checkbox" checked={(data.contestConfig?.opponentMaxSkills ?? 0) > 0}
                    onChange={(e) => updateData({ contestConfig: mergeContestConfig(data.contestConfig, { opponentMaxSkills: e.target.checked ? 99 : 0 }) })}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-foreground">允許防守方使用技能回應</span>
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <label className={LABEL_CLASS}>平局判定規則</label>
              <Select
                value={data.contestConfig?.tieResolution || 'attacker_wins'}
                onValueChange={(value: 'attacker_wins' | 'defender_wins' | 'both_fail') => updateData({ contestConfig: mergeContestConfig(data.contestConfig, { tieResolution: value }) })}
              >
                <SelectTrigger className={selectTriggerClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="attacker_wins">攻擊方勝</SelectItem>
                  <SelectItem value="defender_wins">防守方勝</SelectItem>
                  <SelectItem value="both_fail">雙方失敗</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>
        )}

        {/* 隨機檢定配置 */}
        {showRandomFields && (
          <section className="p-8 bg-muted rounded-xl space-y-8">
            <div className="flex items-center gap-3">
              <Settings2 className="h-5 w-5 text-primary" />
              <h3 className="font-bold tracking-tight text-foreground">隨機檢定配置</h3>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className={LABEL_CLASS}>上限值 *</label>
                <Input
                  type="number" min={1} value={data.randomConfig?.maxValue ?? 100}
                  onChange={(e) => {
                    const maxValue = Math.max(1, parseInt(e.target.value) || 100);
                    const threshold = data.randomConfig?.threshold ?? 50;
                    updateData({ randomConfig: { maxValue, threshold: Math.min(threshold, maxValue) } });
                  }}
                  className="bg-card border-none shadow-none rounded-lg px-4 h-11 font-semibold focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
              <div className="space-y-3">
                <label className={LABEL_CLASS}>門檻值 *</label>
                <Input
                  type="number" min={1} max={data.randomConfig?.maxValue ?? 100}
                  value={data.randomConfig?.threshold ?? 50}
                  onChange={(e) => {
                    const threshold = Math.max(1, parseInt(e.target.value) || 50);
                    const maxValue = data.randomConfig?.maxValue ?? 100;
                    updateData({ randomConfig: { maxValue, threshold: Math.min(threshold, maxValue) } });
                  }}
                  className="bg-card border-none shadow-none rounded-lg px-4 h-11 font-semibold focus-visible:ring-2 focus-visible:ring-primary"
                />
                <p className="text-xs text-muted-foreground">檢定結果 ≥ 門檻值時通過</p>
              </div>
            </div>
          </section>
        )}
      </div>
    );
  };

  // ─── Step 3: 使用限制 ────────────────────────────────────────────────────────

  const renderUsageLimitStep = () => {
    const usageLimit = isItemMode ? itemData.usageLimit : skillData.usageLimit;
    const cooldown = isItemMode ? itemData.cooldown : skillData.cooldown;
    const isConsumable = isItemMode && itemData.type === 'consumable';
    const step3Input = 'w-full bg-card border border-border rounded-xl py-4 px-5 h-auto font-bold focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:border-primary transition-all';

    return (
      <section className="max-w-md mx-auto space-y-10 py-4">
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <label className="text-sm font-extrabold text-foreground tracking-tight">使用次數</label>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Usage Count</span>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="number" min={0} value={usageLimit ?? (isConsumable ? 1 : 0)}
              onChange={(e) => updateData({ usageLimit: Math.max(0, parseInt(e.target.value) || 0) })}
              className={step3Input}
            />
            <span className="text-xs font-extrabold text-muted-foreground bg-muted px-3 py-2 rounded-lg border border-border/50 shrink-0">次</span>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            {isConsumable ? '消耗品建議至少 1 次。' : '設定為 0 表示無使用次數限制。'}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <label className="text-sm font-extrabold text-foreground tracking-tight">冷卻時間</label>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Cooldown Period</span>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="number" min={0} value={cooldown ?? 0}
              onChange={(e) => updateData({ cooldown: parseInt(e.target.value) || 0 })}
              className={step3Input}
            />
            <span className="text-xs font-extrabold text-muted-foreground bg-muted px-3 py-2 rounded-lg border border-border/50 shrink-0">分鐘</span>
          </div>
          <p className="text-xs text-muted-foreground font-medium">兩次使用之間必須等待的時間間隔。設為 0 表示無冷卻。</p>
        </div>

        <div className="p-6 bg-muted rounded-2xl border border-border/50 flex gap-4 mt-4">
          <Info className="h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            限制條件將直接影響{isItemMode ? '道具' : '技能'}的戰略價值與稀有度。
            {isConsumable && '若為消耗性道具，請務必設定正確的使用次數。'}
          </p>
        </div>
      </section>
    );
  };

  // ─── Step 4: 效果設計（Master-Detail） ────────────────────────────────────────

  const renderEffectsStep = () => {
    const availableTypes: Array<'stat_change' | 'custom' | 'item_take' | 'item_steal' | 'task_reveal' | 'task_complete'> = isItemMode
      ? ['stat_change', 'custom', 'item_take', 'item_steal']
      : ['stat_change', 'item_take', 'item_steal', 'task_reveal', 'task_complete', 'custom'];

    const selectedEffect = effects[selectedEffectIndex];

    return (
      <div className="flex gap-0 h-full">
        {/* Left Sidebar */}
        <aside className="w-[30%] bg-muted flex flex-col border-r border-border/30">
          <div className={cn('flex-1 overflow-y-auto p-6 pb-0 flex flex-col gap-3', WIZARD_SCROLL)}>
            <div className={LABEL_CLASS}>效果列表</div>
            {effects.map((effect, index) => (
              <div
                key={index} role="button" tabIndex={0}
                onClick={() => setSelectedEffectIndex(index)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedEffectIndex(index); } }}
                className={cn(
                  'w-full text-left p-4 rounded-lg transition-all flex items-center gap-3 cursor-pointer shrink-0',
                  index === selectedEffectIndex ? 'bg-card border-l-4 border-primary shadow-sm' : 'hover:bg-card/50',
                )}
              >
                <div className="overflow-hidden flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{getEffectLabel(effect)}</div>
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase">效果 {index + 1}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDeleteEffect(index); }}
                  className="p-1 text-muted-foreground/50 hover:text-destructive rounded transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="p-6 pt-3 shrink-0">
            <button
              type="button" onClick={handleAddEffect}
              className="w-full py-3 px-4 border-2 border-dashed border-border/30 rounded-lg text-muted-foreground text-sm font-bold flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-all"
            >
              <Plus className="h-4 w-4" />新增效果
            </button>
          </div>
        </aside>

        {/* Right Panel */}
        <section className={cn('flex-1 p-10 overflow-y-auto', WIZARD_SCROLL)}>
          {selectedEffect ? (
            <WizardEffectPanel
              effect={selectedEffect}
              index={selectedEffectIndex}
              stats={stats}
              availableTypes={availableTypes}
              isContestType={isContestType}
              onTypeChange={handleEffectTypeChange}
              onUpdate={updateSelectedEffect}
              onDelete={() => handleDeleteEffect(selectedEffectIndex)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
              <Plus className="h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm font-medium">尚無效果</p>
              <p className="text-xs">點擊左側「新增效果」開始設定</p>
            </div>
          )}
        </section>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] lg:max-w-5xl h-[85vh] overflow-hidden p-0 gap-0 flex flex-col" showCloseButton={false}>
        <DialogTitle className="sr-only">
          {isNew ? '新增' : '編輯'}{isItemMode ? '道具' : '技能'}
        </DialogTitle>
        <header className="px-8 pt-8 pb-6 bg-muted shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                {isNew ? '新增' : '編輯'}{isItemMode ? '道具' : '技能'}
              </h1>
              <p className="text-muted-foreground text-xs font-bold tracking-widest uppercase mt-1">{STEP_LABELS[currentStep]}</p>
            </div>
            <WizardStepper currentStep={currentStep} stepLabels={STEP_LABELS} />
          </div>
        </header>

        <div className={cn('flex-1 overflow-hidden', currentStep !== 3 && `overflow-y-auto p-8 ${WIZARD_SCROLL}`)}>
          {currentStep === 0 && renderBasicInfoStep()}
          {currentStep === 1 && renderCheckConfigStep()}
          {currentStep === 2 && renderUsageLimitStep()}
          {currentStep === 3 && renderEffectsStep()}
        </div>

        <footer className="px-8 py-6 bg-muted/50 border-t border-border/20 flex justify-between items-center shrink-0">
          {currentStep === 0 ? (
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground font-bold text-xs uppercase tracking-widest">取消</Button>
          ) : (
            <Button variant="outline" onClick={handleBack} className="px-8 py-3 h-auto border-border rounded-lg font-bold text-xs uppercase tracking-widest">
              <ChevronLeft className="h-4 w-4 mr-1" />上一步
            </Button>
          )}
          {currentStep < TOTAL_STEPS - 1 ? (
            <Button onClick={handleNext} className="px-8 py-3 h-auto bg-primary text-primary-foreground rounded-lg font-bold text-xs uppercase tracking-widest shadow-md hover:opacity-90 transition-all">
              下一步<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSave} className="px-8 py-3 h-auto bg-primary text-primary-foreground rounded-lg font-bold text-xs uppercase tracking-widest shadow-md hover:opacity-90 transition-all">
              儲存{isItemMode ? '道具' : '技能'}<Save className="h-4 w-4 ml-1" />
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

/** 道具類型選擇卡片（Step 1 Card Selector 設計） */
function ItemTypeCard({
  icon, title, subtitle, selected, onClick,
}: {
  icon: React.ReactNode; title: string; subtitle: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn(
        'relative cursor-pointer p-5 rounded-xl border-2 transition-all flex items-center gap-4 text-left',
        selected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/20 bg-card hover:border-border/50',
      )}
    >
      <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center', selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
        {icon}
      </div>
      <div>
        <h4 className={cn('font-bold', selected ? 'text-foreground' : 'text-muted-foreground')}>{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {selected && <div className="absolute top-4 right-4"><CheckCircle className="h-5 w-5 text-primary" /></div>}
    </button>
  );
}

/** Step 4 右側面板：效果編輯器（Wizard 專用樣式，取代 EffectEditor 元件） */
function WizardEffectPanel({
  effect, index, stats, availableTypes, isContestType, onTypeChange, onUpdate, onDelete,
}: {
  effect: ItemEffect | SkillEffect;
  index: number;
  stats: Stat[];
  availableTypes: string[];
  isContestType: boolean;
  onTypeChange: (value: string) => void;
  onUpdate: (patch: Partial<ItemEffect & SkillEffect>) => void;
  onDelete: () => void;
}) {
  const targetType: 'self' | 'other' | 'any' = effect.targetType || 'self';
  const restrictedTargetType = isContestType ? 'other' : targetType;
  const targetStatData = effect.targetStat ? stats.find((s) => s.name === effect.targetStat) : null;
  const hasMaxValue = targetStatData?.maxValue !== undefined && targetStatData.maxValue !== null;
  const statChangeTarget = effect.statChangeTarget || 'value';

  const PI = 'bg-muted/50 border-none shadow-none rounded-lg px-4 h-11 font-bold focus-visible:ring-2 focus-visible:ring-primary';
  const PS = cn(SELECT_CLASS, 'bg-muted/50');

  /** 目標範圍分段控制 */
  const targetScopeControl = (
    <div className="space-y-2">
      <label className={LABEL_CLASS}>目標範圍</label>
      <div className="flex p-1 bg-muted rounded-xl w-fit">
        {(['self', 'other', 'any'] as const).map((scope) => {
          const label = scope === 'self' ? '自己' : scope === 'other' ? '對方' : '任意';
          const isSelected = restrictedTargetType === scope;
          const isDisabled = isContestType && scope !== 'other';
          return (
            <button
              key={scope} type="button" disabled={isDisabled}
              onClick={() => { if (!isContestType) onUpdate({ targetType: scope, requiresTarget: scope !== 'self' }); }}
              className={cn(
                'px-6 py-2 rounded-lg text-sm font-bold transition-all',
                isSelected ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                isDisabled && 'opacity-30 cursor-not-allowed',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {isContestType && <p className="text-xs text-muted-foreground">對抗檢定類型只能選擇「對方」作為目標</p>}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-foreground">效果配置</h2>
          <p className="text-muted-foreground text-sm mt-1">效果 {index + 1}</p>
        </div>
        <button type="button" onClick={onDelete} className="p-2 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded-full transition-all" title="刪除效果">
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      {/* 效果類型 */}
      <div className="space-y-2">
        <label className={LABEL_CLASS}>效果類型</label>
        <Select value={effect.type} onValueChange={onTypeChange}>
          <SelectTrigger className={PS}><SelectValue /></SelectTrigger>
          <SelectContent>
            {availableTypes.map((type) => (<SelectItem key={type} value={type}>{EFFECT_TYPE_LABELS[type] || type}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* ── stat_change ── */}
      {effect.type === 'stat_change' && (
        <>
          {targetScopeControl}
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className={LABEL_CLASS}>目標屬性</label>
              <Select
                value={effect.targetStat || ''}
                onValueChange={(value) => {
                  const stat = stats.find((s) => s.name === value);
                  const hasMax = stat?.maxValue !== undefined && stat?.maxValue !== null;
                  onUpdate({ targetStat: value, statChangeTarget: hasMax ? (effect.statChangeTarget || 'value') : 'value', syncValue: hasMax ? effect.syncValue : undefined });
                }}
              >
                <SelectTrigger className={PS}><SelectValue placeholder="選擇數值" /></SelectTrigger>
                <SelectContent>{stats.map((s) => (<SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className={LABEL_CLASS}>變化值</label>
              <Input
                type="number" value={effect.value || ''}
                onChange={(e) => onUpdate({ value: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="+5 或 -10" className={PI}
              />
            </div>
          </div>

          {hasMaxValue && (
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className={LABEL_CLASS}>作用目標</label>
                <Select value={statChangeTarget} onValueChange={(v: 'value' | 'maxValue') => onUpdate({ statChangeTarget: v })}>
                  <SelectTrigger className={PS}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="value">目前值</SelectItem>
                    <SelectItem value="maxValue">最大值</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {statChangeTarget === 'maxValue' && (
                <div className="space-y-2">
                  <label className={LABEL_CLASS}>同步目前值</label>
                  <div className="flex items-center gap-3 py-3">
                    <Switch checked={Boolean(effect.syncValue)} onCheckedChange={(checked) => onUpdate({ syncValue: checked })} />
                    <span className="text-xs text-muted-foreground">最大值變動時連帶調整目前值</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className={LABEL_CLASS}>持續時間（分鐘）</label>
            <div className="flex items-center gap-4">
              <Input
                type="number" min={0}
                value={effect.duration !== undefined && effect.duration > 0 ? Math.round(effect.duration / 60) : ''}
                onChange={(e) => { const m = e.target.value ? parseInt(e.target.value) : 0; onUpdate({ duration: m > 0 ? m * 60 : undefined }); }}
                placeholder="0" className={cn(PI, 'flex-1')}
              />
              <span className="text-muted-foreground text-xs font-bold uppercase shrink-0">(0 = 永久)</span>
            </div>
          </div>
        </>
      )}

      {/* ── item_take / item_steal ── */}
      {(effect.type === 'item_take' || effect.type === 'item_steal') && (
        <>
          {targetScopeControl}
          <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground leading-relaxed">
            {effect.type === 'item_steal'
              ? '使用時需要選擇目標角色與其道具。檢定成功後，道具會轉移到使用者身上。'
              : '使用時需要選擇目標角色與其道具。檢定成功後，該道具會從目標身上移除。'}
          </div>
        </>
      )}

      {/* ── task_reveal / task_complete ── */}
      {(effect.type === 'task_reveal' || effect.type === 'task_complete') && (
        <div className="space-y-2">
          <label className={LABEL_CLASS}>目標任務 ID</label>
          <Input value={(effect as SkillEffect).targetTaskId || ''} onChange={(e) => onUpdate({ targetTaskId: e.target.value })} placeholder="任務 ID" className={PI} />
        </div>
      )}

      {/* ── custom ── */}
      {effect.type === 'custom' && (
        <div className="space-y-2">
          <label className={LABEL_CLASS}>效果描述</label>
          <Textarea value={effect.description || ''} onChange={(e) => onUpdate({ description: e.target.value })} placeholder="描述自訂效果..." rows={3} className={cn(PI, 'h-auto py-3 resize-none')} />
        </div>
      )}
    </div>
  );
}
