# Deploy on Amvera

This project is configured to run on Amvera with `amvera.yml` from the repository root.

## What is already configured

- `amvera.yml` builds the client and server with `npm run build`
- the app starts with `NODE_ENV=production npm run start`
- Amvera persistent storage is mounted at `/data`
- in production, if `APP_BASE_URL` is set, SQLite and uploads default to:
  - `/data/olesha.sqlite`
  - `/data/uploads`

## Recommended database choice

Keep SQLite for the first deploy.

It is enough for the current project shape:

- one application instance
- low to moderate write concurrency
- local file storage for uploaded assets
- simple deployment and backup flow

Move to PostgreSQL later if at least one of these becomes true:

- you need multiple app instances
- writes become highly concurrent
- you need cross-service database access
- you want managed DB observability and stricter operational guarantees

## Required environment variables

Set these in the Amvera project before the first production launch:

- `APP_BASE_URL`
  - public HTTPS URL of the app, for example `https://your-project.amvera.io`
- `SESSION_SECRET`
  - random secret, at least 32 characters
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Optional:

- `FRONTEND_BASE_URL`
  - only set this if frontend will live on a different public origin
- `GOOGLE_CALLBACK_URL`
  - only set this if you want to override the default callback
  - by default it becomes `https://<your-domain>/api/auth/google/callback` from `APP_BASE_URL`
- `ADMIN_USER_ID`
  - Google sub, email, or user id that should have admin access
- `APP_TIMEZONE`
  - defaults to `Europe/Moscow`
- `DAILY_PACK_LIMIT`
  - defaults to `1`
- `UPLOAD_ORPHAN_GRACE_HOURS`
  - how long to keep unreferenced uploaded files before cleanup
  - defaults to `24`
- `ALLOWED_ORIGINS`
  - comma-separated extra origins if you later serve frontend from a different domain
- `DB_FILE`
  - override SQLite path explicitly if needed
- `UPLOADS_DIR`
  - override uploads path explicitly if needed
- `PERSISTENCE_ROOT`
  - override the default persistent root; on Amvera this should normally stay `/data`

## Google OAuth setup

In Google Cloud Console, add the exact callback URL:

- `https://<your-domain>/api/auth/google/callback`

Also add the app origin to authorized JavaScript origins:

- `https://<your-domain>`

## Amvera launch flow

1. Create a new project in Amvera and connect this Git repository.
2. Make sure the project uses the `amvera.yml` from the repo root.
3. Enable the public domain for the app.
4. Fill in the environment variables listed above.
5. Trigger deploy.
6. Verify:
   - `/api/health` returns `ok: true`
   - login via Google works
   - uploads are saved and survive restart
   - pack opening survives redeploy because SQLite lives in `/data`

## Notes

- Do not store SQLite in `./data` on Amvera. That is inside the application artifacts and may be lost on rebuild.
- Do not mount persistence into `/app` or its subdirectories.
- If you later migrate to PostgreSQL, do it as a separate task. The current server code is still SQLite-based.
