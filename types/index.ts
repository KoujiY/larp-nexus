// 匯出所有類型定義
export * from './game';
export * from './character';
export * from './event';
export * from './api';
export * from './runtime'; // Phase 10
export * from './log'; // Phase 10

// GM User 類型
export interface GMUser {
  _id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Session 類型
export interface SessionData {
  gmId: string;
  email: string;
  displayName: string;
  expiresAt: number;
}

// Magic Link 類型
export interface MagicLink {
  _id: string;
  email: string;
  token: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

