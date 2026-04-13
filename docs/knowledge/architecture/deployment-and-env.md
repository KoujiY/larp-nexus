# Deployment & Environment Variables

## Deployment Architecture
```
Users → Vercel (CDN + Edge)
          ├── MongoDB Atlas  (database)
          ├── Pusher         (WebSocket)
          ├── Vercel Blob    (images)
          └── Resend         (email)
```

## Environment Variables

### Required
```bash
# MongoDB
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>

# App URL
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app

# Session
SESSION_SECRET=<min 32 chars, generate with: openssl rand -base64 32>

# Pusher (Backend)
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=ap3

# Pusher (Frontend)
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=ap3

# Resend (Email)
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@your-domain.com

# Vercel Blob
BLOB_READ_WRITE_TOKEN=

# AI Character Import (Encryption key for API credentials)
AI_ENCRYPTION_SECRET=<min 32 chars, generate with: openssl rand -base64 32>
```

### Local Development
Create `.env.local` (never commit to git)

### Production
Set all variables in Vercel Dashboard → Project → Settings → Environment Variables

## Cron Jobs
- `app/api/cron/check-expired-effects/` — checks expired temporary effects and cleans pending events
- Must be configured in `vercel.json` with appropriate schedule

## Full Setup Guide
See `docs/specs/10_EXTERNAL_SETUP_CHECKLIST.md` for step-by-step external service setup.
