'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Zap, Package, Clock } from 'lucide-react';
import type { Skill, Item } from '@/types/character';

interface AttackerContestWaitingDialogProps {
  open: boolean;
  sourceType: 'skill' | 'item';
  source: Skill | Item | null;
  contestId: string;
}

export function AttackerContestWaitingDialog({
  open,
  sourceType,
  source,
}: AttackerContestWaitingDialogProps) {
  if (!source) return null;

  return (
    <Dialog open={open} onOpenChange={() => {
      // 攻擊方的等待 dialog 在對抗檢定期間完全無法關閉
    }}>
      <DialogContent
        className="max-w-lg"
        showCloseButton={false}
        onInteractOutside={(e) => {
          // 攻擊方的等待 dialog 在對抗檢定期間完全無法關閉
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          // 攻擊方的等待 dialog 在對抗檢定期間完全無法關閉
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {sourceType === 'skill' ? (
              <Zap className="h-5 w-5 text-yellow-500" />
            ) : (
              <Package className="h-5 w-5 text-blue-500" />
            )}
            等待對抗檢定結果
          </DialogTitle>
          <DialogDescription>
            你已使用 {source.name}，等待防守方回應對抗檢定...
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground animate-spin" />
              <span className="text-sm font-medium">對抗檢定進行中</span>
            </div>
            <p className="text-sm text-muted-foreground">
              防守方正在選擇道具或技能進行對抗，請稍候...
            </p>
          </div>

          {sourceType === 'skill' && (source as Skill).contestConfig && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>技能：</strong>{source.name}
              </p>
              <p className="text-sm mt-1">
                使用數值：<strong>{(source as Skill).contestConfig?.relatedStat}</strong>
              </p>
              {(() => {
                const maxItems = (source as Skill).contestConfig?.opponentMaxItems ?? 0;
                const maxSkills = (source as Skill).contestConfig?.opponentMaxSkills ?? 0;
                const itemsText = maxItems > 0 ? `${maxItems} 個道具` : null;
                const skillsText = maxSkills > 0 ? `${maxSkills} 個技能` : null;
                const parts = [itemsText, skillsText].filter(Boolean);
                return parts.length > 0 && (
                  <p className="text-sm mt-1">
                    對方可使用：最多 {parts.join('、')}
                  </p>
                );
              })()}
            </div>
          )}

          {sourceType === 'item' && (source as Item).contestConfig && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>道具：</strong>{source.name}
              </p>
              <p className="text-sm mt-1">
                使用數值：<strong>{(source as Item).contestConfig?.relatedStat}</strong>
              </p>
              {(() => {
                const maxItems = (source as Item).contestConfig?.opponentMaxItems ?? 0;
                const maxSkills = (source as Item).contestConfig?.opponentMaxSkills ?? 0;
                const itemsText = maxItems > 0 ? `${maxItems} 個道具` : null;
                const skillsText = maxSkills > 0 ? `${maxSkills} 個技能` : null;
                const parts = [itemsText, skillsText].filter(Boolean);
                return parts.length > 0 && (
                  <p className="text-sm mt-1">
                    對方可使用：最多 {parts.join('、')}
                  </p>
                );
              })()}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

