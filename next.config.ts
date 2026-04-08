import type { NextConfig } from "next";
import path from "node:path";

// 專案是 CommonJS（package.json 無 "type": "module"），避免使用 import.meta.url
// 之類的 ESM-only 語法，改用 process.cwd() 取得專案根目錄。
const projectRoot = process.cwd();

const isE2E = process.env.E2E === '1';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
  webpack: (config) => {
    if (isE2E) {
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
    }
    return config;
  },
};

export default nextConfig;
