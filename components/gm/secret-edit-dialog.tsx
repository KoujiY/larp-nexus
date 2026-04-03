'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { AutoRevealConditionEditor } from '@/components/gm/auto-reveal-condition-editor';
import { Plus, Trash2 } from 'lucide-react';
import type { Secret, AutoRevealCondition } from '@/types/character';
import { normalizeSecretContent } from '@/types/character';
import type { GameItemInfo } from '@/app/actions/games';

interface SecretEditDialogProps {
  /** 是否開啟 Dialog */
  open: boolean;
  /** 開關 Dialog 的回呼 */
  onOpenChange: (open: boolean) => void;
  /** 要編輯的隱藏資訊（null 表示新增模式） */
  secret: Secret | null;
  /** 儲存回呼：回傳編輯後的隱藏資訊 */
  onSave: (secret: Secret) => void;
  /** 劇本中所有角色的道具列表（用於自動揭露條件） */
  availableItems: GameItemInfo[];
  /** 是否停用（儲存中） */
  disabled?: boolean;
}

/**
 * 隱藏資訊編輯 Dialog
 *
 * 提供隱藏資訊的完整編輯表單，包含：
 * - 標題、多段落內容
 * - 揭露條件（文字描述）
 * - 自動揭露條件（結構化設定）
 * - 揭露狀態切換
 */
export function SecretEditDialog({
  open,
  onOpenChange,
  secret,
  onSave,
  availableItems,
  disabled = false,
}: SecretEditDialogProps) {
  const [editingSecret, setEditingSecret] = useState<Secret | null>(null);
  const [prevSecret, setPrevSecret] = useState<Secret | null>(null);

  // Render-time sync：當外部 secret prop 變化時，同步到本地編輯狀態
  if (secret !== prevSecret) {
    setPrevSecret(secret);
    setEditingSecret(secret ? { ...secret } : null);
  }

  /** 處理儲存 */
  const handleSave = () => {
    if (!editingSecret) return;
    onSave(editingSecret);
    onOpenChange(false);
  };

  if (!editingSecret) return null;

  /** 正規化內容為段落陣列 */
  const paragraphs = normalizeSecretContent(editingSecret.content);

  /** 更新單一段落 */
  const updateParagraph = (index: number, value: string) => {
    const updated = [...paragraphs];
    updated[index] = value;
    setEditingSecret({ ...editingSecret, content: updated });
  };

  /** 新增段落 */
  const addParagraph = () => {
    setEditingSecret({ ...editingSecret, content: [...paragraphs, ''] });
  };

  /** 刪除段落 */
  const removeParagraph = (index: number) => {
    const updated = paragraphs.filter((_, i) => i !== index);
    setEditingSecret({ ...editingSecret, content: updated.length > 0 ? updated : [''] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {secret?.title ? `編輯隱藏資訊：${secret.title}` : '編輯隱藏資訊'}
          </DialogTitle>
          <DialogDescription>
            設定隱藏資訊的內容、揭露條件與揭露狀態
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 標題 */}
          <div className="space-y-2">
            <Label htmlFor="secret-title">標題</Label>
            <Input
              id="secret-title"
              placeholder="隱藏資訊標題"
              value={editingSecret.title}
              onChange={(e) =>
                setEditingSecret({ ...editingSecret, title: e.target.value })
              }
              disabled={disabled}
            />
          </div>

          {/* 多段落內容 */}
          <div className="space-y-2">
            <Label>內容</Label>
            <div className="space-y-2">
              {paragraphs.map((paragraph, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Textarea
                    placeholder={`段落 ${index + 1}...`}
                    value={paragraph}
                    onChange={(e) => updateParagraph(index, e.target.value)}
                    disabled={disabled}
                    rows={4}
                    className="resize-none flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 mt-1 text-muted-foreground/40 hover:text-destructive transition-colors"
                    onClick={() => removeParagraph(index)}
                    disabled={disabled || paragraphs.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addParagraph}
              disabled={disabled}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              新增段落
            </Button>
            <p className="text-xs text-muted-foreground">
              可新增多個段落，玩家端會依序顯示，僅第一段的首字會放大強調
            </p>
          </div>

          {/* 揭露條件（文字） */}
          <div className="space-y-2">
            <Label htmlFor="secret-reveal-condition">揭露條件</Label>
            <Input
              id="secret-reveal-condition"
              placeholder="例：完成任務 A 後揭露"
              value={editingSecret.revealCondition || ''}
              onChange={(e) =>
                setEditingSecret({
                  ...editingSecret,
                  revealCondition: e.target.value,
                })
              }
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              描述此隱藏資訊的揭露條件（僅供 GM 參考，玩家可見）
            </p>
          </div>

          {/* 自動揭露條件 */}
          <AutoRevealConditionEditor
            condition={editingSecret.autoRevealCondition}
            onChange={(newCondition: AutoRevealCondition | undefined) =>
              setEditingSecret({
                ...editingSecret,
                autoRevealCondition: newCondition,
              })
            }
            availableItems={availableItems}
            allowSecretsCondition={false}
            disabled={disabled}
          />

          {/* 揭露狀態 */}
          <div className="flex items-center justify-between py-3 px-4 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">
                {editingSecret.isRevealed ? '已揭露' : '未揭露'}
              </Label>
              <p className="text-sm text-muted-foreground">
                {editingSecret.isRevealed
                  ? '玩家目前可以查看此隱藏資訊'
                  : '玩家目前無法查看此隱藏資訊'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`text-sm font-medium ${
                  editingSecret.isRevealed ? 'text-success' : 'text-muted-foreground'
                }`}
              >
                {editingSecret.isRevealed ? '✓ 已揭露' : '✗ 未揭露'}
              </span>
              <Switch
                checked={editingSecret.isRevealed}
                onCheckedChange={(checked) =>
                  setEditingSecret({
                    ...editingSecret,
                    isRevealed: checked as boolean,
                  })
                }
                disabled={disabled}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={disabled}
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={disabled}>
            確認
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
