'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { unlockByGameCodeAndPin, unlockByPinOnly } from '@/app/actions/unlock';
import { Lock, Unlock, AlertCircle } from 'lucide-react';

/**
 * Phase 10.5.2: 玩家端解鎖頁面
 *
 * 支援兩種解鎖方式：
 * 1. Game Code + PIN：完整解鎖，導航到角色頁面
 * 2. 僅 PIN：預覽模式，顯示所有使用該 PIN 的角色列表
 */
export default function UnlockPage() {
  const router = useRouter();

  // 表單狀態
  const [gameCode, setGameCode] = useState('');
  const [pin, setPin] = useState('');

  // UI 狀態
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 僅 PIN 模式下的角色列表
  const [characterList, setCharacterList] = useState<Array<{
    characterId: string;
    characterName: string;
    gameId: string;
    gameName: string;
  }> | null>(null);

  /**
   * 處理完整解鎖（Game Code + PIN）
   */
  const handleFullUnlock = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!gameCode || !pin) {
      setError('請輸入遊戲代碼和 PIN');
      return;
    }

    setLoading(true);
    setError('');
    setCharacterList(null);

    try {
      const result = await unlockByGameCodeAndPin(gameCode.trim(), pin.trim());

      if (result.success && result.data) {
        // 成功：導航到角色頁面
        router.push(`/c/${result.data.characterId}`);
      } else {
        setError(result.message || '解鎖失敗');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 處理僅 PIN 預覽
   */
  const handlePinOnlyUnlock = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pin) {
      setError('請輸入 PIN');
      return;
    }

    setLoading(true);
    setError('');
    setCharacterList(null);

    try {
      const result = await unlockByPinOnly(pin.trim());

      if (result.success && result.data) {
        const characters = result.data;

        if (characters.length === 0) {
          setError('PIN 不存在');
        } else if (characters.length === 1) {
          // 只有一個角色：導航到預覽模式
          router.push(`/c/${characters[0].characterId}?readonly=true`);
        } else {
          // 多個角色：顯示選擇列表
          setCharacterList(characters);
        }
      } else {
        setError(result.message || '查詢失敗');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知錯誤');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 選擇角色（從列表中）
   */
  const handleSelectCharacter = (characterId: string) => {
    router.push(`/c/${characterId}?readonly=true`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 主卡片 */}
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <Lock className="w-6 h-6 text-purple-600" />
            </div>
            <CardTitle className="text-2xl">角色解鎖</CardTitle>
            <CardDescription>
              輸入遊戲代碼和 PIN 以進入遊戲
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* 完整解鎖表單 */}
            <form onSubmit={handleFullUnlock} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gameCode">遊戲代碼</Label>
                <Input
                  id="gameCode"
                  type="text"
                  placeholder="例如：ABC123"
                  value={gameCode}
                  onChange={(e) => setGameCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  disabled={loading}
                  className="uppercase"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pin">PIN 碼</Label>
                <Input
                  id="pin"
                  type="text"
                  placeholder="輸入您的 PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !gameCode || !pin}
              >
                {loading ? (
                  '解鎖中...'
                ) : (
                  <>
                    <Unlock className="mr-2 h-4 w-4" />
                    解鎖角色
                  </>
                )}
              </Button>
            </form>

            {/* 分隔線 */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-muted-foreground">或</span>
              </div>
            </div>

            {/* 僅 PIN 預覽 */}
            <form onSubmit={handlePinOnlyUnlock} className="space-y-4">
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={loading || !pin}
              >
                僅使用 PIN 預覽角色
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                僅輸入 PIN 可預覽角色資訊，但無法進行互動
              </p>
            </form>

            {/* 錯誤訊息 */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* 角色列表（多個結果時） */}
            {characterList && characterList.length > 1 && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm">找到 {characterList.length} 個角色，請選擇：</h3>
                <div className="space-y-2">
                  {characterList.map((character) => (
                    <Button
                      key={character.characterId}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => handleSelectCharacter(character.characterId)}
                    >
                      <div className="text-left">
                        <div className="font-medium">{character.characterName}</div>
                        <div className="text-xs text-muted-foreground">
                          {character.gameName || '未知遊戲'}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
