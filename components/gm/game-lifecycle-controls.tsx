'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startGameAction, endGameAction } from '@/app/actions/game-lifecycle';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PlayCircle, StopCircle } from 'lucide-react';

interface GameLifecycleControlsProps {
  gameId: string;
  isActive: boolean;
}

/**
 * Phase 10.3.4: 遊戲生命週期控制組件
 *
 * 功能：
 * - 顯示開始遊戲按鈕（當 isActive = false）
 * - 顯示結束遊戲按鈕（當 isActive = true）
 * - 確認對話框（含快照名稱輸入）
 * - Loading 狀態管理
 * - Toast 提示
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

  /**
   * 開始遊戲處理函數
   */
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

  /**
   * 結束遊戲處理函數
   */
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
      {/* 開始遊戲按鈕 */}
      {!isActive && (
        <>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowStartDialog(true)}
            className="bg-green-600 hover:bg-green-700"
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            開始遊戲
          </Button>

          {/* 開始遊戲確認對話框 */}
          <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>開始遊戲</DialogTitle>
                <DialogDescription>
                  確認要開始遊戲嗎？系統將複製當前設定作為遊戲進行中的狀態。
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-4">
                <div className="p-4 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">
                  <p className="font-semibold mb-2">⚠️ 注意事項</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>遊戲開始後，玩家可以開始進行遊戲操作</li>
                    <li>對設定資料的修改不會影響進行中的遊戲</li>
                    <li>如果已有進行中的遊戲，現有進度將被覆蓋</li>
                  </ul>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowStartDialog(false)}
                  disabled={isLoading}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={handleStartGame}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? '開始中...' : '確認開始'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* 結束遊戲按鈕 */}
      {isActive && (
        <>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowEndDialog(true)}
          >
            <StopCircle className="h-4 w-4 mr-2" />
            結束遊戲
          </Button>

          {/* 結束遊戲確認對話框 */}
          <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>結束遊戲</DialogTitle>
                <DialogDescription>
                  確認要結束遊戲嗎？系統將保存當前遊戲狀態為快照。
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* 快照名稱輸入 */}
                <div className="space-y-2">
                  <Label htmlFor="snapshotName">快照名稱（可選）</Label>
                  <Input
                    id="snapshotName"
                    placeholder="例：第一章結束"
                    value={snapshotName}
                    onChange={(e) => setSnapshotName(e.target.value)}
                    disabled={isLoading}
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground">
                    留空將使用時間戳作為快照名稱
                  </p>
                </div>

                {/* 警告訊息 */}
                <div className="p-4 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">
                  <p className="font-semibold mb-2">⚠️ 注意事項</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>遊戲結束後，玩家將無法繼續遊戲操作</li>
                    <li>當前遊戲狀態將被保存為快照</li>
                    <li>可以重新開始遊戲，但會從設定資料重新開始</li>
                  </ul>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowEndDialog(false);
                    setSnapshotName('');
                  }}
                  disabled={isLoading}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleEndGame}
                  disabled={isLoading}
                >
                  {isLoading ? '結束中...' : '確認結束'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
