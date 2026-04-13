import { describe, it, expect } from 'vitest';
import {
  characterImportSchema,
  type CharacterImportResult,
} from '@/lib/ai/schemas/character-import';
import {
  characterImportIndexSchema,
  characterImportIndexJsonSchema,
} from '@/lib/ai/schemas/character-import-index';

describe('characterImportSchema', () => {
  it('驗證完整的合法輸入', () => {
    const input: CharacterImportResult = {
      name: '流浪騎士 艾德溫',
      description: '一位失落王國的騎士',
      slogan: '吾劍即正義',
      publicInfo: {
        background: [
          { type: 'title', content: '出身' },
          { type: 'body', content: '來自北方的沒落貴族' },
        ],
        personality: '正直、固執',
        relationships: [
          { targetName: '公主 莉莉安', description: '效忠對象，暗戀' },
        ],
      },
      secretInfo: {
        secrets: [
          { title: '真實身份', content: '其實是前國王的私生子' },
        ],
      },
      tasks: [
        { title: '尋找聖劍', description: '找到傳說中的聖劍並帶回王都' },
      ],
      stats: [
        { name: '力量', value: 8, maxValue: 10 },
        { name: '智力', value: 5 },
      ],
    };

    const result = characterImportSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('允許 null/空的 optional 欄位', () => {
    const input: CharacterImportResult = {
      name: '無名旅人',
      description: '',
      slogan: null,
      publicInfo: {
        background: [],
        personality: null,
        relationships: [],
      },
      secretInfo: {
        secrets: [],
      },
      tasks: [],
      stats: [],
    };

    const result = characterImportSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('name 為空字串時驗證失敗', () => {
    const input = {
      name: '',
      description: '',
      slogan: null,
      publicInfo: { background: [], personality: null, relationships: [] },
      secretInfo: { secrets: [] },
      tasks: [],
      stats: [],
    };

    const result = characterImportSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('characterImportIndexSchema', () => {
  it('驗證最小合法索引結果', () => {
    const input = {
      reasoning: 'Step 1: ...',
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
    };

    const result = characterImportIndexSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('JSON schema 結構包含所有必要欄位', () => {
    expect(characterImportIndexJsonSchema.type).toBe('object');
    expect(characterImportIndexJsonSchema.properties).toHaveProperty('reasoning');
    expect(characterImportIndexJsonSchema.properties).toHaveProperty('name');
    expect(characterImportIndexJsonSchema.properties).toHaveProperty('backgroundSections');
    expect(characterImportIndexJsonSchema.properties).toHaveProperty('aiFilled');
    expect(characterImportIndexJsonSchema.required).toContain('reasoning');
    expect(characterImportIndexJsonSchema.required).toContain('name');
  });
});
