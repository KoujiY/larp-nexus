'use client';

/**
 * 道具 / 技能共用卡片元件
 *
 * 收合時（固定高度）：狀態 badge + 類型標籤 + 名稱 + 描述 line-clamp-1 + footer badges
 * 展開時：完整描述 + 效果列表（左側邊線卡片）+ 檢定資訊 + 使用限制格 + 標籤
 *
 * 道具 / 技能共用：右側漸淡圖片背景（有 imageUrl 時）
 * 狀態系統：new / modified / deleted — 與 StatCard 對齊
 *
 * 展開內容設計參考玩家端 item-detail-dialog / skill-detail-dialog
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, Pencil, Trash2, Undo2, Clock, Upload } from 'lucide-react';
import { uploadAbilityImage } from '@/app/actions/characters';
import { ImageUploadDialog } from '@/components/shared/image-upload-dialog';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/format-duration';
import { IconActionButton } from '@/components/gm/icon-action-button';
import {
  GM_ATTR_BADGE_BASE,
  GM_STATUS_BADGE_BASE,
  GM_BADGE_VARIANTS,
  GM_DETAIL_HEADER_CLASS,
  GM_ACCENT_CARD_CLASS,
} from '@/lib/styles/gm-form';
import { GmInfoLine } from '@/components/gm/gm-info-line';
import type { Item, Skill, ItemEffect, SkillEffect, StatBoost } from '@/types/character';
import type { GmBadgeVariant } from '@/lib/styles/gm-form';

/** 統一的 badge 資訊 */
interface BadgeInfo {
  label: string;
  variant: GmBadgeVariant;
}

type AbilityStatus = 'unchanged' | 'new' | 'modified' | 'deleted';

interface AbilityCardProps {
  /** 道具或技能資料 */
  ability: Item | Skill;
  /** 類型：item 或 skill */
  mode: 'item' | 'skill';
  /** 角色 ID（圖片上傳用） */
  characterId: string;
  /** 遊戲進行中時隱藏上傳按鈕（Runtime 新增項目在 Baseline 找不到） */
  gameIsActive?: boolean;
  /** 卡片狀態 */
  status?: AbilityStatus;
  /** 編輯按鈕事件 */
  onEdit: () => void;
  /** 刪除按鈕事件（軟刪除） */
  onRemove: () => void;
  /** 復原按鈕事件 */
  onRestore?: () => void;
  /** 是否禁用操作 */
  disabled?: boolean;
}

/**
 * 道具 / 技能共用卡片
 */
