'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyMagicLink } from '@/app/actions/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

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
          // 延遲跳轉讓使用者看到成功訊息
          setTimeout(() => {
            router.push('/dashboard');
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto mb-4">
            {status === 'verifying' && <Loader2 className="h-16 w-16 text-primary animate-spin" />}
            {status === 'success' && <CheckCircle2 className="h-16 w-16 text-success" />}
            {status === 'error' && <XCircle className="h-16 w-16 text-destructive" />}
          </div>
          <CardTitle className="text-2xl font-bold">
            {status === 'verifying' && '驗證中'}
            {status === 'success' && '登入成功'}
            {status === 'error' && '驗證失敗'}
          </CardTitle>
          <CardDescription className="text-base">{message}</CardDescription>
        </CardHeader>

        {status === 'error' && (
          <CardContent>
            <Button
              onClick={() => router.push('/auth/login')}
              className="w-full"
            >
              返回登入頁面
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Card className="w-full max-w-md">
            <CardHeader className="space-y-2 text-center">
              <div className="mx-auto mb-4">
                <Loader2 className="h-16 w-16 text-primary animate-spin" />
              </div>
              <CardTitle className="text-2xl font-bold">載入中...</CardTitle>
            </CardHeader>
          </Card>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
