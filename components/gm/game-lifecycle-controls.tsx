'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startGameAction, endGameAction } from '@/app/actions/game-lifecycle';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { PlayCircle, StopCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  GM_LABEL_CLASS,
  GM_INPUT_CLASS,
  GM_DIALOG_CONTENT_CLASS,
  GM_CANCEL_BUTTON_CLASS,
} from '@/lib/styles/gm-form';

type GameLifecycleControlsProps = {
  gameId: string;
  isActive: boolean;
};

/**
 * 遊戲生命週期控制組件
 *
 * - 開始遊戲按鈕（isActive = false）：保持 shadcn 預設 Dialog 樣式
 * - 結束遊戲按鈕（isActive = true）：使用設計稿新樣式
 */
export function GameLifecycleControls({
  gameId,
  isActive,
}: GameLifecycleControlsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');

  /** 開始遊戲處理函數 */
  const handleStartGame = async () => {
    setIsLoading(true);

    try {
      const result = await startGameAction(gameId);

      if (result.success) {
        toast.success('遊戲已成功開始！');
        setShowStartDialog(false);
        router.refresh();
      } else {
        toast.error(result.message || '開始遊戲失敗');
      }
    } catch (error) {
      console.error('[GameLifecycleControls] Error starting game:', error);
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  /** 結束遊戲處理函數 */
  const handleEndGame = async () => {
    setIsLoading(true);

    try {
      const result = await endGameAction(
        gameId,
        snapshotName.trim() || undefined
      );

      if (result.success) {
        toast.success('遊戲已成功結束！快照已保存');
        setShowEndDialog(false);
        setSnapshotName('');
        router.refresh();
      } else {
        toast.error(result.message || '結束遊戲失敗');
      }
    } catch (error) {
      console.error('[GameLifecycleControls] Error ending game:', error);
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* 開始遊戲按鈕（保持原樣式） */}
      {!isActive && (
        <>
          <Button
            variant="default"
            onClick={() => setShowStartDialog(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl font-black text-sm shadow-sm gap-3"
          >
            <PlayCircle className="h-5 w-5 fill-current" />
            開始遊戲
          </Button>

          {/* 開始遊戲確認對話框 */}
          <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
            <DialogContent
              className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[400px] p-0 gap-0')}
              showCloseButton={false}
            >
              <div className="p-8 space-y-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
                    <PlayCircle className="h-8 w-8 text-success" />
                  </div>
                  <DialogTitle className="text-2xl font-bold tracking-tight">開始遊戲</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    確認要開始遊戲嗎？系統將複製當前設定作為遊戲進行中的狀態。
                  </DialogDescription>
                </div>

                <div className="bg-muted/50 border border-border/20 rounded-xl p-5 shadow-sm">
                  <p className="font-semibold text-sm mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    注意事項
                  </p>
                  <ul className="list-disc text-sm text-muted-foreground space-y-1.5 ml-4">
                    <li>遊戲開始後，玩家可以開始進行遊戲操作</li>
                    <li>對設定資料的修改不會影響進行中的遊戲</li>
                    <li>如果已有進行中的遊戲，現有進度將被覆蓋</li>
                  </ul>
                </div>
              </div>

              <div className="px-8 pb-8 pt-0 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowStartDialog(false)}
                  disabled={isLoading}
                  className={cn(GM_CANCEL_BUTTON_CLASS, 'flex-1 py-3')}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleStartGame}
                  disabled={isLoading}
                  className="flex-1 py-3 px-4 rounded-lg text-sm font-bold cursor-pointer bg-success text-success-foreground hover:bg-success/90 shadow-lg shadow-success/10 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isLoading ? '開始中...' : '確認開始'}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* 結束遊戲按鈕 */}
      {isActive && (
        <>
          <Button
            variant="destructive"
            onClick={() => setShowEndDialog(true)}
            className="px-8 py-3 rounded-xl font-black text-sm shadow-sm gap-3"
          >
            <StopCircle className="h-5 w-5 fill-current" />
            結束遊戲
          </Button>

          {/* 結束遊戲確認對話框（新設計） */}
          <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
            <DialogContent
              className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[400px] p-0 gap-0')}
              showCloseButton={false}
            >
              <div className="p-8 space-y-6">
                {/* 居中警告 */}
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-destructive/15 flex items-center justify-center">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                  </div>
                  <DialogTitle className="text-2xl font-bold tracking-tight">確定要結束遊戲？</DialogTitle>

                  {/* 警告清單卡片 */}
                  <div className="w-full bg-muted/50 border border-border/20 rounded-xl p-5 shadow-sm">
                    <ul className="list-disc text-[15px] font-semibold text-muted-foreground space-y-2 text-left inline-block">
                      <li className="ml-4">所有 Runtime 資料將被封存為快照</li>
                      <li className="ml-4">玩家將無法繼續使用道具和技能</li>
                      <li className="ml-4">系統將切回 Baseline 設定模式</li>
                    </ul>
                  </div>
                </div>

                {/* 快照名稱 */}
                <div className="space-y-2">
                  <label className={GM_LABEL_CLASS}>
                    快照名稱（選填）
                  </label>
                  <Input
                    placeholder="自動命名：遊戲結束快照"
                    value={snapshotName}
                    onChange={(e) => setSnapshotName(e.target.value)}
                    disabled={isLoading}
                    maxLength={100}
                    className={cn(GM_INPUT_CLASS, 'h-12')}
                  />
                  <p className="text-xs text-muted-foreground">
                    留空將使用時間戳作為快照名稱
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 pb-8 pt-0 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEndDialog(false);
                    setSnapshotName('');
                  }}
                  disabled={isLoading}
                  className={cn(GM_CANCEL_BUTTON_CLASS, 'flex-1 py-3')}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleEndGame}
                  disabled={isLoading}
                  className="flex-1 py-3 px-4 rounded-lg text-sm font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/10 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isLoading ? '結束中...' : '結束遊戲'}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
