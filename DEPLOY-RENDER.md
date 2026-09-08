# Deploying to Render — Step by Step

> This guide walks you through hosting the Living In Interior ERP backend on [Render](https://render.com). The backend is a single NestJS process; you need a **Web Service** and a **PostgreSQL** database.

---

## What you need before you start

| Item | Why |
|---|---|
| A Render account (free tier works for testing) | hosting |
| A GitHub repo with the backend code pushed | Render deploys from Git |
| Your `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values ready (≥ 32 chars each) | required by the app |

---

## Step 1 — Create the PostgreSQL database

1. Go to **Render Dashboard → New → PostgreSQL**
2. Settings:
   - **Name:** `living-in-interiors-db`
   - **Database:** `living_in_interiors`
   - **User:** `living_in_interiors` (or leave default)
   - **Region:** choose the same region you'll use for the web service
   - **Plan:** Free tier is fine for dev/staging
3. Click **Create Database**
4. Once it's up, go to the **Info** tab and copy the **Internal Database URL** — it looks like:
   ```
   postgres://living_in_interiors:AbCdEf123456@living-in-interiors-db.render.com:5432/living_in_interiors
   ```
5. You'll also need the individual fields for env vars:
   - **Host:** `living-in-interiors-db.render.com` (the part after `@`)
   - **Port:** `5432`
   - **Database:** `living_in_interiors`
   - **Username:** the user you set
   - **Password:** shown at creation (or reset it)

---

## Step 2 — Create the Web Service

1. Go to **Render Dashboard → New → Web Service**
2. Connect your GitHub repo
3. Settings:

| Field | Value |
|---|---|
| **Name** | `living-in-interiors-api` |
| **Region** | same as the database |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `pnpm install && pnpm migration:run && pnpm build` |
| **Start Command** | `pnpm start:prod` |
| **Plan** | Free tier for testing, Starter ($7/mo) for production |

> `pnpm start:prod` runs `puppeteer browsers install chrome && node dist/src/main.js`.
> On Render free tier the Chrome install adds ~30s to cold starts. If you don't need PDFs yet, you can skip Puppeteer by using `node dist/src/main.js` as the start command instead.

---

## Step 3 — Set environment variables

Go to the **Environment** tab on your web service and add every variable below.
**Never commit these to Git.**

### Required

| Key | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Disables Swagger docs, enables strict mode |
| `PORT` | `10000` | Render assigns a port — the app reads `process.env.PORT` |
| `API_PREFIX` | `api/v1` | default, but set it explicitly |
| `DB_HOST` | `living-in-interiors-db.render.com` | from Step 1 |
| `DB_PORT` | `5432` | |
| `DB_NAME` | `living_in_interiors` | from Step 1 |
| `DB_USERNAME` | (from Step 1) | |
| `DB_PASSWORD` | (from Step 1) | |
| `DB_LOGGING` | `false` | |
| `JWT_ACCESS_SECRET` | (generate a long random string) | ≥ 32 chars, e.g. `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | (generate a different long random string) | ≥ 32 chars |
| `BCRYPT_SALT_ROUNDS` | `12` | default |
| `SEED_ADMIN_PASSWORD` | `Admin1234test` | or any password ≥ 8 chars with letter + digit |

### Optional — email (Resend)

| Key | Value |
|---|---|
| `RESEND_API_KEY` | `re_...` |
| `RESEND_FROM_EMAIL` | `quotations@your-domain.com` |
| `RESEND_FROM_NAME` | `Living In interiors` |
| `DIGEST_RECIPIENT_EMAIL` | `ops@your-domain.com` |

### Optional — Cloudinary (item photos)

| Key | Value |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | your cloud name |
| `CLOUDINARY_API_KEY` | your key |
| `CLOUDINARY_API_SECRET` | your secret |
| `CLOUDINARY_FOLDER` | `living-in-interiors` |

### Optional — CORS (for your desktop app)

| Key | Value | Notes |
|---|---|---|
| `CORS_ALLOW_ALL` | `true` | **Dev only** — allows any origin |
| `ALLOWED_ORIGINS` | `https://your-desktop-app.com` | Comma-separated, production-safe |

> For an Electron app loading from `file://`, set `CORS_ALLOW_ALL=true`.
> For a web-based admin panel, set `ALLOWED_ORIGINS=https://your-admin.vercel.app`.

### Optional — Puppeteer

| Key | Value | Notes |
|---|---|---|
| `PUPPETEER_EXECUTABLE_PATH` | (leave empty) | Render's build step installs Chrome automatically via `puppeteer browsers install chrome` |

---

## Step 4 — Deploy

1. Click **Create Web Service**
2. Render will:
   - Clone your repo
   - Run `pnpm install`
   - Run `pnpm migration:run` (creates all tables)
   - Run `pnpm build` (compiles TypeScript + installs Chrome)
   - Start with `pnpm start:prod`
3. Watch the deploy log. The first deploy takes ~2–3 min (Chrome install + build).
4. Once live, check:
   ```
   https://your-service.onrender.com/api/v1/health
   ```
   You should see:
   ```json
   { "status": "ok", "db": { "up": true, "latencyMs": ... } }
   ```

---

## Step 5 — Seed the admin user (first deploy only)

On the **first deploy**, the database is empty. You need to seed the demo data:

1. Go to your web service → **Shell** tab (or use Render's SSH)
2. Run:
   ```bash
   pnpm seed
   ```
3. It will print the admin password (or use `SEED_ADMIN_PASSWORD` if you set it).
4. The seed creates:
   - Admin user (username: `Admin`)
   - Showroom + Storage 1 locations
   - Demo items (SOFA-AURORA, CHAIR-OSLO, TABLE-ORY)

> After the first seed, you don't need to run it again. Migrations run automatically on every deploy via the build command.

---

## Step 6 — Verify everything works

### Health check
```bash
curl https://your-service.onrender.com/api/v1/health
```

### Login
```bash
curl -X POST https://your-service.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"Admin1234test"}'
```

### Swagger (disabled in production)

Swagger is only available when `NODE_ENV` is NOT `production`. If you want to test the API interactively, temporarily set `NODE_ENV=development` in your env vars, deploy, use the docs at `https://your-service.onrender.com/docs`, then set it back to `production`.

---

## Important notes

### Cold starts

Render free tier spins down the service after inactivity. The first request after idle takes ~30–60s (Chrome install + NestJS boot). Paid plans ($7/mo) keep the service always on.

### Database backups

Render PostgreSQL on the free tier does **not** include automatic backups. For production:
- Upgrade to the paid PostgreSQL plan ($7/mo) which includes daily backups
- Or set up a nightly `pg_dump` cron (see `RUNBOOK.md`)

### Migrations on deploy

The build command includes `pnpm migration:run`. This runs **all pending migrations** before the new code starts. If a migration is destructive, it runs during deploy — this is intentional (see ERP-PLAN-V2.md decision log).

### Single currency

The app is single-currency (USD). All money fields are decimal strings. Don't send bare numbers for money.

### Puppeteer / PDFs

The quotation PDF endpoint uses headless Chrome. On Render, `puppeteer browsers install chrome` runs during build. This adds ~30s to cold starts. If you don't need PDFs yet, you can skip it by changing the start command to `node dist/src/main.js`.

---

## Quick reference — environment variables

```
# === REQUIRED ===
NODE_ENV=production
PORT=10000
DB_HOST=your-db-host.render.com
DB_PORT=5432
DB_NAME=living_in_interiors
DB_USERNAME=your_db_user
DB_PASSWORD=your_db_password
JWT_ACCESS_SECRET=your_random_32plus_char_string_here
JWT_REFRESH_SECRET=another_random_32plus_char_string_here

# === RECOMMENDED ===
SEED_ADMIN_PASSWORD=Admin1234test
DB_LOGGING=false
BCRYPT_SALT_ROUNDS=12

# === OPTIONAL — CORS ===
CORS_ALLOW_ALL=false
ALLOWED_ORIGINS=https://your-app.com

# === OPTIONAL — Email (Resend) ===
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=quotations@your-domain.com
RESEND_FROM_NAME=Living In interiors
DIGEST_RECIPIENT_EMAIL=ops@your-domain.com

# === OPTIONAL — Photos (Cloudinary) ===
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_FOLDER=living-in-interiors
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `JWT_ACCESS_SECRET is not defined` | You forgot to set the env var in Render |
| `ECONNREFUSED 127.0.0.1:5432` | `DB_HOST` must be the Render database hostname, not `localhost` |
| `password authentication failed` | Wrong `DB_USERNAME` or `DB_PASSWORD` — check the database Info tab |
| Deploy succeeds but `/health` shows `db.up: false` | Database is on a different region than the web service — move them to the same region |
| Swagger not visible at `/docs` | Expected — Swagger is disabled when `NODE_ENV=production` |
| CORS error from desktop app | Set `ALLOWED_ORIGINS` to your app's origin, or `CORS_ALLOW_ALL=true` for dev |
| Cold start takes 60+ seconds | Normal on free tier (Chrome install). Upgrade to Starter plan or skip Puppeteer |
| `pnpm: command not found` in shell | Render should auto-detect pnpm from `package.json`. If not, add `npm i -g pnpm` to the build command |
| Migration fails on deploy | Check deploy logs — usually a missing env var (DB_*) or the database doesn't exist yet |
