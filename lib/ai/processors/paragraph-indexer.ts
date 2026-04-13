import type { CharacterImportResult } from '@/lib/ai/schemas/character-import';
import type { CharacterImportIndexResult } from '@/lib/ai/schemas/character-import-index';

/**
 * 段落索引法的核心處理器
 *
 * 1. splitIntoParagraphs — 將原文拆成帶編號的段落，供 AI 索引
 * 2. formatForAi — 將段落格式化為 AI 可讀的編號文字
 * 3. assembleResult — 根據 AI 的索引結果，從原文組裝最終的 CharacterImportResult
 */

export type NumberedParagraph = {
  index: number;
  content: string;
};

/**
 * 將原文按換行拆分，過濾空行，為每段編號（從 1 開始）
 */
export function splitIntoParagraphs(text: string): NumberedParagraph[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((content, i) => ({ index: i + 1, content }));
}

/**
 * 將帶編號的段落格式化為 AI 可讀的文字
 * 例如：
 * [1] 角色名：暗影刺客 凱恩
 * [2] 「在黑暗中，我才是規則。」
 */
export function formatForAi(paragraphs: NumberedParagraph[]): string {
  return paragraphs.map((p) => `[${p.index}] ${p.content}`).join('\n');
}

/**
 * 根據段落索引取得原文內容，多段以換行符連接
 * 無效索引會被跳過並輸出警告（AI 偶爾會回傳超出範圍的編號）
 */
function getParagraphContent(
  paragraphs: NumberedParagraph[],
  indices: number[]
): string {
  const indexMap = new Map(paragraphs.map((p) => [p.index, p.content]));
  const maxIndex = paragraphs.length;
  return indices
    .map((idx) => {
      const content = indexMap.get(idx);
      if (content === undefined) {
        console.warn(`[paragraph-indexer] 無效段落索引 ${idx}（有效範圍 1-${maxIndex}），已跳過`);
        return '';
      }
      return content;
    })
    .filter((c) => c.length > 0)
    .join('\n');
}

/**
 * 根據 AI 回傳的索引結果 + 原文段落，組裝最終的 CharacterImportResult
 *
 * 所有長文本欄位（background、personality、relationships description 等）
 * 都是從原文段落直接複製，不經過 AI 生成。
 */
export function assembleResult(
  indexResult: CharacterImportIndexResult,
  paragraphs: NumberedParagraph[],
  allowAiFill: boolean
): CharacterImportResult {
  // ─── Background ───
  const backgroundFromParagraphs = indexResult.backgroundSections.flatMap((section) => {
    const blocks: CharacterImportResult['publicInfo']['background'] = [];
    if (section.title) {
      blocks.push({ type: 'title', content: section.title });
    }
    const bodyContent = getParagraphContent(paragraphs, section.paragraphs);
    if (bodyContent) {
      blocks.push({ type: 'body', content: bodyContent });
    }
    return blocks;
  });
  const background = backgroundFromParagraphs.length > 0
    ? backgroundFromParagraphs
    : (allowAiFill && indexResult.aiFilled.backgroundText)
      ? [{ type: 'body' as const, content: indexResult.aiFilled.backgroundText }]
      : [];

  // ─── Personality ───
  const personalityFromParagraphs = getParagraphContent(
    paragraphs,
    indexResult.personalityParagraphs
  );
  const personality = personalityFromParagraphs
    || (allowAiFill ? indexResult.aiFilled.personality : null)
    || null;

  // ─── Relationships ───
  const relationshipsFromParagraphs = indexResult.relationships.map((rel) => ({
    targetName: rel.targetName,
    description: getParagraphContent(paragraphs, rel.paragraphs),
  }));
  const relationships = relationshipsFromParagraphs.length > 0
    ? relationshipsFromParagraphs
    : (allowAiFill && indexResult.aiFilled.relationships.length > 0)
      ? indexResult.aiFilled.relationships
      : [];

  // ─── Secrets ───
  const secrets = indexResult.secrets.map((secret) => ({
    title: secret.title,
    content: getParagraphContent(paragraphs, secret.paragraphs),
  }));

  // ─── Tasks ───
  const tasksFromParagraphs = indexResult.tasks.map((task) => ({
    title: task.title,
    description: getParagraphContent(paragraphs, task.paragraphs),
  }));
  const tasks = tasksFromParagraphs.length > 0
    ? tasksFromParagraphs
    : (allowAiFill && indexResult.aiFilled.tasks.length > 0)
      ? indexResult.aiFilled.tasks
      : [];

  // ─── Short fields（AI 直接提取，或用 aiFilled 補足） ───
  const description = indexResult.description
    || (allowAiFill ? indexResult.aiFilled.description : null)
    || '';

  const slogan = indexResult.slogan
    || (allowAiFill ? indexResult.aiFilled.slogan : null)
    || null;

  return {
    name: indexResult.name,
    description,
    slogan,
    publicInfo: {
      background,
      personality,
      relationships,
    },
    secretInfo: { secrets },
    tasks,
    stats: indexResult.stats.map((s) => ({
      name: s.name,
      value: s.value,
      ...(s.maxValue != null ? { maxValue: s.maxValue } : {}),
    })),
  };
}
