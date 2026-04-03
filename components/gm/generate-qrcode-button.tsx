'use client';

import { useState } from 'react';
import { generateQRCode, generateCharacterUrl } from '@/lib/utils/qr-code';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { QrCode, Download, Loader2 } from 'lucide-react';
import { IconActionButton } from '@/components/gm/icon-action-button';
import { cn } from '@/lib/utils';
import {
  GM_LABEL_CLASS,
  GM_DIALOG_CONTENT_CLASS,
  GM_DIALOG_HEADER_CLASS,
  GM_DIALOG_TITLE_CLASS,
  GM_DIALOG_BODY_CLASS,
  GM_DIALOG_FOOTER_CLASS,
  GM_CANCEL_BUTTON_CLASS,
  GM_CTA_BUTTON_CLASS,
} from '@/lib/styles/gm-form';

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
    <>
      <IconActionButton
        icon={<QrCode className="h-[18px] w-[18px]" />}
        label="QR Code"
        onClick={() => handleOpenChange(true)}
        size="sm"
      />
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn(GM_DIALOG_CONTENT_CLASS, 'sm:max-w-[440px] p-0 gap-0')}
          showCloseButton={false}
        >
          <div className={GM_DIALOG_HEADER_CLASS}>
            <DialogTitle className={GM_DIALOG_TITLE_CLASS}>角色 QR Code</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground/70 mt-1">
              玩家可掃描此 QR Code 查看角色卡
            </DialogDescription>
          </div>

          <div className={GM_DIALOG_BODY_CLASS}>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
                <p className="text-muted-foreground text-sm">生成中...</p>
              </div>
            ) : qrCodeDataUrl ? (
              <>
                <div className="flex justify-center p-6 bg-white rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCodeDataUrl}
                    alt="Character QR Code"
                    className="w-56 h-56"
                  />
                </div>

                <div className="space-y-2">
                  <label className={GM_LABEL_CLASS}>角色頁面連結</label>
                  <div className="p-3 rounded-xl bg-muted text-sm break-all font-mono">
                    {characterUrl}
                  </div>
                </div>
              </>
            ) : error ? (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-foreground">
                {error}
              </div>
            ) : null}
          </div>

          <div className={GM_DIALOG_FOOTER_CLASS}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={GM_CANCEL_BUTTON_CLASS}
            >
              關閉
            </button>
            {qrCodeDataUrl && (
              <button
                type="button"
                onClick={handleDownload}
                className={cn(GM_CTA_BUTTON_CLASS, 'flex items-center gap-2')}
              >
                <Download className="h-4 w-4" />
                下載 QR Code
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

