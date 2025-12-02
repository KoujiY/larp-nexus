'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PinUnlockProps {
  characterId: string;
  characterName: string;
  onUnlocked: () => void;
}

export function PinUnlock({ characterId, characterName, onUnlocked }: PinUnlockProps) {
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/characters/${characterId}/unlock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin }),
      });

      const data = await response.json();

      if (data.success) {
        // 解鎖成功
        onUnlocked();
      } else {
        // 解鎖失敗
        setError(data.message || 'PIN 碼錯誤');
        setPin('');
      }
    } catch (err) {
      console.error('Unlock error:', err);
      setError('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto mb-4 text-6xl">🔒</div>
          <CardTitle className="text-2xl">角色卡已鎖定</CardTitle>
          <CardDescription className="text-base">
            請輸入 PIN 碼查看 <strong>{characterName}</strong> 的角色卡
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                autoFocus
                className="text-center text-2xl tracking-widest"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200 text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || pin.length < 4}
              size="lg"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  驗證中...
                </>
              ) : (
                <>🔓 解鎖角色卡</>
              )}
            </Button>

            <div className="text-xs text-muted-foreground text-center space-y-1 pt-2">
              <p>💡 提示：PIN 碼由 GM 設定</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

