'use client';

/**
 * BackgroundBlock[] 渲染器
 *
 * 將 BackgroundBlock[] 依照標題分組，每個標題下的內文包在
 * CollapsibleSection 中，支援展開/收合。
 *
 * 分組邏輯：
 * - 遇到 title block → 開啟新分組
 * - title 之前的 body block → 作為無標題段落直接渲染（不包在 CollapsibleSection）
 *
 * 用於：世界觀頁面、角色故事分頁
 */

import type { BackgroundBlock } from '@/types/character';
import { CollapsibleSection } from './collapsible-section';

interface BackgroundBlockRendererProps {
  blocks: BackgroundBlock[];
  /** 空狀態訊息 */
  emptyMessage?: string;
}

interface BlockGroup {
  title: string | null;
  bodyBlocks: BackgroundBlock[];
}

/** 將 BackgroundBlock[] 依照 title 分組 */
function groupBlocksByTitle(blocks: BackgroundBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  let current: BlockGroup = { title: null, bodyBlocks: [] };

  for (const block of blocks) {
    if (block.type === 'title') {
      // 先推入前一個分組（如果有 body）
      if (current.title !== null || current.bodyBlocks.length > 0) {
        groups.push(current);
      }
      current = { title: block.content, bodyBlocks: [] };
    } else {
      current.bodyBlocks.push(block);
    }
  }

  // 推入最後一個分組
  if (current.title !== null || current.bodyBlocks.length > 0) {
    groups.push(current);
  }

  return groups;
}

function BodyBlocks({ blocks }: { blocks: BackgroundBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {block.content}
        </p>
      ))}
    </>
  );
}

export function BackgroundBlockRenderer({
  blocks,
  emptyMessage = '尚無內容',
}: BackgroundBlockRendererProps) {
  if (blocks.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground/60">
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  const groups = groupBlocksByTitle(blocks);

  return (
    <article className="space-y-10">
      {groups.map((group, index) =>
        group.title ? (
          <CollapsibleSection key={index} title={group.title}>
            <BodyBlocks blocks={group.bodyBlocks} />
          </CollapsibleSection>
        ) : (
          /* 無標題段落：直接渲染 body blocks */
          <div
            key={index}
            className="space-y-4 text-muted-foreground leading-[2] text-base font-light"
          >
            <BodyBlocks blocks={group.bodyBlocks} />
          </div>
        ),
      )}
    </article>
  );
}