export function AbilityCard({
  ability,
  mode,
  characterId,
  gameIsActive = false,
  status = 'unchanged',
  onEdit,
  onRemove,
  onRestore,
  disabled,
}: AbilityCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const isItem = mode === 'item';
  const item = isItem ? (ability as Item) : undefined;
  const skill = !isItem ? (ability as Skill) : undefined;
  const isDeleted = status === 'deleted';

  const itemTypeLabels: Record<string, string> = { consumable: '消耗品', tool: '道具', equipment: '裝備' };
  const typeLabel = isItem
    ? itemTypeLabels[item!.type] ?? item!.type
    : '技能';

  const imageUrl = isItem ? item?.imageUrl : skill?.imageUrl;
  const effects = ability.effects ?? [];
  const statBoosts = isItem ? (item!.statBoosts ?? []) : [];
  const isEquipment = isItem && item!.type === 'equipment';
  const tags = isItem ? (item!.tags ?? []) : (skill!.tags ?? []);
  const checkType = isItem ? item!.checkType : skill!.checkType;
  const usageLimit = ability.usageLimit;
  const usageCount = ability.usageCount ?? 0;
  const cooldown = ability.cooldown;

  /** 組裝 footer badges */
  const badges: BadgeInfo[] = [];

  if (isEquipment && statBoosts.length > 0) {
    badges.push({ label: `${statBoosts.length} 個加成`, variant: 'muted' });
  } else if (effects.length > 0) {
    badges.push({ label: `${effects.length} 個效果`, variant: 'muted' });
  }

  if (checkType && checkType !== 'none') {
    const checkLabels: Record<string, string> = {
      contest: '對抗檢定',
      random: '隨機檢定',
      random_contest: '隨機對抗檢定',
    };
    badges.push({ label: checkLabels[checkType] ?? checkType, variant: 'primary' });
  }

  if (usageLimit != null && usageLimit > 0) {
    badges.push({
      label: `${usageLimit - usageCount} / ${usageLimit} 次`,
      variant: 'muted',
    });
  }

  if (cooldown != null && cooldown > 0) {
    badges.push({ label: `冷卻 ${cooldown}s`, variant: 'info' });
  }

  tags.forEach((tag) => {
    const tagLabels: Record<string, string> = { combat: '戰鬥', stealth: '隱匿' };
    badges.push({ label: tagLabels[tag] ?? tag, variant: 'muted' });
  });

  if (isItem && item!.isTransferable) {
    badges.push({ label: '可轉移', variant: 'muted' });
  }

  return (
    <>
    <div
      className={cn(
        'group relative bg-card rounded-xl shadow-sm overflow-hidden',
        'transition-all border border-border/10',
        // 狀態樣式（對齊 StatCard）
        isDeleted && 'opacity-60 bg-muted/30',
        !isDeleted && 'hover:shadow-md',
        status === 'new' && !isDeleted && 'border-primary/20',
        status === 'modified' && !isDeleted && 'bg-primary/5 border-primary/20',
        // 可點擊展開/收合
        !isDeleted && 'cursor-pointer',
      )}
      onClick={isDeleted ? undefined : toggleExpand}
    >
      {/* 道具圖片背景 */}
      {imageUrl && !isDeleted && (
        <div
          className="absolute inset-y-0 right-0 w-1/2 bg-cover bg-center pointer-events-none"
          style={{
            backgroundImage: `url(${imageUrl})`,
            maskImage: 'linear-gradient(to right, transparent 10%, black 80%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 10%, black 80%)',
            opacity: 0.15,
          }}
        />
      )}

      <div className={cn('relative z-10 p-5 flex flex-col', !expanded && 'min-h-[180px]')}>

        {/* ── 頂部：狀態 badge + 類型標籤 + 操作按鈕 ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* 狀態 badge（對齊 StatCard：NEW / MODIFIED） */}
            {(status === 'new' || status === 'modified') && !isDeleted && (
              <span className={cn(
                GM_STATUS_BADGE_BASE,
                status === 'new' ? GM_BADGE_VARIANTS['primary-solid'] : GM_BADGE_VARIANTS.primary,
              )}>
                {status === 'new' ? 'NEW' : 'MODIFIED'}
              </span>
            )}
            {/* 類型標籤（僅道具顯示消耗品/裝備） */}
            {isItem && (
              <span className={cn(
                GM_STATUS_BADGE_BASE,
                isDeleted
                  ? 'bg-muted/50 text-muted-foreground/40'
                  : 'bg-primary/10 text-primary border border-primary/20',
              )}>
                {typeLabel}
              </span>
            )}
            {/* 裝備中狀態（僅 equipment 類型且當前裝備中顯示） */}
            {isEquipment && item!.equipped && !isDeleted && (
              <span className={cn(GM_STATUS_BADGE_BASE, GM_BADGE_VARIANTS.success)}>
                裝備中
              </span>
            )}
          </div>

          {/* 操作按鈕（常時可見） */}
          <div className="flex items-center gap-1 shrink-0">
            {isDeleted ? (
              onRestore && (
                <IconActionButton
                  icon={<Undo2 className="h-4 w-4" />}
                  label="復原"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onRestore(); }}
                  disabled={disabled}
                />
              )
            ) : (
              <>
                {!gameIsActive && (
                  <IconActionButton
                    icon={<Upload className="h-4 w-4" />}
                    label="上傳圖片"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setUploadOpen(true); }}
                    disabled={disabled}
                  />
                )}
                <IconActionButton
                  icon={<Pencil className="h-4 w-4" />}
                  label="編輯"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  disabled={disabled}
                />
                <IconActionButton
                  icon={<Trash2 className="h-4 w-4" />}
                  label="刪除"
                  variant="destructive"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onRemove(); }}
                  disabled={disabled}
                />
              </>
            )}
          </div>
        </div>

        {/* ── 名稱 + 描述 ── */}
        <div className="mt-2">
          <h3 className={cn(
            'text-xl font-black',
            isDeleted ? 'text-muted-foreground/50 line-through' : 'text-foreground',
          )}>
            {ability.name || (isItem ? '未命名物品' : '未命名技能')}
          </h3>
          {!expanded && ability.description && (
            <p className={cn(
              'text-sm mt-1',
              isDeleted
                ? 'text-muted-foreground/30 italic'
                : 'text-muted-foreground line-clamp-1',
            )}>
              {isDeleted ? '即將從列表移除...' : ability.description}
            </p>
          )}
        </div>

        {/* ── 展開內容（在 footer 之前，避免 badges 卡在標題和內容之間） ── */}
        {expanded && !isDeleted && (
          <div className="mt-4 pt-4 border-t border-border/10 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* 描述 */}
            {ability.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {ability.description}
              </p>
            )}

            {/* 裝備加成（equipment 類型專用） */}
            {isEquipment && statBoosts.length > 0 && (
              <div className="space-y-2">
                <h4 className={GM_DETAIL_HEADER_CLASS}>裝備加成</h4>
                <div className="space-y-2">
                  {statBoosts.map((boost, idx) => (
                    <StatBoostCard key={idx} boost={boost} />
                  ))}
                </div>
              </div>
            )}

            {/* 效果列表 — 左側邊線卡片風格 */}
            {effects.length > 0 && (
              <div className="space-y-2">
                <h4 className={GM_DETAIL_HEADER_CLASS}>
                  {isItem ? '特殊效果' : '技能效果'}
                </h4>
                <div className="space-y-2">
                  {effects.map((effect, idx) => (
                    <EffectCard key={idx} effect={effect} />
                  ))}
                </div>
              </div>
            )}

            {/* 檢定資訊 — 左側邊線卡片風格 */}
            {checkType && checkType !== 'none' && (
              <div className="space-y-2">
                <h4 className={GM_DETAIL_HEADER_CLASS}>
                  檢定資訊
                </h4>
                <CheckInfoCard
                  checkType={checkType}
                  contestConfig={isItem ? item!.contestConfig : skill!.contestConfig}
                  randomConfig={isItem ? item!.randomConfig : skill!.randomConfig}
                />
              </div>
            )}

            {/* 使用限制 — 左側邊線卡片風格 */}
            {(usageLimit != null || (cooldown != null && cooldown > 0)) && (
              <div className="space-y-2">
                <h4 className={GM_DETAIL_HEADER_CLASS}>
                  使用限制
                </h4>
                <div className={cn(GM_ACCENT_CARD_CLASS, 'space-y-1.5')}>
                  {usageLimit != null && (
                    <GmInfoLine
                      label="使用次數"
                      value={usageLimit > 0 ? `${usageLimit - usageCount} / ${usageLimit}` : '無限制'}
                    />
                  )}
                  {cooldown != null && cooldown > 0 && (
                    <GmInfoLine label="冷卻時間" value={`${cooldown} 秒`} />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Footer：badges + chevron（收合時 mt-auto 推到底部） ── */}
        {!isDeleted && (
          <div className={cn(
            'flex items-center justify-between gap-2',
            !expanded && 'mt-auto pt-4 border-t border-border/10',
            expanded && 'pt-3 border-t border-border/10',
          )}>
            {badges.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {badges.map((badge, idx) => (
                  <span
                    key={idx}
                    className={cn(GM_ATTR_BADGE_BASE, GM_BADGE_VARIANTS[badge.variant])}
                  >
                    {badge.variant === 'info' && <Clock className="inline h-3 w-3 mr-1 -mt-px" />}
                    {badge.label}
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
            >
              <ChevronDown
                className={cn(
                  'h-5 w-5 transition-transform duration-200',
                  expanded && 'rotate-180',
                )}
              />
            </button>
          </div>
        )}
      </div>

    </div>

    {/* 圖片上傳 Dialog — 放在卡片外層，避免事件冒泡穿透 */}
      <ImageUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        title={`上傳${isItem ? '物品' : '技能'}圖片`}
        description={`選擇一張圖片作為${isItem ? '物品' : '技能'}卡的圖示`}
        preset={isItem ? 'item' : 'skill'}
        onUpload={async (formData) => {
          const result = await uploadAbilityImage(characterId, ability.id, mode, formData);
          return { success: result.success, error: result.success ? undefined : result.message };
        }}
        onError={(msg) => toast.error(msg)}
        onSuccess={() => {
          toast.success('圖片上傳成功');
          router.refresh();
        }}
      />
    </>
  );
}

// ─── 內部子元件 ─────────────────────────────────

/** 效果類型中文標籤 */
const EFFECT_TYPE_LABELS: Record<string, string> = {
  stat_change: '數值變化',
  item_take: '取得物品',
  item_steal: '奪取物品',
  task_reveal: '揭露任務',
  task_complete: '完成任務',
  custom: '自訂效果',
};

/** 目標類型中文標籤 */
const TARGET_TYPE_LABELS: Record<string, string> = {
  self: '自身',
  other: '指定對象',
  any: '任意',
};


/**
 * 單一效果 — 左側邊線卡片
 * 對齊玩家端 EffectDisplay 的 `border-l-2 border-primary/60 rounded-r-xl` 風格
 */
function EffectCard({ effect }: { effect: ItemEffect | SkillEffect }) {
  const typeLabel = EFFECT_TYPE_LABELS[effect.type] ?? effect.type;

  // 目標類型
  const targetType = effect.targetType;
  const targetLabel = targetType ? TARGET_TYPE_LABELS[targetType] : undefined;

  // 持續時間
  const duration = effect.duration;

  // 組裝主要描述行（stat_change 合併為一行）
  let mainLine = '';
  if (effect.type === 'stat_change' && effect.targetStat) {
    const isMax = effect.statChangeTarget === 'maxValue';
    const value = effect.value ?? 0;
    const sign = value >= 0 ? '+' : '';
    mainLine = isMax
      ? `${effect.targetStat} 最大值 ${sign}${value}${effect.syncValue ? '，目前值同步調整' : ''}`
      : `${effect.targetStat} ${sign}${value}`;
  } else if (effect.type === 'task_reveal' && 'targetTaskId' in effect) {
    mainLine = `任務 ID: ${(effect as SkillEffect).targetTaskId}`;
  } else if (effect.type === 'task_complete' && 'targetTaskId' in effect) {
    mainLine = `任務 ID: ${(effect as SkillEffect).targetTaskId}`;
  } else if (effect.description) {
    mainLine = effect.description;
  }

  return (
    <div className={cn(GM_ACCENT_CARD_CLASS, 'space-y-1.5')}>
      {/* 類型 + 數值合併為一行 */}
      <p className="text-xs font-medium text-foreground">
        <span className="text-muted-foreground">{typeLabel}：</span>
        {mainLine || '—'}
      </p>
      {targetLabel && (
        <p className="text-xs text-foreground/90">
          <span className="text-muted-foreground">目標：</span>
          {targetLabel}
        </p>
      )}
      {duration != null && duration > 0 && (
        <p className="text-xs text-foreground/90">
          <span className="text-muted-foreground">時效性：</span>
          {formatDuration(duration)}
        </p>
      )}
    </div>
  );
}

/**
 * 裝備加成卡片 — 左側邊線卡片
 * 格式對齊效果系統的 stat_change 顯示邏輯
 */
function StatBoostCard({ boost }: { boost: StatBoost }) {
  const value = boost.value ?? 0;
  const sign = value >= 0 ? '+' : '';
  const isMax = boost.target === 'maxValue' || boost.target === 'both';
  const syncCurrent = boost.target === 'both';

  const mainLine = isMax
    ? `${boost.statName} 最大值 ${sign}${value}${syncCurrent ? '，目前值同步調整' : ''}`
    : `${boost.statName} ${sign}${value}`;

  return (
    <div className={cn(GM_ACCENT_CARD_CLASS, 'space-y-1.5')}>
      <p className="text-xs font-medium text-foreground">
        <span className="text-muted-foreground">數值變化：</span>
        {mainLine}
      </p>
      <p className="text-xs text-foreground/90">
        <span className="text-muted-foreground">目標：</span>自身
      </p>
    </div>
  );
}

/** 對方回應描述 */
function opponentResponseText(maxItems: number, maxSkills: number): string {
  if (maxItems === 0 && maxSkills === 0) return '不允許';
  const parts: string[] = [];
  if (maxItems > 0) parts.push('允許使用物品');
  if (maxSkills > 0) parts.push('允許使用技能');
  return parts.join('、');
}

/**
 * 檢定資訊卡片 — 左側邊線卡片
 * 對齊玩家端 CheckInfoDisplay 的結構化 InfoLine 風格
 */
function CheckInfoCard({
  checkType,
  contestConfig,
  randomConfig,
}: {
  checkType: string;
  contestConfig?: { relatedStat: string; opponentMaxItems?: number; opponentMaxSkills?: number; tieResolution?: string };
  randomConfig?: { maxValue: number; threshold: number };
}) {
  const tieLabel =
    contestConfig?.tieResolution === 'attacker_wins'
      ? '攻擊方獲勝'
      : contestConfig?.tieResolution === 'defender_wins'
        ? '防守方獲勝'
        : '雙方失敗';

  // 對抗檢定
  if (checkType === 'contest' && contestConfig) {
    const maxItems = contestConfig.opponentMaxItems ?? 0;
    const maxSkills = contestConfig.opponentMaxSkills ?? 0;
    return (
      <div className={cn(GM_ACCENT_CARD_CLASS, 'space-y-1.5')}>
        <GmInfoLine label="類型" value="對抗檢定" />
        <GmInfoLine label="使用數值" value={contestConfig.relatedStat} />
        <GmInfoLine label="對方回應" value={opponentResponseText(maxItems, maxSkills)} />
        <GmInfoLine label="平手裁決" value={tieLabel} />
      </div>
    );
  }

  // 隨機對抗檢定
  if (checkType === 'random_contest' && contestConfig) {
    const maxItems = contestConfig.opponentMaxItems ?? 0;
    const maxSkills = contestConfig.opponentMaxSkills ?? 0;
    return (
      <div className={cn(GM_ACCENT_CARD_CLASS, 'space-y-1.5')}>
        <GmInfoLine label="類型" value="隨機對抗檢定" />
        <GmInfoLine label="使用數值" value={`隨機擲骰 D${randomConfig?.maxValue ?? 100}`} />
        <GmInfoLine label="對方回應" value={opponentResponseText(maxItems, maxSkills)} />
        <GmInfoLine label="平手裁決" value={tieLabel} />
      </div>
    );
  }

  // 隨機檢定
  if (checkType === 'random' && randomConfig) {
    return (
      <div className={cn(GM_ACCENT_CARD_CLASS, 'space-y-1.5')}>
        <GmInfoLine label="類型" value="隨機檢定" />
        <GmInfoLine label="隨機範圍" value={`1 – ${randomConfig.maxValue}`} />
        <GmInfoLine label="成功門檻" value={`≥ ${randomConfig.threshold}`} />
      </div>
    );
  }

  return null;
}
