'use client';

import { useState } from 'react';
import { generateQRCode, generateGamePublicUrl } from '@/lib/utils/qr-code';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Copy, Check } from 'lucide-react';

interface GenerateGamePublicQRCodeButtonProps {
  gameId: string;
}

export function GenerateGamePublicQRCodeButton({ gameId }: GenerateGamePublicQRCodeButtonProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  const gamePublicUrl = generateGamePublicUrl(gameId);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const dataUrl = await generateQRCode(gamePublicUrl);
      setQrCodeDataUrl(dataUrl);
    } catch (err) {
      console.error('Error generating QR code:', err);
      setError('無法生成 QR Code，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!qrCodeDataUrl) return;

    const link = document.createElement('a');
    link.href = qrCodeDataUrl;
    link.download = `game-${gameId}-public-qrcode.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(gamePublicUrl);
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setQrCodeDataUrl(null);
      setError(null);
      setIsLinkCopied(false);
    } else {
      // 開啟時自動生成
      handleGenerate();
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          📱 QR Code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>公開資訊頁面 QR Code</DialogTitle>
          <DialogDescription>
            玩家可掃描此 QR Code 查看劇本的世界觀、前導故事與章節資訊
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="text-4xl animate-spin">⏳</div>
              <p className="text-muted-foreground">生成中...</p>
            </div>
          ) : qrCodeDataUrl ? (
            <>
              <div className="space-y-2">
                <Label>QR Code</Label>
                <div className="flex justify-center p-6 bg-white rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCodeDataUrl}
                    alt="Game Public Info QR Code"
                    className="w-64 h-64"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>公開資訊頁面連結</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 rounded-lg bg-muted text-sm break-all">
                    {gamePublicUrl}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyLink}
                    title="複製連結"
                  >
                    {isLinkCopied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            關閉
          </Button>
          {qrCodeDataUrl && (
            <Button type="button" onClick={handleDownload}>
              💾 下載 QR Code
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

