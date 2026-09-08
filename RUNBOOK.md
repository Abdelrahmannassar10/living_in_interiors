# RUNBOOK

Operational playbook for the Living In Interior ERP backend. Short, actionable, written for a single on-call person.

## Probes

### `GET /api/v1/health`
Public, no auth. Returns 200 always (so the shape is stable for probes) with a `db` block:

```json
{ "status": "ok", "company": "Living In interiors", "version": "0.0.1", "timestamp": "...", "uptime": 123, "db": { "up": true, "latencyMs": 4, "now": "..." } }
```

- `status: ok` + `db.up: true` → healthy.
- `status: degraded` + `db.up: false` → the app is up but the DB is unreachable; the last error is in `db.error`. Check Postgres first (see Backups/Restores).

## Stock drift reconciliation

`item_stocks.qty_on_hand` is the source of truth at runtime, but corrected numbers and external returns can drift it away from `initial_qty − qty_sold`. Audit once a month (or after any manual stock surgery):

```sql
SELECT i.code,
       s.qty_on_hand,
       i.initial_qty - i.qty_sold AS expected_on_hand
FROM item_stocks s
JOIN items i ON i.id = s.item_id
WHERE s.qty_on_hand != i.initial_qty - i.qty_sold;
```

Non-empty result = drift. Fix via a counted adjustment (Admin/Manager), **not** by editing `qty_on_hand` directly — adjustments record an audit-trail `Transaction` row and fire stock alerts:

```bash
curl -X POST /api/v1/transactions/adjustment \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "itemCode": "SOFA-AURORA", "qty": 2, "reason": "CountCorrection", "fromLocationId": 4 }'
```
`reason` must be one of `NewArrival | Damage | CountCorrection | CustomerReturn | SupplierReturn`.

## Stuck Puppeteer (quotation/delivery PDF)

Symptoms: `POST /reports/quotation/:id/pdf` hangs or the pod's chrome processes accumulate.

- PDF rendering launches a headless Chrome per request (`PUPPETEER_EXECUTABLE_PATH` overrides auto detection). A long OpenType/font pipeline can stall it.
- Fix: restart the app process (drops orphaned chromes); if it recurs, raise `PUPPETEER_EXECUTABLE_PATH` to a pinned Chrome and give the containers a max shm size (docker `--shm-size=2g`).

Verification after restart:

```bash
curl -sI http://localhost:3000/api/v1/health | head -1   # want 200
```

## Expired / blacklisted tokens

- Access tokens are short-lived JWTs. A 401 on any request means the token expired or the user was deactivated — the client should refresh silently.
- If a user is re-signed-out persistently, confirm they are `is_active = true`:

```sql
SELECT username, is_active FROM users WHERE username = 'Admin';
```

- The JWT secrets are `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`. Changing them invalidates every session — coordinate a downtime window (see Deploys).
- Refresh tokens use rotation: the old refresh is consumed on refresh; a replayed/expired refresh returns 401 with a clear message.

## Backups & restores

- Nightly: `pg_dump` of the production database to object storage (keep 14 daily rollups).
- Restore drill: **monthly** — restore the latest dump into a throwaway `restore` DB and boot the API against it, then run the stock-drift query above and hit `/health` (expect `db.up: true`). A backup that was never restored is a hope, not a backup.

Manual restore example:

```bash
pg_restore --clean --if-exists -d living_in_interiors /path/to/dump
```

## Deploys

- CI runs lint → typecheck → unit tests → **`pnpm migration:run`** → seed → build → e2e on every push to `main`.
- Staging deploys take the same artifact as CI (migrations are run by the deploy step before the new code starts).
- Production is a **manual deploy** on a tagged commit, in a conscious downtime window (per G3) — the DB migrations can be destructive, so never auto-migrate prod from CI.

## Load sanity check

`pnpm load:check` seeds a 10× fixture into the current database, boots the app, and asserts the paginated list endpoints stay under 300ms; it exits non-zero if any endpoint is slower. Run it locally before releases and in CI after the golden-path e2e.

## Environment checklist

| Var | Default | Required |
| --- | --- | --- |
| `DB_HOST/DB_PORT/DB_NAME/DB_USERNAME/DB_PASSWORD` | localhost / 5432 / living_in_interiors / postgres / `""` | yes |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — | yes (≤? minimum enforced at boot) |
| `API_PREFIX` | `api/v1` | no |
| `PORT` | 3000 | no |
| `CORS_ALLOW_ALL` / `ALLOWED_ORIGINS` | `false` / empty | no |
| `PUPPETEER_EXECUTABLE_PATH` | auto | only with custom Chrome |
| `SEED_ADMIN_PASSWORD` | random (printed once) | only on first seed |