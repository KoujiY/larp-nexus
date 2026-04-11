'use client';

/**
 * 預設事件編輯 Dialog — Master-Detail Layout
 *
 * 上方：事件名稱 + 備註說明
 * 下方：左欄動作列表（新增/刪除） + 右欄選中動作的編輯器
 *
 * 設計對齊 AbilityEditWizard Step 4（效果設計）
 */

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Plus, Trash2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PresetEventActionEditor } from '@/components/gm/preset-event-action-editor';
import {
  GM_DIALOG_CONTENT_CLASS,
  GM_DIALOG_FOOTER_CLASS,
  GM_CANCEL_BUTTON_CLASS,
  GM_CTA_BUTTON_CLASS,
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_SCROLLBAR_CLASS,
} from '@/lib/styles/gm-form';
import type { PresetEvent, PresetEventAction, PresetEventInput } from '@/types/game';
import type { CharacterData } from '@/types/character';

import { PRESET_ACTION_TYPE_LABELS } from '@/lib/preset-event/constants';

interface PresetEventEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: PresetEvent | null;
  characters: CharacterData[];
  onSave: (data: PresetEventInput) => Promise<void>;
  isSubmitting: boolean;
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyAction(): PresetEventAction {
  return {
    id: generateId(),
    type: 'broadcast',
    broadcastTargets: 'all',
    broadcastTitle: '',
    broadcastMessage: '',
  };
}

export function PresetEventEditor({
  open,
  onOpenChange,
  event,
  characters,
  onSave,
  isSubmitting,
}: PresetEventEditorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showName, setShowName] = useState(false);
  const [actions, setActions] = useState<PresetEventAction[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Render-time state adjustment：追蹤前次 open/event，變更時重置表單
  // 避免 useEffect 內 setState 造成 cascading render
  const [prevOpen, setPrevOpen] = useState(false);
  const [prevEvent, setPrevEvent] = useState<PresetEvent | null>(null);
  if (open !== prevOpen || (open && event !== prevEvent)) {
    setPrevOpen(open);
    setPrevEvent(event);
    if (open) {
      setName(event?.name ?? '');
      setDescription(event?.description ?? '');
      setShowName(event?.showName ?? false);
      setActions(event ? event.actions.map((a) => ({ ...a })) : [createEmptyAction()]);
      setSelectedIndex(0);
    }
  }

  const handleAddAction = useCallback(() => {
    const newAction = createEmptyAction();
    setActions((prev) => [...prev, newAction]);
    setSelectedIndex((prev) => prev + 1);
  }, []);

  const handleDeleteAction = useCallback((index: number) => {
    setActions((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      return next;
    });
    setSelectedIndex((prev) => {
      if (prev >= index && prev > 0) return prev - 1;
      return prev;
    });
  }, []);

  const handleUpdateAction = useCallback((index: number, updated: PresetEventAction) => {
    setActions((prev) => prev.map((a, i) => (i === index ? updated : a)));
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (actions.length === 0) return;
    await onSave({ name: name.trim(), description: description.trim() || undefined, showName, actions });
  };

  const isValid = name.trim().length > 0 && actions.length > 0;
  const selectedAction = actions[selectedIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(GM_DIALOG_CONTENT_CLASS, 'max-w-[95vw] lg:max-w-5xl h-[85vh] flex flex-col p-0 gap-0')}>
        {/* ── Header：名稱 + 備註 ── */}
        <div className="px-8 pt-8 pb-6 space-y-4 shrink-0">
          <DialogTitle className="text-2xl font-bold tracking-tight">
            {event ? '編輯預設事件' : '建立預設事件'}
          </DialogTitle>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            <div>
              <label className={GM_LABEL_CLASS}>
                事件名稱 <span className="text-destructive">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：第二幕開場、BOSS 登場"
                className={GM_INPUT_CLASS}
                maxLength={100}
              />
            </div>
            <div>
              <label className={GM_LABEL_CLASS}>備註說明</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="選填，GM 自用備忘"
                className={GM_INPUT_CLASS}
                maxLength={500}
              />
            </div>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex items-center gap-2 cursor-pointer h-9 px-1">
                    <Eye className={cn('h-4 w-4 transition-colors', showName ? 'text-primary' : 'text-muted-foreground/50')} />
                    <Switch checked={showName} onCheckedChange={setShowName} />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">啟用後，玩家在時效性效果及通知中會看到此事件名稱；<br />關閉時顯示為「未知來源」</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* ── Master-Detail：動作列表 + 編輯器 ── */}
        <div className="flex flex-1 min-h-0 border-t border-border/10">
          {/* Left Sidebar */}
          <aside className="w-[30%] bg-muted flex flex-col border-r border-border/30">
            <div className={cn('flex-1 overflow-y-auto p-6 pb-0 flex flex-col gap-3', GM_SCROLLBAR_CLASS)}>
              <div className={GM_LABEL_CLASS}>動作列表</div>
              {actions.map((action, index) => (
                <div
                  key={action.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedIndex(index);
                    }
                  }}
                  className={cn(
                    'w-full text-left p-4 rounded-lg transition-all flex items-center gap-3 cursor-pointer shrink-0',
                    index === selectedIndex
                      ? 'bg-card border-l-4 border-primary shadow-sm'
                      : 'hover:bg-card/50',
                  )}
                >
                  <div className="overflow-hidden flex-1 min-w-0">
                    <div className="text-sm font-bold text-foreground truncate">
                      {PRESET_ACTION_TYPE_LABELS[action.type] || action.type}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase">
                      動作 {index + 1}
                    </div>
                  </div>
                  {actions.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAction(index);
                      }}
                      className="p-1 text-muted-foreground/50 hover:text-destructive rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="p-6 pt-3 shrink-0">
              <button
                type="button"
                onClick={handleAddAction}
                className="w-full py-3 px-4 border-2 border-dashed border-border/30 rounded-lg text-muted-foreground text-sm font-bold flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                新增動作
              </button>
            </div>
          </aside>

          {/* Right Panel */}
          <section className={cn('flex-1 p-8 overflow-y-auto', GM_SCROLLBAR_CLASS)}>
            {selectedAction ? (
              <PresetEventActionEditor
                action={selectedAction}
                characters={characters}
                onChange={(updated) => handleUpdateAction(selectedIndex, updated)}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <Plus className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm font-medium">尚無動作</p>
                <p className="text-xs">點擊左側「新增動作」開始設定</p>
              </div>
            )}
          </section>
        </div>

        {/* ── Footer ── */}
        <div className={GM_DIALOG_FOOTER_CLASS}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={GM_CANCEL_BUTTON_CLASS}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className={GM_CTA_BUTTON_CLASS}
          >
            {isSubmitting ? '儲存中...' : event ? '更新事件' : '建立事件'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
