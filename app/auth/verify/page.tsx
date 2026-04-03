'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyMagicLink } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>(
    'verifying'
  );
  const [message, setMessage] = useState('驗證中，請稍候...');

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setStatus('error');
        setMessage('無效的登入連結');
        return;
      }

      try {
        const result = await verifyMagicLink(token);

        if (result.success) {
          setStatus('success');
          setMessage('登入成功！正在跳轉...');
          setTimeout(() => {
            router.push('/games');
          }, 1500);
        } else {
          setStatus('error');
          setMessage(result.message || '驗證失敗');
        }
      } catch (error) {
        console.error('Verify error:', error);
        setStatus('error');
        setMessage('發生錯誤，請稍後再試');
      }
    };

    verify();
  }, [token, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <main className="w-full max-w-md flex flex-col items-center">
        {/* Glassmorphism Card */}
        <section className="w-full bg-card/40 backdrop-blur-md rounded-xl p-10 border border-border/15 shadow-xl shadow-primary/5 flex flex-col items-center text-center">
          {/* Status Icon */}
          <div className="mb-8">
            {status === 'verifying' && (
              <div className="w-24 h-24 rounded-full border-4 border-primary/20 border-t-primary animate-[spin_3s_linear_infinite] flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-primary/40 animate-pulse" />
              </div>
            )}
            {status === 'success' && (
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="h-14 w-14 text-primary" />
              </div>
            )}
            {status === 'error' && (
              <div className="w-24 h-24 rounded-full bg-destructive/20 flex items-center justify-center">
                <XCircle className="h-14 w-14 text-destructive" />
              </div>
            )}
          </div>

          {/* Title */}
          <h2
            className={`text-2xl font-bold tracking-tight mb-3 ${
              status === 'success' ? 'text-primary' : 'text-foreground'
            }`}
          >
            {status === 'verifying' && '驗證中'}
            {status === 'success' && '登入成功'}
            {status === 'error' && '驗證失敗'}
          </h2>

          {/* Message */}
          <p
            className={`text-sm mb-8 leading-relaxed ${
              status === 'error'
                ? 'text-destructive/80'
                : 'text-muted-foreground'
            }`}
          >
            {message}
          </p>

          {/* Status-specific bottom element */}
          {status === 'verifying' && (
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary w-2/3 animate-pulse" />
            </div>
          )}

          {status === 'success' && (
            <div className="flex justify-center gap-1">
              <div
                className="w-2 h-2 rounded-full bg-primary animate-bounce"
                style={{ animationDelay: '0.1s' }}
              />
              <div
                className="w-2 h-2 rounded-full bg-primary animate-bounce"
                style={{ animationDelay: '0.2s' }}
              />
              <div
                className="w-2 h-2 rounded-full bg-primary animate-bounce"
                style={{ animationDelay: '0.3s' }}
              />
            </div>
          )}

          {status === 'error' && (
            <Button
              variant="secondary"
              onClick={() => router.push('/auth/login')}
              className="w-full h-auto mt-2 py-4 px-6 rounded-lg bg-popover text-foreground hover:bg-surface-raised font-semibold text-sm tracking-wide transition-all duration-300 group"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              返回登入頁面
            </Button>
          )}
        </section>
      </main>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
          <div className="w-full max-w-md flex flex-col items-center">
            <section className="w-full bg-card/40 backdrop-blur-md rounded-xl p-10 border border-border/15 shadow-xl shadow-primary/5 flex flex-col items-center text-center">
              <div className="mb-8">
                <div className="w-24 h-24 rounded-full border-4 border-primary/20 border-t-primary animate-[spin_3s_linear_infinite] flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-primary/40 animate-pulse" />
                </div>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground mb-3">
                載入中...
              </h2>
            </section>
          </div>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
