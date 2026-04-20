# Tech Stack

## Core
| Technology | Version | Role |
|-----------|---------|------|
| Next.js | 16+ | Full-stack framework (SSR, API Routes, Server Actions) |
| React | 19+ | UI |
| TypeScript | 5+ | Type safety (strict mode) |
| MongoDB Atlas | 7+ | Database (free M0 tier) |
| Mongoose | 8+ | MongoDB ODM |

## UI
| Technology | Role |
|-----------|------|
| Tailwind CSS 4+ | Utility CSS (with `next/font` loading Geist + Geist_Mono) |
| shadcn/ui | Component library (Radix UI based) |
| Lucide React | Icons |
| CSS transitions / keyframes | Animations — no animation library installed (removed framer-motion 2026-04-19 per CSS-first policy; see `.impeccable.md` and `docs/specs/DESIGN.md`) |

## Real-time
| Technology | Role |
|-----------|------|
| Pusher | WebSocket service (free: 100 connections) |
| pusher-js | Frontend SDK (lazy-loaded via dynamic import in `lib/websocket/pusher-client.ts`; `getPusherClient()` returns `Promise<Pusher \| null>`) |
| pusher (npm) | Backend SDK |

## Infrastructure
| Service | Role |
|---------|------|
| Vercel | Deployment + CDN (Hobby free tier) |
| Vercel Blob | Image storage |
| Resend | Transactional email (Magic Link) |

## Testing
| Technology | Role |
|-----------|------|
| Vitest | Unit testing (to be configured in Phase A) |

## State Management
- Jotai is listed as dependency but **not currently used** — Phase E cleanup target
- State managed via React hooks + localStorage + WebSocket

## Performance tooling
- `@next/bundle-analyzer` wired via `next.config.ts` behind `ANALYZE=1`
- Run `pnpm analyze` to rebuild with webpack pipeline and emit `.next/analyze/{client,edge,nodejs}.html`
- `.github/workflows/bundle-analysis.yml` runs it on PR/push and uploads the HTML reports as artifacts
- `.github/workflows/lighthouse.yml` + `.github/lighthouserc.json` run Lighthouse CI against static routes (`/`, `/auth/login`, `/auth/verify`) on PRs with warn-only assertions
- See `docs/refactoring/FRONTEND_PERFORMANCE_OPTIMIZATION.md` for the eager First Load JS baseline per route and optimization history
