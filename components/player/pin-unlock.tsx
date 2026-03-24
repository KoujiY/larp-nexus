'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LockKeyhole, LockKeyholeOpen, Eye } from 'lucide-react';

interface PinUnlockProps {
  characterId: string;
  characterName: string;
  /** 解鎖回調：readOnly 表示是否為唯讀預覽模式 */
  onUnlocked: (readOnly: boolean) => void;
}

/**
 * Phase 10: 角色卡解鎖組件
 *
 * 支援兩種解鎖方式：
 * 1. Game Code + PIN → 完整互動模式
 * 2. 僅 PIN → 唯讀預覽模式
 */
export function PinUnlock({ characterId, characterName, onUnlocked }: PinUnlockProps) {
  const [gameCode, setGameCode] = useState('');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 驗證 PIN（呼叫既有 unlock API）
   */
  const verifyPin = async (): Promise<boolean> => {
    const response = await fetch(`/api/characters/${characterId}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await response.json();
    return data.success;
  };

  /**
   * 驗證 Game Code 是否屬於此角色的遊戲
   * @returns { success: boolean; gameNotStarted?: boolean; message?: string }
   */
  const verifyGameCode = async (): Promise<{ success: boolean; gameNotStarted?: boolean; message?: string }> => {
    const response = await fetch(`/api/characters/${characterId}/verify-game-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode: gameCode.trim().toUpperCase() }),
    });
    const data = await response.json();
    return data;
  };

  /**
   * 完整解鎖（Game Code + PIN）
   */
  const handleFullUnlock = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!gameCode || !pin) {
      setError('請輸入遊戲代碼和 PIN');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 先驗證 PIN
      const pinOk = await verifyPin();
      if (!pinOk) {
        setError('PIN 碼錯誤');
        setPin('');
        return;
      }

      // 再驗證 Game Code
      const gameCodeResult = await verifyGameCode();
      if (!gameCodeResult.success) {
        // Phase 10: 區分「遊戲代碼不正確」和「遊戲尚未開始」
        setError(gameCodeResult.message || '遊戲代碼不正確');
        return;
      }

      // 兩者皆通過 → 完整互動
      onUnlocked(false);
    } catch (err) {
      console.error('Full unlock error:', err);
      setError('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 僅 PIN 預覽
   */
  const handlePreviewUnlock = async () => {
    if (!pin) {
      setError('請輸入 PIN');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const pinOk = await verifyPin();
      if (!pinOk) {
        setError('PIN 碼錯誤');
        setPin('');
        return;
      }

      // PIN 正確 → 唯讀預覽
      onUnlocked(true);
    } catch (err) {
      console.error('Preview unlock error:', err);
      setError('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto mb-4">
            <LockKeyhole className="h-16 w-16 text-primary mx-auto" />
          </div>
          <CardTitle className="text-2xl">角色卡已鎖定</CardTitle>
          <CardDescription className="text-base">
            請輸入遊戲代碼和 PIN 碼查看 <strong>{characterName}</strong> 的角色卡
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFullUnlock} className="space-y-4">
            {/* Game Code 輸入 */}
            <div className="space-y-2">
              <Label htmlFor="gameCode">遊戲代碼</Label>
              <Input
                id="gameCode"
                type="text"
                placeholder="例如：ABC123"
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value.toUpperCase())}
                maxLength={6}
                disabled={isLoading}
                autoFocus
                className="text-center text-2xl tracking-widest uppercase font-mono"
              />
            </div>

            {/* PIN 輸入 */}
            <div className="space-y-2">
              <Label htmlFor="pin">PIN 碼（4-6 位數字）</Label>
              <Input
                id="pin"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="請輸入 PIN 碼"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                maxLength={6}
                disabled={isLoading}
                required
                className="text-center text-2xl tracking-widest"
              />
            </div>

            {/* 錯誤提示 */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20 text-center">
                {error}
              </div>
            )}

            {/* 完整解鎖按鈕 */}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || pin.length < 4 || !gameCode}
              size="lg"
            >
              <LockKeyholeOpen className="h-4 w-4 mr-2" />
              {isLoading ? '驗證中...' : '解鎖角色卡'}
            </Button>

            {/* 分隔線 */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">或</span>
              </div>
            </div>

            {/* 僅 PIN 預覽按鈕（輸入 Game Code 時禁用，表示應使用完整解鎖） */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isLoading || pin.length < 4 || gameCode.trim().length > 0}
              onClick={handlePreviewUnlock}
            >
              <Eye className="h-4 w-4 mr-2" />
              僅使用 PIN 預覽（唯讀）
            </Button>

            <div className="text-xs text-muted-foreground text-center space-y-1 pt-2">
              <p>提示：遊戲代碼和 PIN 碼由 GM 提供</p>
              <p>沒有遊戲代碼？僅輸入 PIN 可以預覽角色，但無法使用互動功能</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
