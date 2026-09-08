# Living In Interiors ERP — Rethought Plan (v2)

> **Document status:** v2.0 — 2026-09-07. **Supersedes `ERP-MASTER-PLAN.md` (v1.0) as the working plan.**
> v1 remains valuable as the full code audit + appendices (bugs list, RBAC matrix, endpoint inventory) — this doc references it instead of repeating it.
>
> **Why a rethink:** implementation already started after v1 was written. Roughly half of Phase 0/1 is done, some v1 decisions turned out heavier than a solo-dev project needs, and the working tree holds ~1,000 lines of uncommitted changes. This doc re-baselines the plan on what actually exists, cuts what isn't worth its cost, and re-sequences the rest.

---

## Table of Contents

1. [Where We Actually Are (verified)](#1-where-we-actually-are-verified)
2. [The Rethink — What Changed vs v1 and Why](#2-the-rethink--what-changed-vs-v1-and-why)
3. [Immediate Risk Gate (do before anything else)](#3-immediate-risk-gate)
4. [Re-planned Roadmap](#4-re-planned-roadmap)
5. [Simplified Domain Model (delta from v1)](#5-simplified-domain-model-delta-from-v1)
6. [Module Specs for Remaining Work](#6-module-specs-for-remaining-work)
7. [Testing — Pragmatic Version](#7-testing--pragmatic-version)
8. [Decision Log](#8-decision-log)
9. [What Was NOT Rethought](#9-what-was-not-rethought)

---

## 1. Where We Actually Are (verified)

Every item below was verified against the working tree on 2026-09-07 — not assumed from v1.

### 1.1 Done (shipped in working tree, uncommitted)

| Area | Evidence |
|------|----------|
| Global `ClassSerializerInterceptor`, helmet, `trust proxy` | `src/main.ts:18,35` |
| RBAC: `RolesGuard` + `@Roles()` on routes | `src/common/guards/roles.guard.ts`, `src/common/decorators/roles.decorator.ts`, applied across controllers |
| `POST /auth/refresh` | `src/auth/auth.controller.ts:16` |
| Pure stock engine + unit tests | `src/transactions/stock-engine.ts`, `stock-engine.spec.ts` |
| **Stock model migration (v1's M1+M2 in one):** `item_stocks` table, backfill by location *name* (not ID — good), jsonb `stock_before/after`, dropped the 8 snapshot columns + 3 item qty columns, adjustment-reason enum, FK/date indexes. Has `down()`. | `src/database/migrations/1725700000000-StockModelRefactor.ts` |
| `InventoryService` rewritten on `item_stocks` | `src/transactions/inventory.service.ts` |
| Race-free document numbering | `src/common/services/numbering.service.ts`, `number-sequence.entity.ts`, used by quotations |
| Quotation money math extracted to pure module + tests | `src/quotations/totals.ts`, `totals.spec.ts` |
| Quotation revisions written after leaving Draft | `src/quotations/quotations.service.ts:94-105` |
| Quotation line edit endpoint | `src/quotation-details/dto/update-detail.dto.ts` + controller |
| Double-email loop killed (email decoupled from status transition) | `sendQuotationEmail` now called only from `notifications.controller.ts:11` |
| Photos: add / delete / set-primary wired to Cloudinary | `src/items/items.controller.ts:21-32` |
| Clients module: CRUD + history + role guards | `src/clients/` |
| Low-stock is SQL-aggregated (no more 100-row cap) | `src/items/items.service.ts:68` |
| Stock alerts actually triggered after transactions | `src/transactions/transactions.service.ts:15,25` |
| Audit log written via global interceptor | `src/audit-log/audit.interceptor.ts`, registered `APP_INTERCEPTOR` in `audit-log.module.ts:11` |
| WebSocket gateway JWT-authenticated | `src/gateway/app.gateway.ts:20-22` |
| Transaction search/pagination DTO | `src/transactions/dto/search-transaction.dto.ts` |

### 1.2 Not started (from v1's roadmap)

Sales orders / reservations / deliveries · Suppliers API (entity only) · Purchase orders · Invoices/payments · Settings module · Notifications inbox table · Quotation expiry scheduler · Swagger annotations (dependency installed, unused) · Any integration/e2e/CI testing · Redis & BullMQ (still zero usage — `ioredis` installed but dead).

### 1.3 Gaps & risks found during this review (not in v1)

| # | Finding | Severity |
|---|---------|----------|
| G1 | **~1,000 lines of uncommitted work across 47 modified + ~25 new files.** One bad `git checkout` loses the entire stock refactor. | 🔴 Critical |
| G2 | **Seeds do not populate `item_stocks`** — `run-seeds.ts` was modified but has no `ItemStock` references. A fresh dev/staging DB gets zero stock and nothing works. The migration backfills only *existing* data. | 🔴 Critical |
| G3 | The stock migration drops the old qty columns **and** runs in the same release as the code switch. If code and DB ever deploy out of sync, the app is down. Acceptable for a downtime-window deploy, but it must be a *conscious* deploy. | 🟡 High |
| G4 | `NumberingService` is used for quotations only; no scope rows seeded for future `SO/PO/INV` scopes. | 🟢 Low |
| G5 | Only two spec files exist (pure-logic). Nothing protects the stock engine's DB integration (locking, deadlock order) — the exact area the migration just rewrote. | 🟡 High |

---

## 2. The Rethink — What Changed vs v1 and Why

v1 was written as if nothing had been built yet. It also assumed infrastructure appetite (Redis, BullMQ, queues, idempotency keys, multi-currency, coverage gates) that doesn't match a solo-developer, single-showroom reality. Rethought decisions:

### 2.1 Cut from the plan (deferred, not deleted)

| v1 item | Decision | Rationale |
|---------|----------|-----------|
| **Redis + BullMQ** (queues for email/PDF, cache, rate-limit store) | **Cut until there's a real trigger** (multi-instance deploy, email volume pain, >1s dashboard). Use `@nestjs/schedule` for cron + in-process `EventEmitter` for reactions. | A second stateful service to deploy/monitor/restore buys nothing at current scale. It was v1's biggest infrastructure bet; the codebase runs fine without it. |
| **Multi-currency** (rates at invoice date, base-currency normalization) | **Cut to single currency.** Keep `numeric` money columns; add a `currency` column when the first foreign invoice actually happens. | The business invoices in one currency today. Currency machinery is pure overhead until then. |
| **Idempotency-Key header machinery** | **Deferred.** Unique document numbers + "one active order per quotation" constraint prevent the real duplicates. Revisit only if double-submits are observed in practice. | Building Redis-backed replay infra to solve a problem the DB already solves. |
| **Client/Transit virtual locations tracking delivered goods** | **Deferred.** Delivery note marks handover; stock leaves the ledger at delivery. Keep the `Client`/`Transit` enum values in the entity (already there) for later. | Nice traceability, but it doubles the stock-invariant surface for marginal value in v1. |
| **Configurable reservation strategy setting** | **Cut to one fixed strategy** (showroom-first, then storage by ID). | One user, one showroom. A setting with one meaningful value is dead code (v1's own P4). |
| **80% coverage gates + testcontainers** | **Replaced** with: pure-logic unit tests (pattern already established and good) + one golden-path e2e + two concurrency tests. No coverage metric. | The critical logic (stock engine, totals, state machines) is already pure and tested. Coverage % on CRUD glue measures nothing. |
| **Prometheus metrics, pino, full CI/CD pipeline** | **Reduced** to: GitHub Actions running lint + typecheck + unit + build; structured logging stays as-is; health check stays. | Solo dev + one deploy target. Revisit when there's a second environment worth promoting to. |
| **Full Swagger annotation of every endpoint** | **Reduced to** annotating *new* modules (sales-orders, POs, invoices) as they're built; retrofit old ones opportunistically. | Dependency is installed; annotating as-you-build is free, retrofitting 60 endpoints is a week of churn. |

### 2.2 Re-sequenced

1. **Consolidation gate before new features.** v1 jumped from "hardening" straight into more features. The half-finished state (G1–G5) is the biggest risk in the repo. Everything pauses until the stock refactor is committed, seeded, and smoke-tested.
2. **Suppliers API moves earlier** (with sales orders, not with purchasing). Quotations and future orders reference parties; POs need suppliers too, but suppliers CRUD is a half-day task that unblocks both.
3. **Finance-lite simplified**: invoices + payments + AR aging stay (that's the money the business is owed); margin/valuation reporting becomes *one* stock-valuation query + sales report, not a reports suite.

### 2.3 Kept as-is (v1 was right)

- Modular monolith, TypeORM with migrations-only, `EventEmitter`-style decoupling, append-only transaction ledger.
- The order of the business cycle: **sales orders → purchasing → finance**.
- All v1 security items — and they're largely already done (§1.1).
- The audit trail via interceptor, WS auth, photos on Cloudinary.

---

## 3. Immediate Risk Gate (do before anything else)

> **Nothing else in this plan starts until this section is done.** Estimated: half a day.

- [ ] **Commit the working tree** (G1). Suggested logical commits, in order:
  1. `security: serializer, RBAC guard, refresh endpoint, password policy, CORS/proxy`
  2. `stock: item_stocks model, migration, pure stock engine + tests, inventory rewrite`
  3. `quotations: totals module, revisions, line edit, numbering, email decoupling`
  4. `feat: clients module, photo endpoints, audit interceptor, gateway auth, alerts wiring`
  5. `chore: DTO/dto cleanups, seeds, env example`
- [ ] **Fix seeds to create `item_stocks` rows** (G2): `run-seeds.ts` must insert stock per location for seeded items (e.g. Showroom gets most, Storage 1 the rest), so a fresh DB is actually usable.
- [ ] **Run the migration on a copy of real data and verify the reconciliation**: `SUM(qty_on_hand) FROM item_stocks` per item must equal the old `qty_showroom + qty_storage1 + qty_storage2`. Do this once on staging/prod-copy before the real deploy.
- [ ] **Smoke the five core flows** against a fresh seeded DB: login → create item w/ photo → initial stock (Adjustment/NewArrival) → transfer → sell → low-stock appears.
- [ ] **Seed `number_sequences` scopes** for `quotation:<year>` (continuity with existing quote numbers) and pre-create empty rows for `sales-order:`, `purchase-order:`, `invoice:`, `delivery:` scopes (G4).

**Exit criteria:** work is committed, fresh-database bootstrap works end-to-end, reconciliation on real data is clean.

---

## 4. Re-planned Roadmap

> Durations are honest solo-dev estimates including tests. Each phase ends with a commit + a working demo of its exit criteria.

### Phase 2A — Consolidation & Contract (≈ 3–4 days)

**Goal:** freeze the current API as v1-consumable, protect the rewritten stock core.

- [ ] Risk Gate (§3) complete
- [ ] **Golden-path e2e** (supertest against dev DB): login → item → stock-in → transfer → sale → quotation create/edit/send. This is the regression net for everything below.
- [ ] **Concurrency tests (2, not a suite):** parallel sales of the last unit (no oversell); parallel quotation creates (no duplicate numbers).
- [ ] GitHub Actions: lint + typecheck + unit tests + build on PR (no deploy yet).
- [ ] Docker-compose file for `postgres` (+ nothing else — see §2.1) so setup is one command.
- [ ] Pagination audit: `GET /quotations` and `GET /audit-log` list endpoints paginated (transactions already done).
- [ ] Retrofit `@Roles()` spot-check: script hits every mutating route as Staff → expect 403 where the matrix says so (v1 Appendix B, subset).
- [ ] Annotate existing quotation + transaction endpoints in Swagger (get the habit started; ~1h).

**Exit criteria:** CI green; e2e + concurrency tests green; fresh-clone-to-running-app is `docker compose up` + `migrate` + `seed`.

### Phase 2B — Suppliers + Sales Orders (≈ 2 weeks) 💰

**Goal:** the heart of the ERP: an approved quote becomes an order that reserves stock, and stock never lies.

- [ ] **Suppliers module** (CRUD + soft-deactivate; keep 1:1 `brand_id` for now — the many-to-many join table is deferred until a supplier actually carries multiple brands).
- [ ] `sales_orders` + `sales_order_lines` (snapshot pricing like quotation lines) + `reservations`.
- [ ] **Simplified state machine:** `Draft → Confirmed → Delivered → Closed`, plus `Cancelled` (releases reservations). No `Partially Reserved`/`Picking` states — record shortages as a per-line `shortage` flag on confirmation instead.
- [ ] `POST /sales-orders/from-quotation/:id` — only from `Approved` quotes; one active order per quotation (DB constraint); copies lines.
- [ ] **Reservations:** on `Confirmed`, in one transaction: lock `item_stocks` rows (ordered by ID), increment `qty_reserved` per line (showroom-first, fixed strategy). Insufficient stock → allowed, shortage flagged per line (business decides: wait or partial).
- [ ] **Sale ↔ order linkage:** recording a Sale with `salesOrderId` decrements `qty_on_hand` **and** `qty_reserved` atomically (new branch in the pure stock engine + unit test).
- [ ] **Delivery:** `POST /sales-orders/:id/deliveries` creates a delivery record + PDF (reuse Puppeteer); marks the order `Delivered` when fully delivered. No virtual-location tracking (deferred, §2.1).
- [ ] Numbering: `SO-<YY>-<seq>` via existing `NumberingService`.
- [ ] Quotation gets status `Converted` when its order is confirmed.
- [ ] Extend the golden-path e2e: quote → approve → order → reserve → deliver → sale. Plus a return-against-order test.
- [ ] Swagger annotations as built.

**Exit criteria:** e2e green; concurrent double-convert of one quotation impossible (constraint test); reserved stock visible in `GET /items/:code/stock` and subtracted from availability everywhere.

### Phase 2C — Alerts, Notifications & Expiry polish (≈ 3–4 days)

**Goal:** make the alerting/notifications layer genuinely useful, no queue infrastructure.

- [ ] Alert **deduplication**: don't re-alert an item already below threshold (use `stock_alert_configs.last_alerted_at` + quiet period from a constant, not a settings module).
- [ ] **Quotation expiry** via `@nestjs/schedule` daily cron: `Sent` + `valid_until < today` → `Expired`.
- [ ] **Notifications inbox:** `notifications` table (userId, type, payload jsonb, read_at), `GET /notifications`, `PATCH /notifications/:id/read`; WS event on create. Email stays direct-send with try/catch + logged failure (no retry queue — accept the risk, Resend is reliable enough at this volume).
- [ ] Daily low-stock **digest email** via the same scheduler (one email, all below-threshold items) — replaces per-event email spam.
- [ ] Remove dead weight: `ioredis` dependency + `REDIS_*`/`MAIL_*` env vars + `DB_SYNCHRONIZE` if unused (v1 Appendix D hygiene).

**Exit criteria:** a sale dropping an item below threshold produces exactly one WS + inbox alert and next-morning digest entry; expired quotes flip automatically.

### Phase 3 — Purchasing (≈ 1.5 weeks) 📦

**Goal:** know what to buy, from whom; receive it correctly into any location.

- [ ] `purchase_orders` + lines (supplier, expected date, status, **single currency**) + numbering `PO-<YY>-<seq>`.
- [ ] State machine: `Draft → Sent → Partially Received → Received → Closed` (+ `Cancelled`).
- [ ] `goods_receipts`: partial receipts; over-receipt blocked; receipt creates an `Adjustment/Increase` transaction with `purchase_order_id` + reason `NewArrival` (enum already exists — the v1 "magic string" bug stays dead).
- [ ] Returns to supplier: `Adjustment/Decrease` + reason `SupplierReturn` + PO reference.
- [ ] `supplier_price_lists` (item, supplier, cost, effective date) — populated on receipt if absent.
- [ ] Suggested-PO report: SQL join of below-threshold availability × latest supplier price → response only; one-click draft PO creation from it.
- [ ] Extend e2e: PO → partial receipt ×2 → stock correct → PO `Received`.

**Exit criteria:** multi-receipt PO e2e green; receiving into a *new* (4th) location works with zero special-casing — the payoff of the Phase 1 stock refactor.

### Phase 4 — Finance-lite (≈ 1.5 weeks) 📊

**Goal:** know what you're owed; basic margin visibility. Single currency.

- [ ] `invoices` + lines (from a `Delivered`/`Closed` sales order, or manual) + numbering `INV-<YY>-<seq>`; credit note = negative invoice.
- [ ] `payments` with FIFO allocation against open invoices; invoice balance = total − allocated.
- [ ] **AR aging report** (0–30/31–60/61–90/90+) — one SQL query + CSV export endpoint.
- [ ] **Stock valuation report** (qty_on_hand × latest known cost by location) — v1's full reports suite trimmed to the two that answer real questions; add more only when asked for.
- [ ] Margin on sales order: revenue vs (sum of item cost at sale time, from supplier price list / last receipt) shown on the order detail — no `item_costs` weighted-average table yet (defer; it only matters at volume).
- [ ] Extend e2e: order → invoice → partial payment → aging reflects balance.

**Exit criteria:** aging matches hand-calculated fixture; invoice + payment flows green in e2e.

### Phase 5 — Industrialize (≈ 1 week, then ongoing) 🚀

- [x] Staging deploy + migration-run step in CI; prod deploy is manual tag (conscious downtime-window deploys per G3). *(migration-run step ships in CI; staging/prod deploy targets pending infra)*
- [ ] Nightly `pg_dump` + monthly **restore drill** (the backup that's never been restored is a hope, not a backup). *(runbook documents procedure; cron + object storage pending infra)*
- [x] Simple runbook doc: stock drift reconciliation query, stuck Puppeteer, expired-token handling. *(see `RUNBOOK.md`)*
- [x] `GET /health` extended with a DB ping.
- [x] Load sanity check: seed 10× fixture, confirm the paginated list endpoints stay <300ms. *(`pnpm load:check`, wired into CI)*
- [ ] Frontend work starts against the frozen API (separate plan/repo).

---

## 5. Simplified Domain Model (delta from v1)

Only what changes vs v1 §5:

```
sales_orders        order_no, client_id, quotation_id (UNIQUE where not null),
                    status enum(Draft|Confirmed|Delivered|Closed|Cancelled),
                    shortage flag per line instead of Partially-Reserved state
reservations        item_id, location_id, qty, sales_order_id  (released on Cancel/Delivery)
deliveries          sales_order_id, delivery_no, delivered_at, notes, pdf_path
purchase_orders     + lines + goods_receipts  (single currency, no exchange-rate columns)
invoices, payments  single currency; payments.allocated fields for FIFO
notifications       user_id, type, payload jsonb, read_at
-- dropped from v1: item_costs (deferred), supplier_brands join (deferred),
-- currency/exchange-rate columns (deferred), settings table (replaced by constants
-- + per-item stock_alert_configs until a second real setting appears)
```

Everything else (item_stocks, number_sequences, jsonb transaction snapshots, revision snapshots) is **already shipped** — see §1.1.

---

## 6. Module Specs for Remaining Work

Condensed — full patterns (locking order, transactional boundaries, events) follow the conventions already established in `stock-engine.ts` + `inventory.service.ts`. New business rules only:

### 6.1 Sales Orders (Phase 2B)
- One active order per quotation — partial unique index `WHERE quotation_id IS NOT NULL AND status NOT IN ('Cancelled')`.
- Reservation runs inside the same transaction as `Confirmed`; `item_stocks` rows locked **ordered by ID** (deadlock rule already used by `InventoryService`).
- Sale without `salesOrderId` stays legal (walk-in counter sale) — the engine branch is optional, not mandatory linkage.
- Cancelling releases reservations exactly; delivery of a line cannot exceed reserved+on-hand (engine invariant).
- Events emitted: `order.confirmed`, `order.delivered`, `order.cancelled` — audit interceptor picks mutations up automatically; gateway forwards events.

### 6.2 Deliveries (Phase 2B)
- Delivery PDF reuses the quotation-PDF Puppeteer setup; stored path on the delivery row.
- Fully-delivered check = every line's delivered qty ≥ ordered qty → auto-`Closed`.

### 6.3 Purchase Orders (Phase 3)
- Receipt quantity validated against remaining PO line qty (no over-receipt in v1).
- Receipt + stock increase + price-list upsert in **one transaction** (same pattern as sale).
- PO status derived from receipts (Partially Received / Received), never hand-set.

### 6.4 Invoices & Payments (Phase 4)
- Invoice created only from `Delivered` or `Closed` orders (or manual, Admin/Manager).
- Payment allocation: oldest open invoice first within the same client; overpayment → 422.
- Invoice totals are **frozen at creation** (they're the legal document); order edits after invoicing are blocked.

### 6.5 Notifications (Phase 2C)
- All in-app notifications created through `NotificationsService.create()` which also emits the WS event — single chokepoint, no scattered emits.

---

## 7. Testing — Pragmatic Version

| Level | What | Count |
|-------|------|-------|
| Pure unit (exists, keep extending) | stock engine moves, totals/cents, state-machine transitions, numbering allocation | every new rule function |
| Golden-path e2e | login → item → stock-in → transfer → sale → quote → approve → order → reserve → deliver → invoice → payment | 1, extended per phase |
| Concurrency | parallel last-unit sale; parallel quotation create; parallel order-confirm of same quote | 3 |
| Regression | any bug found in the wild gets a test before the fix | ongoing |
| RBAC spot-check | script: every mutating route × Staff role → expect 403 | 1 script |

No coverage gates, no testcontainers (e2e runs against the docker-compose dev DB). CI = lint + typecheck + unit + e2e (e2e behind a service container in Actions).

---

## 8. Decision Log

| # | Decision | Replaces (v1) | Reason |
|---|----------|---------------|--------|
| D1 | No Redis/BullMQ; `@nestjs/schedule` + in-process events | v1 §4.3, §10 | Second stateful service not justified at this scale; upgrade path open |
| D2 | Single currency | v1 §6.8 | No foreign invoices exist |
| D3 | No idempotency-key infra | v1 §8 | DB constraints cover the real duplicate cases |
| D4 | Order states: Draft/Confirmed/Delivered/Closed/Cancelled + per-line shortage | v1 §6.6 seven-state machine | Showroom doesn't have a picking warehouse flow; shortage flag carries the same information |
| D5 | No Client/Transit location stock tracking in v1 | v1 §5.1, §6.6 | Invariant surface halved; enum values kept for later |
| D6 | Fixed reservation strategy (showroom-first) | v1 §6.6 configurable setting | One showroom; P4 — dead code is a bug |
| D7 | No settings table yet; constants + existing `stock_alert_configs` | v1 §5.3 | Second real setting triggers extraction |
| D8 | Two reports (AR aging, stock valuation) + order margin | v1 §6.11 suite | Report suites grow on demand, not speculatively |
| D9 | e2e + 3 concurrency tests instead of coverage gates | v1 §9 | Measures what matters; the pure-logic core already has the habit |
| D10 | Suppliers earlier (with sales orders) | v1 §3 | Unblocks orders + POs; half-day task |
| D11 | Keep 1:1 supplier↔brand | v1 §6.4 many-to-many | No real supplier carries multiple brands yet |
| D12 | Email: direct send + logged failure; digest cron | v1 queue-with-retry | Resend reliability acceptable; retry queue returns with Redis if ever needed |

---

## 9. What Was NOT Rethought

Carried over from v1 unchanged — still correct, still authoritative:

- **v1 §2** (full audit) and **Appendix A** (bug list — Critical/High all closed per §1.1 of this doc; Medium items closed alongside their phases).
- **v1 Appendix B** (RBAC matrix — the spot-check script in Phase 2A enforces the Staff column; other columns verified by role during module work).
- **v1 §12** migration discipline rules (backfill + reconciliation + `down()` — and the shipped stock migration already followed them).
- **v1 §3.3 non-goals** (no GL, no HR, no manufacturing, no multi-tenant) — the rethink cuts *more*, never adds.

---

*Next concrete action: Risk Gate §3, item 1 — commit the working tree in the five logical chunks.*
