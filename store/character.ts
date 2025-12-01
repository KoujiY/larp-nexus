import { atom } from 'jotai';
import type { Character } from '@/types';

// 當前角色資訊（玩家端使用）
export const characterAtom = atom<Character | null>(null);

// 角色列表（GM 端使用）
export const charactersAtom = atom<Character[]>([]);

// 秘密是否已解鎖
export const isSecretUnlockedAtom = atom((get) => {
  const character = get(characterAtom);
  return character?.secretInfo.isUnlocked || false;
});

// 未完成的任務
export const pendingTasksAtom = atom((get) => {
  const character = get(characterAtom);
  if (!character) return [];
  
  return character.tasks.filter(task => task.status !== 'completed');
});

// 已完成的任務
export const completedTasksAtom = atom((get) => {
  const character = get(characterAtom);
  if (!character) return [];
  
  return character.tasks.filter(task => task.status === 'completed');
});

