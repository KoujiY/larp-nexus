'use client';

import { useRef, useState } from 'react';
import { Info, Loader2, Zap, ChevronRight } from 'lucide-react';

interface PinUnlockProps {
  characterId: string;
  characterName: string;
  /** 解鎖回調：readOnly 表示是否為唯讀預覽模式 */
  onUnlocked: (readOnly: boolean) => void;
}

/**
 * 角色卡解鎖元件
 *
 * 支援兩種解鎖模式：
 * 1. PIN + 遊戲代碼 → 完整互動模式（onUnlocked(false)）
 * 2. 僅 PIN → 唯讀預覽模式（onUnlocked(true)）
 *
 * PIN 與遊戲代碼均使用方格視覺 + 隱藏 input overlay 設計：
 * - 方格為純視覺層（pointer-events-none）
 * - 透明 input 覆蓋在上層（z-10）捕捉所有輸入
 * - 容器 onClick → ref.focus() 確保任何點擊均能喚起鍵盤
 */
export function PinUnlock({ characterId, characterName, onUnlocked }: PinUnlockProps) {
  const [gameCode, setGameCode] = useState('');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pinInputRef = useRef<HTMLInputElement>(null);
  const gameCodeInputRef = useRef<HTMLInputElement>(null);
  const [isPinFocused, setIsPinFocused] = useState(false);
  const [isGameCodeFocused, setIsGameCodeFocused] = useState(false);

  const hasGameCode = gameCode.trim().length > 0;
  const initial = characterName.charAt(0);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pin) {
      setError('請輸入 PIN');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const pinOk = await verifyPin();
      if (!pinOk) {
        setError('PIN 或遊戲代碼錯誤');
        return;
      }

      if (hasGameCode) {
        const gameCodeResult = await verifyGameCode();
        if (!gameCodeResult.success) {
          // 保留 server 回傳的特定訊息（如「遊戲尚未開始」），無則顯示通用錯誤
          setError(gameCodeResult.message || 'PIN 或遊戲代碼錯誤');
          return;
        }
        onUnlocked(false);
      } else {
        onUnlocked(true);
      }
    } catch {
      setError('PIN 或遊戲代碼錯誤');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 overflow-hidden relative">
      {/* 裝飾性背景光暈 */}
      <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-primary/10 blur-[80px] pointer-events-none" />
      <div className="absolute top-1/2 -right-32 w-80 h-80 rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

      <main className="w-full max-w-[375px] flex flex-col items-center gap-8 z-10 pt-10 pb-12">
        {/* 頂部：角色識別錨點 */}
        <section className="flex flex-col items-center">
          <div className="relative flex items-center justify-center mb-4">
            <span
              className="text-[120px] font-bold text-primary/20 leading-none select-none"
              style={{ textShadow: '0 0 20px rgba(254, 197, 106, 0.15)' }}
            >
              {initial}
            </span>
            <div
              className="absolute w-32 h-32 border border-primary/10 rounded-full"
              style={{ animation: 'pulse 6s ease-in-out infinite' }}
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{characterName}</h1>
          <div className="h-px w-10 bg-primary/40 mt-2" />
        </section>

        {/* 表單區 */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-6 px-1">
          {/* PIN 輸入（4 位數字） */}
          <div>
            <p className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-3 text-center">
              輸入角色 PIN
            </p>

            {/* 方格視覺 + 透明 input overlay */}
            <div
              className="flex justify-center cursor-text"
              onClick={() => pinInputRef.current?.focus()}
            >
              <div className="relative inline-flex gap-3">
                {/* 純視覺方格（pointer-events-none，由上層 input 接收事件） */}
                {[0, 1, 2, 3].map((i) => {
                  const filled = i < pin.length;
                  // 下一個待輸入的格子（全填滿時維持最後一格 active，讓使用者知道可刪除）
                  // 唯讀模式（無遊戲代碼）錯誤時 PIN 變紅；完整模式錯誤時 PIN 也變紅
                  const pinError = !!error;
                  const isActive = isPinFocused && !error && (
                    i === Math.min(pin.length, 3)
                  );
                  return (
                    <div
                      key={i}
                      className={[
                        'w-[50px] h-[50px] rounded-xl flex items-center justify-center transition-all duration-150 pointer-events-none',
                        pinError
                          ? 'bg-destructive/10 border border-destructive/60'
                          : isActive
                          ? 'bg-card border border-primary ring-2 ring-primary/20'
                          : filled
                          ? 'bg-card border border-primary/60'
                          : 'bg-card border border-primary/20',
                      ].join(' ')}
                    >
                      {filled ? (
                        <div className={`w-2.5 h-2.5 rounded-full ${pinError ? 'bg-destructive' : 'bg-primary'}`} />
                      ) : isActive ? (
                        <div className="w-px h-5 bg-primary animate-pulse" />
                      ) : null}
                    </div>
                  );
                })}
                {/* 透明 input 覆蓋整個方格區域，z-10 確保在方格之上 */}
                <input
                  ref={pinInputRef}
                  type="text"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                    setError(null);
                  }}
                  className="absolute inset-0 opacity-0 cursor-text z-10"
                  aria-label="PIN 輸入"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  disabled={isLoading}
                  autoFocus
                  onFocus={() => setIsPinFocused(true)}
                  onBlur={() => setIsPinFocused(false)}
                />
              </div>
            </div>

          </div>

          {/* 遊戲代碼（選填，6 碼英數） */}
          <div>
            <p
              className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-3 text-center cursor-text"
              onClick={() => gameCodeInputRef.current?.focus()}
            >
              遊戲代碼{' '}
              <span className="text-muted-foreground font-normal normal-case tracking-normal">（選填）</span>
            </p>

            {/* 6 碼方格，與 PIN 相同設計語言，但顯示字元而非圓點 */}
            <div
              className="flex justify-center cursor-text"
              onClick={() => gameCodeInputRef.current?.focus()}
            >
              <div className="relative inline-flex gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => {
                  const char = gameCode[i];
                  // 完整模式（有遊戲代碼）發生錯誤時，遊戲代碼方格也變紅
                  const gameCodeError = !!error && hasGameCode;
                  const isActive = isGameCodeFocused && !error && i === Math.min(gameCode.length, 5);
                  return (
                    <div
                      key={i}
                      className={[
                        'w-[46px] h-[50px] rounded-xl flex items-center justify-center transition-all duration-150 font-mono text-sm font-bold pointer-events-none',
                        gameCodeError
                          ? 'bg-destructive/10 border border-destructive/60 text-destructive'
                          : isActive
                          ? 'bg-card border border-primary ring-2 ring-primary/20 text-foreground'
                          : char
                          ? 'bg-card border border-primary/60 text-foreground'
                          : 'bg-card border border-primary/20 text-transparent',
                      ].join(' ')}
                    >
                      {char ?? (isActive ? (
                        <div className="w-px h-5 bg-primary animate-pulse" />
                      ) : null)}
                    </div>
                  );
                })}
                <input
                  ref={gameCodeInputRef}
                  type="text"
                  value={gameCode}
                  onChange={(e) => {
                    setGameCode(e.target.value.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6));
                    setError(null);
                  }}
                  className="absolute inset-0 opacity-0 cursor-text z-10"
                  aria-label="遊戲代碼輸入"
                  autoComplete="off"
                  maxLength={6}
                  disabled={isLoading}
                  onFocus={() => setIsGameCodeFocused(true)}
                  onBlur={() => setIsGameCodeFocused(false)}
                />
              </div>
            </div>
          </div>

          {/* 說明文字 */}
          <div className="flex items-start gap-2 justify-center">
            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[11px] leading-relaxed text-muted-foreground text-center">
              PIN 由 GM 提供，如不清楚請詢問主持人
            </p>
          </div>

          {/* 主要 CTA 按鈕 */}
          <button
            type="submit"
            disabled={isLoading || !pin}
            className="w-full h-14 rounded-xl font-bold text-base tracking-wide bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:from-primary/90 hover:to-primary/70"
            style={{ boxShadow: pin && !isLoading ? '0 4px 24px rgba(254, 197, 106, 0.2)' : 'none' }}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                驗證中...
              </>
            ) : hasGameCode ? (
              <>
                進入完整互動模式
                <Zap className="h-5 w-5" />
              </>
            ) : (
              <>
                以 PIN 預覽角色
                <ChevronRight className="h-5 w-5" />
              </>
            )}
          </button>

          {/* 錯誤訊息固定區域：始終佔位，避免版面晃動 */}
          <p className={`text-destructive text-xs text-center -mt-2 min-h-4 transition-opacity duration-200 ${error ? 'opacity-100' : 'opacity-0'}`}>
            {error}
          </p>
        </form>
      </main>

      {/* 底部裝飾線 */}
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
    </div>
  );
}
