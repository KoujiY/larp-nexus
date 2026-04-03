'use client';

/**
 * 資訊分頁 — 額外資訊子分頁
 *
 * 列表式卡片顯示已揭露的額外資訊，
 * 點擊後以 Bottom Sheet 展示完整內容（支援多段落）。
 * 保留原有的 localStorage 已讀追蹤邏輯。
 */

import { useState, useMemo, useSyncExternalStore, useCallback } from 'react';
import { BottomSheet } from './bottom-sheet';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';
import type { SecretInfo } from '@/types/character';
import { normalizeSecretContent } from '@/types/character';
import { formatDate } from '@/lib/utils/date';

interface InfoSecretsTabProps {
  secretInfo?: SecretInfo;
  characterId: string;
}

/** SSR-safe localStorage 已讀追蹤 */
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
      return new Set(JSON.parse(storedValue) as string[]);
    } catch {
      return new Set<string>();
    }
  }, [storedValue]);
}

export function InfoSecretsTab({ secretInfo, characterId }: InfoSecretsTabProps) {
  const readSecretsFromStorage = useReadSecrets(characterId);
  const [localReadSecrets, setLocalReadSecrets] = useState<Set<string>>(new Set());
  const [selectedSecretId, setSelectedSecretId] = useState<string | null>(null);

  const readSecrets = useMemo(() => {
    const combined = new Set(readSecretsFromStorage);
    localReadSecrets.forEach((id) => combined.add(id));
    return combined;
  }, [readSecretsFromStorage, localReadSecrets]);

  const revealedSecrets = useMemo(
    () => secretInfo?.secrets || [],
    [secretInfo?.secrets]
  );

  const handleSecretClick = (secretId: string) => {
    setSelectedSecretId(secretId);
    setLocalReadSecrets((prev) => {
      const newSet = new Set(prev);
      newSet.add(secretId);
      return newSet;
    });
    if (typeof window !== 'undefined') {
      const newReadSecrets = new Set(readSecrets);
      newReadSecrets.add(secretId);
      localStorage.setItem(
        `character-${characterId}-read-secrets`,
        JSON.stringify(Array.from(newReadSecrets))
      );
    }
  };

  const selectedSecret = revealedSecrets.find((s) => s.id === selectedSecretId);

  if (revealedSecrets.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground/60">
        <p className="text-sm">尚無已揭露的額外資訊</p>
      </div>
    );
  }

  return (
    <>
      {/* 額外資訊列表 */}
      <div className="space-y-3">
        {revealedSecrets.map((secret) => {
          const isRead = readSecrets.has(secret.id);
          return (
            <button
              key={secret.id}
              onClick={() => handleSecretClick(secret.id)}
              className="group w-full text-left bg-surface-base hover:bg-popover px-6 py-5 rounded-xl transition-all duration-300 cursor-pointer border border-border/5"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h6 className="font-bold text-foreground text-base tracking-wide group-hover:text-primary transition-colors">
                    {secret.title}
                  </h6>
                  {secret.revealedAt && (
                    <p className="text-[10px] text-muted-foreground/70 uppercase mt-1 tracking-[0.15em]">
                      {formatDate(secret.revealedAt)}
                    </p>
                  )}
                </div>
                {!isRead && (
                  <span className="px-2 py-0.5 bg-primary/20 text-primary text-[9px] font-bold rounded-full shrink-0">
                    NEW
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 額外資訊 Bottom Sheet */}
      <BottomSheet
        open={selectedSecretId !== null}
        onClose={() => setSelectedSecretId(null)}
        ariaLabel={selectedSecret?.title}
        contentClassName="px-8 pt-2 pb-8"
        footer={
          <Button
            onClick={() => setSelectedSecretId(null)}
            className="w-full py-4 bg-linear-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm uppercase tracking-widest"
          >
            確認
          </Button>
        }
      >
        {selectedSecret && (
          <div className="space-y-6">
            {/* Header */}
            <div className="space-y-1 pt-4">
              <span className="text-primary text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">
                Classified Archives
              </span>
              <h2 className="text-3xl font-extrabold text-primary tracking-tight">
                {selectedSecret.title}
              </h2>
              {selectedSecret.revealedAt && (
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground/60 pt-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Recorded: {formatDate(selectedSecret.revealedAt)}</span>
                </div>
              )}
            </div>

            {/* 多段落內容 */}
            <div className="text-muted-foreground leading-relaxed font-light space-y-4">
              {normalizeSecretContent(selectedSecret.content).map((paragraph, index) => (
                <p
                  key={index}
                  className={`text-lg whitespace-pre-wrap ${
                    index === 0
                      ? 'first-letter:text-5xl first-letter:font-bold first-letter:text-primary first-letter:mr-3 first-letter:float-left'
                      : ''
                  }`}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
