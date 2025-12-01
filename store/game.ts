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
  
  return games.filter(game => game.status === filter);
});

