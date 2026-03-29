'use client';

/**
 * 資訊分頁 — 角色故事子分頁
 *
 * 依照 GM 編排的 BackgroundBlock[] 順序渲染，
 * 標題使用 primary 強調色，內文使用寬行距的 prose 風格。
 */

import type { BackgroundBlock } from '@/types/character';

interface InfoStoryTabProps {
  background: BackgroundBlock[];
}

export function InfoStoryTab({ background }: InfoStoryTabProps) {
  if (background.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground/60">
        <p className="text-sm">尚無角色故事</p>
      </div>
    );
  }

  return (
    <article className="prose prose-invert max-w-none space-y-6">
      {background.map((block, index) =>
        block.type === 'title' ? (
          <h3
            key={index}
            className="text-primary font-bold text-2xl font-headline tracking-tight"
          >
            {block.content}
          </h3>
        ) : (
          <p
            key={index}
            className="text-muted-foreground leading-[2] text-base font-light whitespace-pre-wrap"
          >
            {block.content}
          </p>
        )
      )}
    </article>
  );
}
