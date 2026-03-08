'use client';

import { useState } from 'react';
import { generateQRCode, generateCharacterUrl } from '@/lib/utils/qr-code';
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

interface GenerateQRCodeButtonProps {
  characterId: string;
}

export function GenerateQRCodeButton({ characterId }: GenerateQRCodeButtonProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const characterUrl = generateCharacterUrl(characterId);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const dataUrl = await generateQRCode(characterUrl);
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
    link.download = `character-${characterId}-qrcode.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setQrCodeDataUrl(null);
      setError(null);
    } else {
      // 開啟時自動生成
      handleGenerate();
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1">
          📱 QR Code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>角色 QR Code</DialogTitle>
          <DialogDescription>
            玩家可掃描此 QR Code 查看角色卡
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
                    alt="Character QR Code"
                    className="w-64 h-64"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>角色頁面連結</Label>
                <div className="p-3 rounded-lg bg-muted text-sm break-all">
                  {characterUrl}
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

