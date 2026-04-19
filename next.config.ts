import type { NextConfig } from "next";
import path from "node:path";
import nextBundleAnalyzer from "@next/bundle-analyzer";

// 專案是 CommonJS（package.json 無 "type": "module"），避免使用 import.meta.url
// 之類的 ESM-only 語法，改用 process.cwd() 取得專案根目錄。
const projectRoot = process.cwd();

const isE2E = process.env.E2E === '1';
const isAnalyze = process.env.ANALYZE === '1';

// ANALYZE=1 時啟用 bundle analyzer。需搭配 `next build --webpack` 使用，
// 因為 analyzer 依賴 webpack plugin，與 Turbopack 不相容。
const withBundleAnalyzer = nextBundleAnalyzer({
  enabled: isAnalyze,
  openAnalyzer: false,
});

// 只在 E2E=1 時才把 Pusher 模組 alias 到 stub 版本。
// 重要：整個 `webpack` key 必須是條件式的——Next.js 16 預設走 Turbopack，
// 只要看到 config 裡存在 `webpack` key 就會抱怨與 Turbopack 不相容，
// 不會去檢查 function 內部的 if 分支。
const e2eWebpackConfig: NextConfig['webpack'] = (config) => {
  // Webpack alias 的 exact-match 語法：key 結尾加上 "$" 代表只匹配完整路徑，
  // 不會誤傷 pusher-server.e2e 或其他前綴相同的路徑。
  // 原始 pusher-server.ts / pusher-client.ts 不動，只在 E2E build 時 swap。
  const pusherServerKey =
    path.resolve(projectRoot, 'lib/websocket/pusher-server') + '$';
  const pusherClientKey =
    path.resolve(projectRoot, 'lib/websocket/pusher-client') + '$';

  config.resolve = config.resolve ?? {};
  config.resolve.alias = {
    ...(config.resolve.alias ?? {}),
    [pusherServerKey]: path.resolve(
      projectRoot,
      'lib/websocket/pusher-server.e2e.ts',
    ),
    [pusherClientKey]: path.resolve(
      projectRoot,
      'lib/websocket/pusher-client.e2e.ts',
    ),
  };
  return config;
};

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
  // Barrel 檔案優化：Next 會為這些套件自動做 on-demand import，
  // 降低 client bundle 的 tree-shake 殘留。Baseline 報告顯示 lucide-react
  // 與 @radix-ui 是共用 chunks 的主要貢獻者，最受惠於此設定。
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'radix-ui',
      '@radix-ui/react-accordion',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-progress',
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
    ],
  },
  // 條件式 spread：E2E=1 才注入 webpack key，production build 維持走 Turbopack
  ...(isE2E ? { webpack: e2eWebpackConfig } : {}),
};

export default withBundleAnalyzer(nextConfig);
