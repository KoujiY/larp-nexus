/**
 * E2E Playwright Custom Fixtures
 *
 * 統一所有 spec 使用的 fixture，提供：
 * - `resetDb`：auto fixture，每個 test 前清空 DB + contest-tracker + event bus
 * - `seed`：builder object，透過 `/api/test/seed` 建立測試資料
 * - `dbQuery`：透過 `/api/test/db-query` 查詢 DB 狀態
 * - `asGm`：設定 GM session（透過 test-login）
 * - `asPlayer`：設定 Player session + localStorage unlock
 * - `asGmAndPlayer`：建立兩個獨立 context，分別為 GM 和 Player
 *
 * 所有 spec 應從 `../fixtures` import `test` 和 `expect`，不直接用 `@playwright/test`。
 */

import { test as base, expect, type Page, type BrowserContext, type APIRequestContext } from '@playwright/test';
import type { Browser } from '@playwright/test';

// ─── Types ───────────────────────────────────────

type SeedInput = Record<string, unknown>;

interface SeedResult {
  _id: string;
  [key: string]: unknown;
}

interface GmWithGameOverrides {
  gmUserOverrides?: SeedInput;
  gameOverrides?: SeedInput;
}

interface GmWithGameResult {
  gmUserId: string;
  gameId: string;
  gameCode: string;
}

interface GmWithGameAndCharacterOverrides extends GmWithGameOverrides {
  characterOverrides?: SeedInput;
}

interface GmWithGameAndCharacterResult extends GmWithGameResult {
  characterId: string;
}

interface GmAndPlayerPages {
  gmPage: Page;
  playerPage: Page;
  gmContext: BrowserContext;
  playerContext: BrowserContext;
}

interface SeedBuilder {
  /** 建立 GM 使用者 */
  gmUser(overrides?: SeedInput): Promise<SeedResult>;
  /** 建立遊戲 */
  game(overrides: SeedInput & { gmUserId: string }): Promise<SeedResult & { gameCode: string }>;
  /** 建立角色（Baseline） */
  character(overrides: SeedInput & { gameId: string }): Promise<SeedResult>;
  /** 建立角色 Runtime */
  characterRuntime(overrides: SeedInput & { refId: string; gameId: string }): Promise<SeedResult>;
  /** 建立遊戲 Runtime */
  gameRuntime(overrides: SeedInput & { refId: string; gmUserId: string }): Promise<SeedResult>;
  /** 建立 PendingEvent */
  pendingEvent(overrides: SeedInput): Promise<SeedResult>;
  /** 建立 Log */
  log(overrides: SeedInput): Promise<SeedResult>;
  /** 便利方法：建立 GM + Game */
  gmWithGame(overrides?: GmWithGameOverrides): Promise<GmWithGameResult>;
  /** 便利方法：建立 GM + Game + Character（Baseline） */
  gmWithGameAndCharacter(overrides?: GmWithGameAndCharacterOverrides): Promise<GmWithGameAndCharacterResult>;
}

