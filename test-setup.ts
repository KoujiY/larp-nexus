/**
 * Vitest 全域 setup
 *
 * - 載入 @testing-library/jest-dom 的自訂 matchers（toBeInTheDocument 等）
 * - 在 jsdom 環境的元件測試中自動可用
 */
import '@testing-library/jest-dom/vitest';
