'use client';

/**
 * 資訊分頁 — 角色故事子分頁
 *
 * 使用 BackgroundBlockRenderer 共用元件渲染 BackgroundBlock[]，
 * 支援標題摺疊/展開。
 */

import type { BackgroundBlock } from '@/types/character';
import { BackgroundBlockRenderer } from './background-block-renderer';

interface InfoStoryTabProps {
  background: BackgroundBlock[];
}

export function InfoStoryTab({ background }: InfoStoryTabProps) {
  return (
    <BackgroundBlockRenderer
      blocks={background}
      emptyMessage="尚無角色故事"
    />
  );
}
