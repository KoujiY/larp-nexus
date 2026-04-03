import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind CSS class merge 工具 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export * from './validators';
export * from './date';
export * from './tags';