interface DbQueryFn {
  (collection: string, filter?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
}

interface AsGmOptions {
  gmUserId: string;
  email?: string;
}

interface AsPlayerOptions {
  characterId: string;
  readOnly?: boolean;
}

interface AsGmAndPlayerOptions {
  gmUserId: string;
  characterId: string;
  email?: string;
  readOnly?: boolean;
}

// ─── Fixture Types ───────────────────────────────

interface E2EFixtures {
  resetDb: void;
  seed: SeedBuilder;
  dbQuery: DbQueryFn;
  asGm: (options: AsGmOptions) => Promise<void>;
  asPlayer: (options: AsPlayerOptions) => Promise<void>;
  asGmAndPlayer: (options: AsGmAndPlayerOptions) => Promise<GmAndPlayerPages>;
}

// ─── Auto-incrementing gameCode ──────────────────

let gameCodeCounter = 0;

function nextGameCode(): string {
  gameCodeCounter += 1;
  return `E2E${String(gameCodeCounter).padStart(3, '0')}`;
}

// ─── Seed helper: call /api/test/seed ────────────

async function callSeed(
  request: APIRequestContext,
  key: string,
  data: SeedInput,
): Promise<SeedResult> {
  const response = await request.post('/api/test/seed', {
    data: { [key]: [data] },
  });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Seed ${key} failed (${response.status()}): ${body}`);
  }
  const json = await response.json() as { ids: Record<string, string[]> };
  return { _id: json.ids[key][0], ...data };
}

// ─── Fixtures ────────────────────────────────────

export const test = base.extend<E2EFixtures>({
  // auto fixture：每個 test 前清空 DB
  resetDb: [
    async ({ request }, use) => {
      const response = await request.post('/api/test/reset');
      if (!response.ok()) {
        throw new Error(`Reset failed (${response.status()}): ${await response.text()}`);
      }
      gameCodeCounter = 0; // 重設 gameCode counter
      await use();
    },
    { auto: true },
  ],

  // seed builder
  seed: async ({ request }, use) => {
    const builder: SeedBuilder = {
      async gmUser(overrides = {}) {
        const data = {
          email: 'e2e-gm@test.com',
          displayName: 'E2E GM',
          ...overrides,
        };
        return callSeed(request, 'gmUsers', data);
      },

      async game(overrides) {
        const { gmUserId, ...rest } = overrides;
        const data = {
          gmUserId,
          name: 'E2E Game',
          gameCode: nextGameCode(),
          ...rest,
        };
        const result = await callSeed(request, 'games', data);
        return { ...result, gameCode: data.gameCode as string };
      },

      async character(overrides) {
        const { gameId, ...rest } = overrides;
        const data = {
          gameId,
          name: 'E2E Character',
          ...rest,
        };
        return callSeed(request, 'characters', data);
      },

      async characterRuntime(overrides) {
        const { refId, gameId, ...rest } = overrides;
        const data = {
          refId,
          gameId,
          type: 'runtime',
          name: 'E2E Character',
          ...rest,
        };
        return callSeed(request, 'characterRuntimes', data);
      },

      async gameRuntime(overrides) {
        const { refId, gmUserId, ...rest } = overrides;
        const data = {
          refId,
          gmUserId,
          type: 'runtime',
          name: 'E2E Game',
          gameCode: nextGameCode(),
          ...rest,
        };
        return callSeed(request, 'gameRuntimes', data);
      },

      async pendingEvent(overrides) {
        const data = {
          id: `e2e-event-${Date.now()}`,
          eventType: 'test',
          eventPayload: {},
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          ...overrides,
        };
        return callSeed(request, 'pendingEvents', data);
      },

      async log(overrides) {
        const data = {
          actorType: 'system',
          actorId: 'e2e',
          action: 'test',
          ...overrides,
        };
        return callSeed(request, 'logs', data);
      },

      async gmWithGame(overrides = {}) {
        const { gmUserOverrides = {}, gameOverrides = {} } = overrides;
        const gm = await builder.gmUser(gmUserOverrides);
        const game = await builder.game({ gmUserId: gm._id, ...gameOverrides });
        return {
          gmUserId: gm._id,
          gameId: game._id,
          gameCode: game.gameCode,
        };
      },

      async gmWithGameAndCharacter(overrides = {}) {
        const { characterOverrides = {}, ...gmGameOverrides } = overrides;
        const { gmUserId, gameId, gameCode } = await builder.gmWithGame(gmGameOverrides);
        const character = await builder.character({ gameId, ...characterOverrides });
        return {
          gmUserId,
          gameId,
          gameCode,
          characterId: character._id,
        };
      },
    };

    await use(builder);
  },

  // DB 查詢
  dbQuery: async ({ request }, use) => {
    const queryFn: DbQueryFn = async (collection, filter = {}) => {
      const params = new URLSearchParams({
        collection,
        filter: JSON.stringify(filter),
      });
      const response = await request.get(`/api/test/db-query?${params.toString()}`);
      if (!response.ok()) {
        throw new Error(
          `dbQuery failed (${response.status()}): ${await response.text()}`,
        );
      }
      const json = await response.json() as { documents: Record<string, unknown>[] };
      return json.documents;
    };
    await use(queryFn);
  },

  // GM login
  asGm: async ({ page, request }, use) => {
    const loginAsGm = async ({ gmUserId, email }: AsGmOptions) => {
      const response = await request.post('/api/test/login', {
        data: {
          mode: 'gm',
          gmUserId,
          email: email ?? 'e2e-gm@test.com',
        },
      });
      if (!response.ok()) {
        throw new Error(`GM login failed (${response.status()})`);
      }
      // 重新載入頁面以套用 session cookie
      await page.reload();
    };
    await use(loginAsGm);
  },

  // Player login + localStorage unlock
  asPlayer: async ({ page, request }, use) => {
    const loginAsPlayer = async ({ characterId, readOnly }: AsPlayerOptions) => {
      const response = await request.post('/api/test/login', {
        data: {
          mode: 'player',
          characterIds: [characterId],
        },
      });
      if (!response.ok()) {
        throw new Error(`Player login failed (${response.status()})`);
      }

      // 設定 localStorage unlock 狀態
      await page.addInitScript(
        ({ id, full }: { id: string; full: boolean }) => {
          localStorage.setItem(`character-${id}-unlocked`, 'true');
          if (full) {
            localStorage.setItem(`character-${id}-fullAccess`, 'true');
          }
        },
        { id: characterId, full: readOnly !== true },
      );
    };
    await use(loginAsPlayer);
  },

  // 同時建立 GM + Player 的獨立 context
  asGmAndPlayer: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];

    const setup = async ({
      gmUserId,
      characterId,
      email,
      readOnly,
    }: AsGmAndPlayerOptions): Promise<GmAndPlayerPages> => {
      // GM context
      const gmContext = await (browser as Browser).newContext({
        baseURL: 'http://127.0.0.1:3100',
      });
      contexts.push(gmContext);
      const gmPage = await gmContext.newPage();
      const gmRequest = gmContext.request;

      await gmRequest.post('/api/test/login', {
        data: {
          mode: 'gm',
          gmUserId,
          email: email ?? 'e2e-gm@test.com',
        },
      });

      // Player context
      const playerContext = await (browser as Browser).newContext({
        baseURL: 'http://127.0.0.1:3100',
      });
      contexts.push(playerContext);
      const playerPage = await playerContext.newPage();
      const playerRequest = playerContext.request;

      await playerRequest.post('/api/test/login', {
        data: {
          mode: 'player',
          characterIds: [characterId],
        },
      });

      await playerPage.addInitScript(
        ({ id, full }: { id: string; full: boolean }) => {
          localStorage.setItem(`character-${id}-unlocked`, 'true');
          if (full) {
            localStorage.setItem(`character-${id}-fullAccess`, 'true');
          }
        },
        { id: characterId, full: readOnly !== true },
      );

      return { gmPage, playerPage, gmContext, playerContext };
    };

    await use(setup);

    // Teardown：清理所有 context
    for (const ctx of contexts) {
      await ctx.close();
    }
  },
});

export { expect };
