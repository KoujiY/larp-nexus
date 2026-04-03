'use client';

import { useState } from 'react';
import { sendMagicLink } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Drama, Loader2, LockKeyhole, Mail } from 'lucide-react';

/** 功能標籤列表 */
const FEATURE_PILLS = ['劇本管理', '角色卡生成', 'QR Code 分享', '即時推送', 'PIN 解鎖'];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const result = await sendMagicLink(email);

      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || '登入連結已發送至您的信箱',
        });
        setEmail('');
      } else {
        setMessage({
          type: 'error',
          text: result.message || '發送失敗，請稍後再試',
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      setMessage({
        type: 'error',
        text: '發生錯誤，請稍後再試',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <main className="relative z-10 w-full max-w-md flex flex-col items-center">
        {/* Brand Identity */}
        <header className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4 ring-1 ring-primary/20">
            <Drama className="h-9 w-9 text-primary" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tighter text-foreground leading-none mb-2">
            LARP Nexus
          </h1>
          <p className="text-sm tracking-widest text-muted-foreground font-semibold uppercase">
            GM/玩家輔助系統 - GM 登入
          </p>
        </header>

        {/* Login Card — Glassmorphism */}
        <section className="w-full bg-card/40 backdrop-blur-md rounded-xl p-8 border border-border/15 shadow-xl shadow-primary/5 overflow-hidden">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-bold text-foreground tracking-tight"
              >
                Email 地址
              </label>
              <div className="relative group">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted-foreground group-focus-within:text-primary transition-colors">
                  <Mail className="h-5 w-5" />
                </span>
                <input
                  id="email"
                  type="email"
                  placeholder="yourname@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 bg-card/60 border-none focus:ring-2 focus:ring-primary rounded-lg text-foreground transition-all placeholder:text-muted-foreground/50 shadow-inner disabled:opacity-50"
                />
              </div>
            </div>

            {message && (
              <div
                className={`p-4 rounded-lg text-sm ${
                  message.type === 'success'
                    ? 'bg-success/10 text-foreground border border-success/30'
                    : 'bg-destructive/10 text-foreground border border-destructive/20'
                }`}
              >
                {message.text}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-auto py-4 px-6 bg-gradient-to-br from-primary to-primary/80 font-bold text-lg rounded-lg shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.99]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5" />
                  發送中...
                </>
              ) : (
                <>
                  <LockKeyhole className="h-5 w-5" />
                  發送登入連結
                </>
              )}
            </Button>
          </form>

          {/* Divider + Bottom hint */}
          <div className="mt-8 pt-6 border-t border-border/15 text-center">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span className="text-xs font-medium tracking-wide">
                無需密碼，使用 Email 即可登入
              </span>
            </div>
          </div>
        </section>

        {/* Feature Pills */}
        <footer className="mt-12 w-full">
          <div className="flex flex-wrap justify-center gap-2">
            {FEATURE_PILLS.map((label) => (
              <span
                key={label}
                className="px-3 py-1 rounded-full bg-card/30 border border-border/15 text-[10px] font-bold text-muted-foreground tracking-wider uppercase backdrop-blur-sm"
              >
                {label}
              </span>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}
