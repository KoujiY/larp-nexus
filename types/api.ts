// API 相關類型定義
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_EMAIL'
  | 'INVALID_PIN'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EXPIRED_TOKEN'
  | 'USED_TOKEN'
  | 'RATE_LIMIT'
  | 'SERVER_ERROR';

export interface ErrorResponse {
  success: false;
  error: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

