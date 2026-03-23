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
| Tailwind CSS 4+ | Utility CSS |
| shadcn/ui | Component library (Radix UI based) |
| Lucide React | Icons |
| Framer Motion 11+ | Animations |

## Real-time
| Technology | Role |
|-----------|------|
| Pusher | WebSocket service (free: 100 connections) |
| pusher-js | Frontend SDK |
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
