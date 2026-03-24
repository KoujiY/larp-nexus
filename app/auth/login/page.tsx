'use client';

import { useState } from 'react';
import { sendMagicLink } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Drama, Loader2, LockKeyhole, Mail } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto mb-4">
            <Drama className="h-16 w-16 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold">LARP Nexus</CardTitle>
          <CardDescription className="text-base">
            GM/玩家輔助系統 - GM 登入
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email 地址</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
                autoFocus
              />
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

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  發送中...
                </>
              ) : (
                <>
                  <LockKeyhole className="mr-2 h-4 w-4" />
                  發送登入連結
                </>
              )}
            </Button>

            <div className="text-xs text-muted-foreground text-center space-y-1 pt-2">
              <p className="flex items-center justify-center gap-1.5">
                <Mail className="h-3 w-3" />
                無需密碼，使用 Email 即可登入
              </p>
              <p>登入連結將發送至您的信箱，有效期限 15 分鐘</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
