/**
 * @vitest-environment jsdom
 *
 * SkillsEditForm 資料來源測試（perf 去重：getGameItems / getGameSkills 改由 page 層 props 下傳）
 *
 * 契約：SkillsEditForm 不再自行呼叫 getGameItems / getGameSkills，
 * 改接受 gameItems / gameSkills props 並下傳給 AbilityEditWizard。
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillsEditForm } from '../skills-edit-form';
import type { GameItemInfo, GameSkillInfo } from '@/app/actions/games';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { getGameItemsMock, getGameSkillsMock } = vi.hoisted(() => ({
  getGameItemsMock: vi.fn(),
  getGameSkillsMock: vi.fn(),
}));
vi.mock('@/app/actions/games', () => ({
  getGameItems: getGameItemsMock,
  getGameSkills: getGameSkillsMock,
}));

vi.mock('@/app/actions/character-update', () => ({ updateCharacter: vi.fn() }));
vi.mock('@/app/actions/toggle-visibility', () => ({ toggleVisibility: vi.fn() }));

const { wizardSpy } = vi.hoisted(() => ({ wizardSpy: vi.fn() }));
vi.mock('@/components/gm/ability-edit-wizard', () => ({
  AbilityEditWizard: (props: unknown) => {
    wizardSpy(props);
    return null;
  },
}));

const gameItems: GameItemInfo[] = [
  { characterId: 'c1', characterName: '角色A', itemId: 'item-1', itemName: '寶劍', isHidden: false },
];
const gameSkills: GameSkillInfo[] = [
  { characterId: 'c1', characterName: '角色A', skillId: 'skill-1', skillName: '火球', isHidden: false },
];

beforeEach(() => {
  getGameItemsMock.mockResolvedValue({ success: true, data: [] });
  getGameSkillsMock.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SkillsEditForm gameItems / gameSkills 來源', () => {
  it('將 gameItems / gameSkills props 下傳給 AbilityEditWizard，且不自行抓取', async () => {
    const user = userEvent.setup();
    render(
      <SkillsEditForm
        characterId="char-1"
        initialSkills={[]}
        stats={[]}
        secrets={[]}
        gameItems={gameItems}
        gameSkills={gameSkills}
      />,
    );

    await user.click(screen.getByText('新增第一個技能'));

    const lastProps = wizardSpy.mock.calls.at(-1)?.[0] as {
      availableItems: GameItemInfo[];
      availableSkills: GameSkillInfo[];
    };
    expect(lastProps.availableItems).toEqual(gameItems);
    expect(lastProps.availableSkills).toEqual(gameSkills);

    expect(getGameItemsMock).not.toHaveBeenCalled();
    expect(getGameSkillsMock).not.toHaveBeenCalled();
  });
});
