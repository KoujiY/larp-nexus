import { describe, it, expect } from 'vitest';
import {
  splitIntoParagraphs,
  assembleResult,
  type NumberedParagraph,
} from '@/lib/ai/processors/paragraph-indexer';
import type { CharacterImportIndexResult } from '@/lib/ai/schemas/character-import-index';

/** 建立最小可用的 index 結果，測試時覆寫所需欄位 */
function makeIndexResult(overrides: Partial<CharacterImportIndexResult> = {}): CharacterImportIndexResult {
  return {
    reasoning: '',
    name: '測試角色',
    description: '',
    slogan: null,
    backgroundSections: [],
    personalityParagraphs: [],
    relationships: [],
    secrets: [],
    tasks: [],
    stats: [],
    aiFilled: {
      description: null,
      slogan: null,
      personality: null,
      backgroundText: null,
      relationships: [],
      tasks: [],
    },
    ...overrides,
  };
}

const paragraphs: NumberedParagraph[] = [
  { index: 1, content: '第一行背景' },
  { index: 2, content: '第二行背景' },
  { index: 3, content: '第三行背景' },
];

describe('assembleResult — 背景每段落獨立成 body 區塊（Feature: line blocks）', () => {
  it('一個區段的多個段落 → 每段各自一個 body 區塊（而非合併成一坨）', () => {
    const result = assembleResult(
      makeIndexResult({
        backgroundSections: [{ title: '出身', paragraphs: [1, 2, 3] }],
      }),
      paragraphs,
      false,
    );
    expect(result.publicInfo.background).toEqual([
      { type: 'title', content: '出身' },
      { type: 'body', content: '第一行背景' },
      { type: 'body', content: '第二行背景' },
      { type: 'body', content: '第三行背景' },
    ]);
  });

  it('無標題區段 → 僅逐段 body 區塊', () => {
    const result = assembleResult(
      makeIndexResult({
        backgroundSections: [{ title: null, paragraphs: [1, 2] }],
      }),
      paragraphs,
      false,
    );
    expect(result.publicInfo.background).toEqual([
      { type: 'body', content: '第一行背景' },
      { type: 'body', content: '第二行背景' },
    ]);
  });

  it('多個區段 → 各自標題 + 逐段 body，依序排列', () => {
    const result = assembleResult(
      makeIndexResult({
        backgroundSections: [
          { title: '出身', paragraphs: [1] },
          { title: '叛離', paragraphs: [2, 3] },
        ],
      }),
      paragraphs,
      false,
    );
    expect(result.publicInfo.background).toEqual([
      { type: 'title', content: '出身' },
      { type: 'body', content: '第一行背景' },
      { type: 'title', content: '叛離' },
      { type: 'body', content: '第二行背景' },
      { type: 'body', content: '第三行背景' },
    ]);
  });

  it('無效段落索引被跳過，不產生空 body 區塊', () => {
    const result = assembleResult(
      makeIndexResult({
        backgroundSections: [{ title: null, paragraphs: [1, 99] }],
      }),
      paragraphs,
      false,
    );
    expect(result.publicInfo.background).toEqual([
      { type: 'body', content: '第一行背景' },
    ]);
  });

  it('allowAiFill 時無段落 → 仍以 aiFilled.backgroundText 作為單一 body 區塊', () => {
    const result = assembleResult(
      makeIndexResult({
        backgroundSections: [],
        aiFilled: {
          description: null,
          slogan: null,
          personality: null,
          backgroundText: 'AI 補足的背景',
          relationships: [],
          tasks: [],
        },
      }),
      paragraphs,
      true,
    );
    expect(result.publicInfo.background).toEqual([
      { type: 'body', content: 'AI 補足的背景' },
    ]);
  });
});

describe('assembleResult — 僅背景逐行；其他長文欄位維持合併（鎖住刻意的不對稱）', () => {
  it('personality / relationships / tasks 的多段落仍合併為單一字串（換行相連）', () => {
    const result = assembleResult(
      makeIndexResult({
        personalityParagraphs: [1, 2],
        relationships: [{ targetName: '夥伴', paragraphs: [2, 3] }],
        tasks: [{ title: '任務', paragraphs: [1, 3] }],
      }),
      paragraphs,
      false,
    );
    // 性格：兩段合併
    expect(result.publicInfo.personality).toBe('第一行背景\n第二行背景');
    // 關係描述：兩段合併
    expect(result.publicInfo.relationships[0].description).toBe('第二行背景\n第三行背景');
    // 任務描述：兩段合併
    expect(result.tasks[0].description).toBe('第一行背景\n第三行背景');
  });
});

describe('splitIntoParagraphs — 每非空行成一段（行為前提）', () => {
  it('依換行切分、過濾空行、從 1 編號', () => {
    const result = splitIntoParagraphs('行一\n\n  行二  \n\n行三\n');
    expect(result).toEqual([
      { index: 1, content: '行一' },
      { index: 2, content: '行二' },
      { index: 3, content: '行三' },
    ]);
  });
});
