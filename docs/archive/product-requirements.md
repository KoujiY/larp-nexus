# Product Requirements (Archived)

> Original: `docs/requirements/LARP_NEXUS_PRD.md` — MVP phase, superseded by current implementation.

## Core Purpose
LARP management system for GMs and players. GM creates games and characters; players access character cards without login via PIN/Game Code.

## User Roles
- **GM**: Create/manage games and character cards, push real-time events
- **Player**: View character card via URL, unlock with PIN, receive real-time updates

## Key Decisions Made at MVP
- No player login required — URL-based access
- PIN lock for character cards (hashed storage)
- WebSocket for real-time updates (Pusher)
- MongoDB Atlas + Vercel deployment
- Mobile-first for player side, desktop-first for GM side

## Original Tech Stack Intentions
- Jotai for state management (partially adopted)
- Vercel Blob for image storage
- Magic Link / OTP for GM auth
