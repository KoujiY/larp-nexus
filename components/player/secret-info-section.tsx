'use client';

import { useState, useMemo, useSyncExternalStore, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Lock, Eye } from 'lucide-react';
import type { SecretInfo } from '@/types/character';
import { formatDate } from '@/lib/utils/date';

interface SecretInfoSectionProps {
  secretInfo?: SecretInfo;
  characterId: string;
}

// Hook 用於安全地讀取 localStorage（避免 SSR/CSR hydration 問題）
function useReadSecrets(characterId: string) {
  const storageKey = `character-${characterId}-read-secrets`;

  const subscribe = useCallback(
    (callback: () => void) => {
      window.addEventListener('storage', callback);
      return () => window.removeEventListener('storage', callback);
    },
    []
  );

  const getSnapshot = useCallback(() => {
    const stored = localStorage.getItem(storageKey);
    return stored || '[]';
  }, [storageKey]);

  const getServerSnapshot = useCallback(() => '[]', []);

  const storedValue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    try {
      const readIds = JSON.parse(storedValue) as string[];
      return new Set(readIds);
    } catch {
      return new Set<string>();
    }
  }, [storedValue]);
}

export function SecretInfoSection({
  secretInfo,
  characterId,
}: SecretInfoSectionProps) {
  const readSecretsFromStorage = useReadSecrets(characterId);
  const [localReadSecrets, setLocalReadSecrets] = useState<Set<string>>(new Set());
  const [selectedSecret, setSelectedSecret] = useState<string | null>(null);

  // 合併 localStorage 和本地狀態
  const readSecrets = useMemo(() => {
    const combined = new Set(readSecretsFromStorage);
    localReadSecrets.forEach(id => combined.add(id));
    return combined;
  }, [readSecretsFromStorage, localReadSecrets]);

  // 已揭露的隱藏資訊（從 API 回傳的已經是過濾過的）
  const revealedSecrets = useMemo(
    () => secretInfo?.secrets || [],
    [secretInfo?.secrets]
  );

  // 如果沒有已揭露的隱藏資訊，不顯示任何內容
  if (revealedSecrets.length === 0) {
    return null;
  }

  // 點擊隱藏資訊時標記為已閱讀
  const handleSecretClick = (secretId: string) => {
    setSelectedSecret(secretId);
    // 更新本地狀態
    setLocalReadSecrets(prev => {
      const newSet = new Set(prev);
      newSet.add(secretId);
      return newSet;
    });
    // 更新 localStorage
    if (typeof window !== 'undefined') {
      const newReadSecrets = new Set(readSecrets);
      newReadSecrets.add(secretId);
      localStorage.setItem(
        `character-${characterId}-read-secrets`,
        JSON.stringify(Array.from(newReadSecrets))
      );
    }
  };

  const selectedSecretData = revealedSecrets.find(
    (s) => s.id === selectedSecret
  );

  return (
    <>
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Lock className="mr-2 h-5 w-5" />
            隱藏資訊
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {revealedSecrets.map((secret) => {
              const isRead = readSecrets.has(secret.id);
              return (
                <Card
                  key={secret.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isRead
                      ? 'opacity-75'
                      : 'border-primary/30 bg-primary/10'
                  }`}
                  onClick={() => handleSecretClick(secret.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold">{secret.title}</h4>
                      {!isRead && (
                        <Badge variant="secondary">
                          <Eye className="h-3 w-3 mr-1" />
                          未讀
                        </Badge>
                      )}
                    </div>
                    {secret.revealCondition && (
                      <p className="text-xs text-muted-foreground mb-2">
                        揭露條件：{secret.revealCondition}
                      </p>
                    )}
                    {secret.revealedAt && (
                      <p className="text-xs text-muted-foreground">
                        揭露於：{formatDate(secret.revealedAt)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Dialog 顯示隱藏資訊完整內容 */}
      <Dialog
        open={selectedSecret !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSecret(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedSecretData?.title}</DialogTitle>
            <DialogDescription>
              {selectedSecretData?.revealCondition && (
                <span>揭露條件：{selectedSecretData.revealCondition}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <p className="whitespace-pre-wrap">{selectedSecretData?.content}</p>
            {selectedSecretData?.revealedAt && (
              <p className="mt-4 text-xs text-muted-foreground">
                揭露於：{formatDate(selectedSecretData.revealedAt)}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

