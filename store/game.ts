import { atom } from 'jotai';
import type { Game } from '@/types';

// 當前選中的劇本
export const currentGameAtom = atom<Game | null>(null);

// 劇本列表
export const gamesListAtom = atom<Game[]>([]);

// 劇本狀態篩選
export const gameStatusFilterAtom = atom<'all' | 'draft' | 'active' | 'completed'>('all');

// 過濾後的劇本列表
export const filteredGamesAtom = atom((get) => {
  const games = get(gamesListAtom);
  const filter = get(gameStatusFilterAtom);
  
  if (filter === 'all') {
    return games;
  }
  
  // 注意：Game 模型使用 isActive 而非 status
  // Phase 3: 暫時使用 isActive 來過濾，未來可能需要擴展狀態欄位
  if (filter === 'active') {
    return games.filter(game => game.isActive === true);
  }
  if (filter === 'draft' || filter === 'completed') {
    // 目前沒有 draft/completed 狀態，返回空陣列
    return [];
  }
  return games;
});

