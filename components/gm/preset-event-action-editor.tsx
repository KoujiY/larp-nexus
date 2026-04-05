'use client';

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_SELECT_CLASS,
} from '@/lib/styles/gm-form';
import type { PresetEventAction, PresetEventActionType, ActionTarget } from '@/types/game';
import type { CharacterData } from '@/types/character';

const ACTION_TYPE_OPTIONS: { value: PresetEventActionType; label: string }[] = [
  { value: 'broadcast', label: '廣播通知' },
  { value: 'stat_change', label: '數值變更' },
  { value: 'reveal_secret', label: '揭露隱藏資訊' },
  { value: 'reveal_task', label: '揭露隱藏任務' },
];

interface PresetEventActionEditorProps {
  action: PresetEventAction;
  characters: CharacterData[];
  onChange: (updated: PresetEventAction) => void;
}

/**
 * 預設事件動作編輯器
 *
 * 依動作類型顯示不同欄位：
 * - broadcast: 目標選取 + 標題 + 訊息
 * - stat_change: 目標選取 + 數值名稱 + 模式 + 數值
 * - reveal_secret: 角色選取 + 隱藏資訊選取
 * - reveal_task: 角色選取 + 隱藏任務選取
 */
export function PresetEventActionEditor({
  action,
  characters,
  onChange,
}: PresetEventActionEditorProps) {
  const update = (partial: Partial<PresetEventAction>) => {
    onChange({ ...action, ...partial });
  };

  const handleTypeChange = (type: PresetEventActionType) => {
    // 切換類型時重置欄位，但 broadcast ↔ stat_change 保留目標選取
    const base: PresetEventAction = { id: action.id, type };
    const prevTargets = action.broadcastTargets ?? action.statTargets ?? 'all';
    switch (type) {
      case 'broadcast':
        onChange({ ...base, broadcastTargets: prevTargets, broadcastTitle: '', broadcastMessage: '' });
        break;
      case 'stat_change':
        onChange({ ...base, statTargets: prevTargets, statName: '', statChangeTarget: 'value', statChangeValue: 0, syncValue: false, duration: 0 });
        break;
      case 'reveal_secret':
      case 'reveal_task':
        onChange({ ...base, revealCharacterId: characters[0]?.id || '', revealTargetId: '' });
        break;
    }
  };

  return (
    <div className="space-y-4">
      {/* 動作類型 */}
      <div>
        <label className={GM_LABEL_CLASS}>動作類型</label>
        <Select value={action.type} onValueChange={(v) => handleTypeChange(v as PresetEventActionType)}>
          <SelectTrigger className={GM_SELECT_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 類型特定欄位 */}
      {action.type === 'broadcast' && (
        <BroadcastFields action={action} characters={characters} onChange={update} />
      )}
      {action.type === 'stat_change' && (
        <StatChangeFields action={action} characters={characters} onChange={update} />
      )}
      {action.type === 'reveal_secret' && (
        <RevealSecretFields action={action} characters={characters} onChange={update} />
      )}
      {action.type === 'reveal_task' && (
        <RevealTaskFields action={action} characters={characters} onChange={update} />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────

/** 多目標選取（全體 / 指定角色） */
function MultiTargetSelector({
  targets,
  characters,
  onChange,
}: {
  targets: ActionTarget | undefined;
  characters: CharacterData[];
  onChange: (targets: ActionTarget) => void;
}) {
  const isAll = targets === 'all';
  const selectedIds = isAll
    ? characters.map((c) => c.id)
    : Array.isArray(targets) ? targets : [];

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      // 勾選全體 → 選取所有角色
      onChange('all');
    } else {
      // 取消全體 → 取消所有角色
      onChange([]);
    }
  };

  const handleToggleCharacter = (charId: string) => {
    const currentIds = isAll ? characters.map((c) => c.id) : [...selectedIds];
    const isSelected = currentIds.includes(charId);

    if (isSelected) {
      // 取消單一角色 → 一定不是 'all'
      const next = currentIds.filter((id) => id !== charId);
      onChange(next);
    } else {
      // 勾選單一角色 → 如果全部勾完就升格為 'all'
      const next = [...currentIds, charId];
      onChange(next.length === characters.length ? 'all' : next);
    }
  };

  return (
    <div>
      <label className={GM_LABEL_CLASS}>目標角色</label>
      <div className="space-y-2 bg-muted/10 rounded-lg p-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={isAll} onCheckedChange={handleToggleAll} />
          <span className="text-sm font-semibold">全體角色</span>
        </label>
        <div className="border-t border-border/20" />
        <div className="grid grid-cols-2 gap-1.5">
          {characters.map((char) => (
            <label key={char.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={selectedIds.includes(char.id)}
                onCheckedChange={() => handleToggleCharacter(char.id)}
              />
              <span className="text-sm truncate">{char.name}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 廣播動作欄位 */
function BroadcastFields({
  action,
  characters,
  onChange,
}: {
  action: PresetEventAction;
  characters: CharacterData[];
  onChange: (partial: Partial<PresetEventAction>) => void;
}) {
  return (
    <>
      <MultiTargetSelector
        targets={action.broadcastTargets}
        characters={characters}
        onChange={(targets) => onChange({ broadcastTargets: targets })}
      />
      <div>
        <label className={GM_LABEL_CLASS}>標題</label>
        <Input
          value={action.broadcastTitle || ''}
          onChange={(e) => onChange({ broadcastTitle: e.target.value })}
          placeholder="廣播標題"
          className={GM_INPUT_CLASS}
          maxLength={100}
        />
      </div>
      <div>
        <label className={GM_LABEL_CLASS}>內容</label>
        <Textarea
          value={action.broadcastMessage || ''}
          onChange={(e) => onChange({ broadcastMessage: e.target.value })}
          placeholder="廣播內容"
          className={cn(GM_INPUT_CLASS, 'h-auto min-h-[80px] py-3 resize-none')}
          maxLength={2000}
        />
      </div>
    </>
  );
}

/** 數值變更動作欄位 */
function StatChangeFields({
  action,
  characters,
  onChange,
}: {
  action: PresetEventAction;
  characters: CharacterData[];
  onChange: (partial: Partial<PresetEventAction>) => void;
}) {
  // 收集所有角色的數值名稱（去重）
  const allStatNames = useMemo(() => {
    const names = new Set<string>();
    for (const char of characters) {
      for (const stat of char.stats || []) {
        names.add(stat.name);
      }
    }
    return Array.from(names).sort();
  }, [characters]);

  const statChangeTarget = action.statChangeTarget ?? 'value';
  const duration = action.duration ?? 0;

  return (
    <>
      <MultiTargetSelector
        targets={action.statTargets}
        characters={characters}
        onChange={(targets) => onChange({ statTargets: targets })}
      />
      {/* Row 1: 數值名稱 + 變更量（±） */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={GM_LABEL_CLASS}>數值名稱</label>
          {allStatNames.length > 0 ? (
            <Select
              value={action.statName || ''}
              onValueChange={(v) => onChange({ statName: v })}
            >
              <SelectTrigger className={GM_SELECT_CLASS}>
                <SelectValue placeholder="選擇數值" />
              </SelectTrigger>
              <SelectContent>
                {allStatNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground/70">尚無角色數值可選擇</p>
          )}
        </div>
        <div>
          <label className={GM_LABEL_CLASS}>變更量（±）</label>
          <Input
            type="number"
            value={action.statChangeValue ?? 0}
            onChange={(e) => onChange({ statChangeValue: parseInt(e.target.value) || 0 })}
            className={GM_INPUT_CLASS}
          />
        </div>
      </div>
      {/* Row 2: 變更目標 + 同步當前值 toggle */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={GM_LABEL_CLASS}>變更目標</label>
          <Select
            value={statChangeTarget}
            onValueChange={(v) => {
              const target = v as 'value' | 'maxValue';
              onChange({
                statChangeTarget: target,
                ...(target === 'value' ? { syncValue: false } : {}),
              });
            }}
          >
            <SelectTrigger className={GM_SELECT_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="value">當前值</SelectItem>
              <SelectItem value="maxValue">最大值</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {statChangeTarget === 'maxValue' && (
          <div>
            <label className={GM_LABEL_CLASS}>同步當前值</label>
            <div className="flex items-center gap-3 h-9">
              <Switch
                checked={action.syncValue ?? false}
                onCheckedChange={(checked) => onChange({ syncValue: !!checked })}
              />
              <span className="text-xs text-muted-foreground">最大值變動時連帶調整當前值</span>
            </div>
          </div>
        )}
      </div>
      <div>
        <label className={GM_LABEL_CLASS}>持續時間</label>
        <div className="flex items-center gap-3">
          <Select
            value={duration > 0 ? 'timed' : 'permanent'}
            onValueChange={(v) => onChange({ duration: v === 'permanent' ? 0 : 60 })}
          >
            <SelectTrigger className={cn(GM_SELECT_CLASS, 'w-[140px]')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="permanent">永久</SelectItem>
              <SelectItem value="timed">限時</SelectItem>
            </SelectContent>
          </Select>
          {duration > 0 && (
            <div className="flex items-center gap-2 flex-1">
              <Input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => onChange({ duration: Math.max(1, parseInt(e.target.value) || 1) })}
                className={cn(GM_INPUT_CLASS, 'w-24')}
              />
              <span className="text-sm text-muted-foreground shrink-0">秒</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** 揭露隱藏資訊欄位 */
function RevealSecretFields({
  action,
  characters,
  onChange,
}: {
  action: PresetEventAction;
  characters: CharacterData[];
  onChange: (partial: Partial<PresetEventAction>) => void;
}) {
  const selectedChar = characters.find((c) => c.id === action.revealCharacterId);
  const secrets = selectedChar?.secretInfo?.secrets || [];
  // 只顯示未揭露的 secret
  const unrevealedSecrets = secrets.filter((s) => !s.isRevealed);

  return (
    <>
      <div>
        <label className={GM_LABEL_CLASS}>目標角色</label>
        <Select
          value={action.revealCharacterId || ''}
          onValueChange={(v) => onChange({ revealCharacterId: v, revealTargetId: '' })}
        >
          <SelectTrigger className={GM_SELECT_CLASS}>
            <SelectValue placeholder="選擇角色" />
          </SelectTrigger>
          <SelectContent>
            {characters.map((char) => (
              <SelectItem key={char.id} value={char.id}>
                {char.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className={GM_LABEL_CLASS}>隱藏資訊</label>
        {unrevealedSecrets.length > 0 ? (
          <Select
            value={action.revealTargetId || ''}
            onValueChange={(v) => onChange({ revealTargetId: v })}
          >
            <SelectTrigger className={GM_SELECT_CLASS}>
              <SelectValue placeholder="選擇要揭露的隱藏資訊" />
            </SelectTrigger>
            <SelectContent>
              {unrevealedSecrets.map((secret) => (
                <SelectItem key={secret.id} value={secret.id}>
                  {secret.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground/70">
            {selectedChar ? '此角色沒有未揭露的隱藏資訊' : '請先選擇角色'}
          </p>
        )}
      </div>
    </>
  );
}

/** 揭露隱藏任務欄位 */
function RevealTaskFields({
  action,
  characters,
  onChange,
}: {
  action: PresetEventAction;
  characters: CharacterData[];
  onChange: (partial: Partial<PresetEventAction>) => void;
}) {
  const selectedChar = characters.find((c) => c.id === action.revealCharacterId);
  const tasks = selectedChar?.tasks || [];
  // 只顯示隱藏且未揭露的任務
  const unrevealedHiddenTasks = tasks.filter((t) => t.isHidden && !t.isRevealed);

  return (
    <>
      <div>
        <label className={GM_LABEL_CLASS}>目標角色</label>
        <Select
          value={action.revealCharacterId || ''}
          onValueChange={(v) => onChange({ revealCharacterId: v, revealTargetId: '' })}
        >
          <SelectTrigger className={GM_SELECT_CLASS}>
            <SelectValue placeholder="選擇角色" />
          </SelectTrigger>
          <SelectContent>
            {characters.map((char) => (
              <SelectItem key={char.id} value={char.id}>
                {char.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className={GM_LABEL_CLASS}>隱藏任務</label>
        {unrevealedHiddenTasks.length > 0 ? (
          <Select
            value={action.revealTargetId || ''}
            onValueChange={(v) => onChange({ revealTargetId: v })}
          >
            <SelectTrigger className={GM_SELECT_CLASS}>
              <SelectValue placeholder="選擇要揭露的隱藏任務" />
            </SelectTrigger>
            <SelectContent>
              {unrevealedHiddenTasks.map((task) => (
                <SelectItem key={task.id} value={task.id}>
                  {task.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground/70">
            {selectedChar ? '此角色沒有未揭露的隱藏任務' : '請先選擇角色'}
          </p>
        )}
      </div>
    </>
  );
}
