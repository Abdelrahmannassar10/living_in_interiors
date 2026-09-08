# Living In Interiors — Complete ERP System Master Plan

> **Document status:** v1.0 — 2026-09-07
> **Scope:** Full evolution of the existing NestJS backend (`luxury-furniture-backend`) into a complete, production-grade ERP for a luxury furniture showroom business.
> **Based on:** Full code audit of the current codebase (every file in `src/` reviewed; findings referenced by file throughout).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Audit](#2-current-state-audit)
3. [Vision, Scope & Non-Goals](#3-vision-scope--non-goals)
4. [Architecture & Guiding Principles](#4-architecture--guiding-principles)
5. [Target Domain Model](#5-target-domain-model)
6. [Module Specifications](#6-module-specifications)
7. [Security Plan](#7-security-plan)
8. [API Standards](#8-api-standards)
9. [Testing Strategy](#9-testing-strategy)
10. [Performance & Scalability](#10-performance--scalability)
11. [Observability & Operations](#11-observability--operations)
12. [Data Migration Strategy](#12-data-migration-strategy)
13. [Phased Roadmap](#13-phased-roadmap)
14. [Risk Register](#14-risk-register)
15. [Acceptance Criteria & Definition of Done](#15-acceptance-criteria--definition-of-done)
16. [Appendix A — Known Bugs & Dead Code (with file references)](#16-appendix-a--known-bugs--dead-code)
17. [Appendix B — RBAC Permission Matrix](#17-appendix-b--rbac-permission-matrix)
18. [Appendix C — Endpoint Inventory (current vs. planned)](#18-appendix-c--endpoint-inventory)
19. [Appendix D — Environment & Configuration](#19-appendix-d--environment--configuration)

---

## 1. Executive Summary

The existing backend is a **solid inventory-and-quotation core** with above-average engineering discipline: pessimistic-locking stock transactions with before/after snapshots, quotation line snapshots, DTO validation, Joi-validated config, migrations + seeds, and a clean module structure.

It is **not yet an ERP**. To become one it must pass through four gates:

| Gate | Why it matters | Status |
|------|----------------|--------|
| **Secure** | Password hashes currently leak in API responses; no role checks exist | ❌ Blocked |
| **Scalable data model** | Stock is hard-coded to 3 location columns — new locations can never hold stock | ❌ Blocked |
| **Complete business cycle** | Quote → Order → Reservation → Delivery → Sale → Return → Invoice is disconnected today (quotes and stock never meet) | ❌ Missing |
| **Observable & auditable** | Audit log, websocket alerts, stock alerts are all dead code | ❌ Dead code |

The plan below is organized as **6 phases**: harden what exists (Phase 0), fix the data model before data accumulates (Phase 1), complete the sales cycle (Phase 2), add purchasing (Phase 3), add finance-lite and reporting (Phase 4), and industrialize (Phase 5). Every phase has entry/exit criteria, task checklists, and acceptance tests.

**Rough effort** (solo developer): Phase 0 ≈ 1 week · Phase 1 ≈ 2–3 weeks · Phase 2 ≈ 3–4 weeks · Phase 3 ≈ 2–3 weeks · Phase 4 ≈ 3 weeks · Phase 5 ≈ ongoing.

---

## 2. Current State Audit

### 2.1 What exists today (verified by reading all of `src/`)

| Area | State | Notes |
|------|-------|-------|
| **Auth** | ✅ Working | JWT access (15m) + refresh (7d) issued, local strategy login, bcrypt(12) |
| **Users** | ⚠️ Partial | CRUD works; no RBAC enforcement; password hash leaks in responses |
| **Items / catalog** | ✅ Working | Search, pagination, soft-delete, brands relation, photos relation (photos never populated) |
| **Stock transactions** | ✅ Working | Transfer/Sale/Return/Adjustment with pessimistic lock + snapshots — the strongest part of the codebase |
| **Locations** | ⚠️ Partial | CRUD exists but stock only works for seeded IDs 1/2/3 |
| **Quotations** | ⚠️ Partial | Lifecycle state machine, totals, PDF (Puppeteer), email (Resend); VAT/discount can't be saved (validator bug); revisions never written |
| **Quotation lines** | ⚠️ Partial | Add + soft-delete only; delete ignores quotation status; no edit |
| **Clients / Suppliers** | ❌ Entities only | No module/controller/service — no API to create clients |
| **Audit log** | ❌ Dead code | Service never called; table always empty |
| **Stock alerts** | ❌ Dead code | `checkAndAlert()` never called; only stamps a timestamp |
| **WebSockets** | ❌ Dead code | 5 emit methods, zero callers; unauthenticated |
| **Photo uploads** | ❌ Dead code | `UploadsService` (Cloudinary) exists, no endpoint uses it |
| **Dashboard** | ✅ Basic | Counts + inventory value; loads whole item table in memory |
| **Reports** | ✅ Basic | Quotation PDF only |
| **Redis** | ❌ Unused | Dependency + env vars, never imported |
| **Tests** | ❌ 1 spec | "Hello World" only; zero coverage of stock math / totals / state machine |

### 2.2 Top issues by severity (full list in Appendix A)

**Critical (security / data correctness)**
- C1. `User.password` + `refreshToken` hashes serialized into responses — no `ClassSerializerInterceptor` registered (`main.ts:34`, `user.entity.ts`).
- C2. No role enforcement anywhere — any user can escalate to Admin via `PATCH /users/:id`.
- C3. Stock hard-coded to location IDs 1/2/3 (`inventory.service.ts:44-45`, `items.service.ts:53-55`).
- C4. `vatPercent` / `discountGlobal` / `discountPercent` can never be saved — `@Min/@Max` on string DTO fields always fail (verified against installed class-validator).

**High**
- H1. Double email on send (circular `sendQuotationEmail` ↔ `updateStatus`, `notifications.service.ts:51`).
- H2. `GET /items/low-stock` silently caps at first 100 items (`items.controller.ts:11`).
- H3. `changePassword` no-op ternary allows targeting any user (`users.controller.ts:17`).
- H4. Refresh token issued + stored but no `POST /auth/refresh` route exists.
- H5. Seeded admin `Admin/123456` + `MinLength(6)` password policy.
- H6. Quotation lines deletable from Sent/Approved quotes (`quotation-details.service.ts:14`).

---

## 3. Vision, Scope & Non-Goals

### 3.1 Vision

One system that runs the **entire commercial cycle** of a luxury furniture showroom:

> Supplier price lists → Purchase orders → Receiving into warehouses →
> Transfers to showroom → Client quotations (with photos, revisions, PDF) →
> Approvals → Sales orders with **stock reservation** → Delivery/instalment →
> Invoices & payments → Returns → Returns to supplier →
> Realtime stock visibility, low-stock alerts, audit trail, and management reporting.

### 3.2 In scope (this plan)

- Inventory & warehouse management (multi-location, unlimited locations)
- Catalog management (items, brands, categories, photos)
- CRM-lite (clients with history: quotes, orders, invoices)
- Quotation lifecycle (draft → revisions → sent → approved/rejected → converted)
- Sales orders, reservations, fulfilment, delivery notes
- Purchasing (POs, receiving, supplier price lists)
- Finance-lite (invoices, payments, AR aging, cost & margin) — **not** general ledger
- Reporting & dashboards
- Audit trail, realtime events, notifications (email + in-app)
- RBAC, settings, multi-currency (USD / EGP / EUR)

### 3.3 Explicit non-goals (keep scope sane)

- Full double-entry accounting / GL / tax filing — integrate with external accounting later
- Payroll / HR
- Manufacturing / BOM (furniture is bought, not made — revisit only if a workshop is added)
- Multi-tenant SaaS — single company, but the modular design must not block it later
- Native mobile apps — responsive web frontend consumes the same API

---

## 4. Architecture & Guiding Principles

### 4.1 Style: modular monolith

One NestJS deployable, one PostgreSQL database. Modules own their tables and communicate through exported services + in-process events. No microservices until a real scaling need appears (they would multiply operational cost for zero benefit at this size).

**Rules:**
1. A module's tables are only written by that module's services (no cross-module repositories).
2. Cross-module reactions use `EventEmitter2` events (e.g. `transaction.created` → alerts module listens, audit module listens, gateway listens).
3. Every state-changing service method that touches stock or money runs inside `DataSource.transaction()` with pessimistic locking (pattern already proven in `transactions.service.ts`).
4. The transaction ledger is **append-only**. Corrections are new reversing transactions, never edits/deletes.

### 4.2 Principles (each maps to a defect found in the audit)

| # | Principle | Defect it prevents |
|---|-----------|--------------------|
| P1 | **Secure by default** — serializer on, RBAC on every route, CORS restricted, secrets ≥32 chars | C1, C2, H3, H5 |
| P2 | **No magic identifiers** — nothing semantically depends on row IDs or exact strings | C3, "New Arrival" magic string |
| P3 | **Data model before features** — change schema first, migrate data, then build on it | C3 |
| P4 | **Dead code is a bug** — every module either works end-to-end or is deleted | audit/gateway/alerts/uploads dead code |
| P5 | **Money and stock are computed exactly** — integers/cents or decimal columns, never float math | `computeTotals` float math |
| P6 | **Every mutation is auditable** — audit log written in the same DB transaction as the change | empty audit table |
| P7 | **Filter and aggregate in SQL, not in JS** | low-stock bug, dashboard memory scans |
| P8 | **Business logic is tested** — stock math, totals, state machines have unit/integration tests | 1 "Hello World" spec |
| P9 | **Validate at the edge, enforce in the core** — DTOs validate shape; services re-check invariants (ownership, existence, status) | brandId 500s, delete-line status hole |

### 4.3 Technology decisions

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Framework | NestJS 10 (existing) | — |
| DB | PostgreSQL (existing) | enum, jsonb, transactions, `FOR UPDATE` |
| ORM | TypeORM (existing) | keep; discipline: migrations only, `synchronize: false` |
| Cache / queue | Redis + BullMQ | finally *use* the Redis dependency: queues for PDF/email, cache for dashboards |
| Files | Cloudinary (existing) | wire the dead `UploadsService` into real endpoints |
| Email | Resend (existing) | templates via Handlebars, sent through queue |
| PDF | Puppeteer (existing) | move generation into a worker process/queue |
| Realtime | Socket.IO (existing) | JWT-authenticated handshake, rooms per role |
| Validation | class-validator + class-transformer | fix string/number typing bugs with `@Type(() => Number)` |
| API docs | Swagger | annotate all endpoints (currently bare) |

---

## 5. Target Domain Model

### 5.1 Core change: stock per location

Replace the hard-coded columns `qty_showroom`, `qty_storage1`, `qty_storage2` (and the ID 1/2/3 mapping) with a proper stock ledger:

```
item_stocks
  item_id        FK items
  location_id    FK locations
  qty_on_hand    integer          -- physically present
  qty_reserved   integer          -- held for approved orders
  UNIQUE (item_id, location_id)
```

- `qty_available = qty_on_hand - qty_reserved` (computed, never stored).
- `items.qty_sold` stays as a denormalized counter (cheap, useful) — or moves to a view; decided in Phase 1.
- Unlimited physical locations; adding "Storage 3" becomes a normal `POST /locations`.
- The `Client` and `Transit` location types become first-class (delivered goods sit in a Client location until return).

### 5.2 Entity-relationship overview (target)

```mermaid
erDiagram
    USERS ||--o{ AUDIT_LOGS : writes
    BRANDS ||--o{ ITEMS : classifies
    BRANDS ||--o{ SUPPLIERS : supplies
    ITEMS ||--o{ ITEM_PHOTOS : has
    ITEMS ||--o{ ITEM_STOCKS : "stock per location"
    ITEMS ||--o{ SUPPLIER_PRICE_LISTS : priced by
    LOCATIONS ||--o{ ITEM_STOCKS : holds
    CLIENTS ||--o{ QUOTATIONS : receives
    QUOTATIONS ||--o{ QUOTATION_DETAILS : contains
    QUOTATIONS ||--o{ QUOTATION_REVISIONS : snapshots
    QUOTATIONS ||--o| SALES_ORDERS : converts to
    SALES_ORDERS ||--o{ SALES_ORDER_LINES : contains
    SALES_ORDERS ||--o{ RESERVATIONS : reserves
    SALES_ORDERS ||--o{ DELIVERIES : fulfilled by
    SALES_ORDERS ||--o| INVOICES : billed by
    CLIENTS ||--o{ SALES_ORDERS : places
    CLIENTS ||--o{ INVOICES : owes
    INVOICES ||--o{ PAYMENTS : settled by
    SUPPLIERS ||--o{ PURCHASE_ORDERS : receives
    PURCHASE_ORDERS ||--o{ PURCHASE_ORDER_LINES : contains
    PURCHASE_ORDERS ||--o{ GOODS_RECEIPTS : received by
    ITEMS ||--o{ TRANSACTIONS : moves
    LOCATIONS ||--o{ TRANSACTIONS : from/to
    SALES_ORDERS ||--o{ TRANSACTIONS : "sale refs order"
    PURCHASE_ORDERS ||--o{ TRANSACTIONS : "receipt refs PO"
```

### 5.3 New/changed tables (summary)

| Table | Phase | Purpose |
|-------|-------|---------|
| `item_stocks` | 1 | Qty on-hand + reserved per (item, location) — replaces qty_* columns |
| `number_sequences` | 1 | Race-free document numbering (`Q.AR#`, `SO-`, `PO-`, `INV-`) via row locks |
| `clients` (API + module) | 1 | Exists as table; gets CRUD, history endpoints |
| `suppliers` (API + module) | 3 | Exists as table; gets CRUD |
| `sales_orders`, `sales_order_lines`, `reservations` | 2 | Quote → order conversion, stock holding |
| `deliveries`, `delivery_lines` | 2 | Delivery/instalment notes; move stock to Client location |
| `purchase_orders`, `purchase_order_lines`, `goods_receipts` | 3 | Purchasing cycle |
| `supplier_price_lists` | 3 | Cost per supplier per item |
| `invoices`, `invoice_lines`, `payments` | 4 | Finance-lite AR |
| `item_costs` | 4 | Weighted-average cost per item for margin reporting |
| `notifications` | 2 | In-app notification inbox (persisted) |
| `settings` | 1 | Key/value company settings (default VAT %, currency, thresholds) |
| **Changed** `transactions` | 1 | Replace 8 `qty_*_before/after` snapshot columns with jsonb `stock_before`/`stock_after` keyed by location (schema-evolution-proof) |

### 5.4 Document numbering (fixes `generateQuoteNo` race)

```
number_sequences (scope TEXT PK, next_value INTEGER)
```
Allocation inside the same transaction as the insert:
`SELECT ... FOR UPDATE` on the scope row (e.g. `quotation:2026`), increment, use.
Formats: `Q.AR#<seq>-<YY>` (keep existing), `SO-<YY>-<seq>`, `PO-<YY>-<seq>`, `INV-<YY>-<seq>`, `DLV-<YY>-<seq>`.

---

## 6. Module Specifications

> Format per module: **Purpose · Entities · Key rules · Endpoints · Events · Done-when.**
> Existing endpoints listed in Appendix C; only new/changed behavior shown here.

### 6.1 Auth & Users (harden in Phase 0)

- **Purpose:** Authentication, refresh rotation, user administration, RBAC.
- **Key rules:**
  - Access 15m / refresh 7d with **rotation**: every refresh invalidates the previous refresh token (already single-slot per user — keep).
  - `POST /auth/refresh` added; `refresh` no longer updates `lastLoginAt` (bug today).
  - Password policy: min 8 chars, must contain letter + digit. Seeded admin gets a strong generated password printed once.
  - Login endpoint gets a tighter rate limit (10 / 15 min / IP + per-username backoff).
- **RBAC:** `@Roles(Role.Admin)` decorator + global `RolesGuard` (Appendix B matrix).
- **Done when:** logging in as Staff cannot reach any Admin route (403), tokens refresh without re-login, no hash ever appears in any response.

### 6.2 Locations & Stock (Phase 1 — the critical refactor)

- **Purpose:** Unlimited physical/virtual locations; stock lives in `item_stocks`.
- **Key rules:**
  - `InventoryService` rewritten: `applyTransaction` mutates `item_stocks` rows (`SELECT ... FOR UPDATE` on the (item, location) rows, ordered by ID to avoid deadlocks).
  - Debit invariant: `qty_on_hand >= qty` for any decrement; reserve invariant: `qty_reserved <= qty_on_hand`.
  - Location types: `Showroom | Storage | Client | Transit`. `isPhysical` renamed to `is_stock_location` (Transit is stock-holding too).
  - Deleting/deactivating a location requires zero stock.
- **Endpoints:** existing CRUD + `GET /locations/:id/stock` (what's in a location), `GET /items/:code/stock` now returns per-location rows + totals.
- **Events:** `stock.updated { itemCode, locationId, qty }`.
- **Done when:** creating "Storage 3" via API and transferring stock into it works; seed data migrated with zero qty drift (checksum before/after).

### 6.3 Catalog: Items, Brands, Photos, Categories (Phase 0–1)

- **Purpose:** The product master.
- **Key rules:**
  - `brandId` validated to exist (404 not 500); optional (entity already allows null).
  - Photos: `POST /items/:code/photos` (multipart, max 10, images only, 10 MB) → Cloudinary via existing `UploadsService`; `DELETE /items/:code/photos/:id`; `PATCH .../photos/:id` (set primary / reorder).
  - `GET /items/low-stock` → SQL: `(qty_on_hand - qty_reserved) <= low_stock_threshold` aggregated across locations.
  - Item update can never touch quantity columns directly (ledger only) — enforce by DTO + a DB `CHECK`/trigger optional.
  - Categories: keep free-text for now; promote to a table only when filtering by tree becomes a real requirement.
- **Done when:** an item can be created with brand, photo, price; low-stock is correct with 10k items (integration test).

### 6.4 Clients (CRM-lite, Phase 1) & Suppliers (Phase 3)

- **Purpose:** Parties. Table exists; build module/service/controller.
- **Clients — key rules:**
  - CRUD + soft-deactivate; duplicate detection on name+phone (suggest, don't block).
  - `GET /clients/:id/history` → quotes, orders, invoices, payments, transactions.
  - Quotations snap-shot client name/contact (already done) so client edits don't rewrite history.
- **Suppliers — key rules:**
  - CRUD; link to brands (many-to-many: one supplier can carry many brands — **change** current 1:1 `brand_id` to join table `supplier_brands`).
  - `GET /suppliers/:id/history` → POs, receipts, returns-to-supplier.
- **Done when:** quotations can be created against clients made through the API; a PO can reference a supplier.

### 6.5 Quotations (Phase 0 fixes + Phase 2 completion)

- **Purpose:** Pre-sale proposals with revisions and controlled sending.
- **Key rules (new/changed):**
  - Fix DTO typing so `vatPercent`, `discountGlobal`, `discountPercent` are **numbers** end-to-end (`@Type(() => Number) @IsNumber`), stored as decimal columns.
  - Line **edit** endpoint (`PATCH /quotation-details/:id`) — qty/price/discount/notes, Draft only.
  - Line **delete** enforces Draft (bug today).
  - **Revisions:** snapshot written on every change *after* a quotation has been Sent once (`revision++`, jsonb snapshot of details + totals, changed_by, change_summary). Draft phase stays cheap.
  - **Sending:** exactly one code path sends email (`quotations.service` → queue). Status transition and email sending are decoupled: transition first, enqueue email, delivery retried by worker. Kills the double-email bug and the circular dependency (delete both `forwardRef`s).
  - `Expired` status: scheduled job daily sets `Sent + valid_until < today → Expired`.
  - Totals recomputed from lines on read; stored grand total only inside revision snapshots and on the invoice.
  - Money: all arithmetic in **integer cents** internally (helpers `toCents/fromCents`); DB stays `numeric(12,2)`.
- **Done when:** VAT 14% quote saves, sends once, gets a revision snapshot after edit, expires on schedule, PDF shows photos.

### 6.6 Sales Orders & Fulfilment (Phase 2 — the heart of the ERP)

- **Purpose:** Convert approved quotations into binding orders that **reserve stock** and drive fulfilment.
- **Entities:** `sales_orders` (order_no, client, quotation ref, status, delivery address, dates), `sales_order_lines` (snapshot like quotation lines + fulfilled qty), `reservations` (item, location, qty, order ref).
- **State machine:**
  ```
  Draft → Confirmed → (Partially Reserved →) Reserved → Picking → Delivered → Closed
                                  ↘ Cancelled (releases reservations)
  ```
- **Key rules:**
  - `POST /sales-orders/from-quotation/:quoteId` — allowed once quotation is `Approved`; copies lines (snapshot), creates reservations.
  - Reservation: inside one transaction, for each line pick stock by strategy (configurable: same-location-first / showroom-first), lock `item_stocks` rows, increment `qty_reserved`. If insufficient total availability → order goes `Partially Reserved` with per-line shortage report.
  - **Sale transaction integration:** recording a Sale against an order decrements `qty_on_hand` **and** `qty_reserved` together and links `transactions.sales_order_id`.
  - **Delivery notes:** `POST /sales-orders/:id/deliveries` generates a delivery doc, and (optionally auto-records) Transfer to the client's `Client`-type location → goods remain traceable until final handover.
  - Returns reference the originating sales order and release/restore accordingly.
  - Amendments after `Confirmed` create a **new revision** of the order with audit trail (never silent edits).
- **Events:** `order.created`, `order.reserved`, `order.delivered`, `order.cancelled`.
- **Done when:** an e2e test drives: quote → approve → order → reserve → deliver → sale → return, and stock is exactly correct at every step for two locations.

### 6.7 Purchasing (Phase 3)

- **Entities:** `purchase_orders` + lines (supplier, currency, expected date, status), `goods_receipts` (what actually arrived), `supplier_price_lists` (item cost per supplier, effective-dated).
- **State machine:** `Draft → Sent → Partially Received → Received → Closed` (+ `Cancelled`).
- **Key rules:**
  - Receiving creates an `Adjustment/Increase` transaction with `purchase_order_id` reference (no more "New Arrival" magic string — reason enum: `NewArrival | Damage | CountCorrection | CustomerReturn | SupplierReturn`).
  - Partial receipts supported; over-receipt blocked beyond tolerance (default 0%).
  - Returns to supplier = `Adjustment/Decrease` with reason `SupplierReturn` + PO reference.
  - Suggested-PO report: items below threshold × supplier price list → draft PO in one click.
- **Done when:** a PO for 3 items received across 2 receipts yields exactly correct stock and PO status `Received`.

### 6.8 Finance-lite (Phase 4)

- **Entities:** `invoices` + lines (from sales order or manual), `payments` (method, date, amount, currency, reference), `item_costs` (weighted average).
- **Key rules:**
  - Invoice from order copies final prices/discounts/VAT; credit notes are negative invoices.
  - Payment allocation FIFO against open invoices; AR aging buckets (0–30/31–60/61–90/90+).
  - Currency: store amount + currency + `exchange_rate_to_usd` at invoice date; reporting normalizes to a base currency.
  - Cost: on goods receipt, item weighted-average cost updates from PO line cost; margin reports = (revenue − avg cost × qty).
- **Explicitly out:** GL, journals, tax filing (export CSV for the accountant instead).
- **Done when:** invoice lifecycle e2e passes; AR aging matches manual calculation on seeded fixture.

### 6.9 Stock Alerts & Notifications (Phase 1–2)

- **Purpose:** Make the two dead modules real.
- **Key rules:**
  - After every committed transaction (listen to `transaction.created`), evaluate affected item's availability vs threshold → if crossing below, emit WS event + create in-app notification + email (daily digest, deduplicated by `last_alerted_at` + configurable quiet period).
  - Recovery alerts (crossing back above) optional, default off.
  - Threshold defaults from `settings`; per-item override already modeled in `stock_alert_configs`.
  - `notifications` table = inbox (`GET /notifications`, mark read); emails go through BullMQ queue with retry/backoff.
- **Done when:** a sale that drops an item to 0 produces exactly one alert through all channels within seconds; no alert spam while it stays low.

### 6.10 Audit Log (Phase 0 wiring, Phase 1 completeness)

- **Purpose:** Every mutation answerable: who, when, what changed, from where.
- **Key rules:**
  - Written **in the same DB transaction** as the change (no async fire-and-forget losing records on crash).
  - Via a TypeORM subscriber/interceptor: action (`create|update|delete|status_change|login`), entity, entityId, old/new values (jsonb, secrets stripped), changed fields, userId, IP, user-agent (`CurrentUser` + request data captured in an AsyncLocalStorage context).
  - Query API with filters (user, entity, date range) + pagination.
- **Done when:** integration test asserts an audit row exists for every mutation type in the suite.

### 6.11 Reporting & Dashboard (Phase 4)

- Reports (all SQL-aggregated, CSV/PDF export):
  - Stock valuation (qty × avg cost, by location/brand/category)
  - Sales by period / brand / category / showroom; top clients; quote win-rate & cycle time
  - Inventory aging; dead stock (no movement N months)
  - Purchasing: spend by supplier, PO lead times
  - AR aging; revenue vs margin
- Dashboard: cached 60s in Redis; per-role variants (Manager sees revenue/margin; Staff sees stock/alerts).
- **Done when:** no report loads raw tables into JS; each has a fixture-based test.

### 6.12 Realtime Gateway (Phase 1–2)

- JWT-authenticated handshake (reuse `JwtStrategy`; reject unauthenticated sockets), rooms: `role:<role>`, `item:<code>`, `location:<id>`.
- All `emit*` methods wired to domain events; CORS from settings, not `'*'`.
- **Done when:** two browser tabs see stock change instantly; unauthenticated socket rejected.

---

## 7. Security Plan

| # | Item | Action | Phase |
|---|------|--------|-------|
| S1 | Response serialization | Global `ClassSerializerInterceptor` (app-level, before transform interceptor); `@Exclude` verified by test | 0 |
| S2 | RBAC | `RolesGuard` + `@Roles()` on every mutating route; permission matrix (Appendix B) enforced by test suite hitting every endpoint with every role | 0 |
| S3 | changePassword | Self only, or Admin-for-other with forced reset flow (no current-password knowledge required → sets temp password) | 0 |
| S4 | Passwords | min 8 + letter + digit; bcrypt 12 (existing); strong seeded admin; failed-login lockout (5 → 15 min) | 0 |
| S5 | CORS | Default deny; `ALLOWED_ORIGINS` required in prod; gateway CORS from same setting | 0 |
| S6 | Rate limiting | Keep global 1000/15m; login 10/15m; transaction endpoints 60/min/user | 0 |
| S7 | Trust proxy | Set `app.set('trust proxy', 1)` behind reverse proxy so `request.ip` is real client IP | 0 |
| S8 | Secrets | 32+ char secrets (already Joi-enforced), `.env` never committed (already), add secret-scan in CI | 1 |
| S9 | WS auth | JWT handshake verification | 1 |
| S10 | Uploads | MIME sniff (not just extension), size caps, Cloudinary signed delivery for private docs (quotations) | 1–2 |
| S11 | Injection/IDOR | Review all `ILIKE` params (parameterized — OK today); object-level checks once multi-user data lands | 2+ |
| S12 | Dependencies | `pnpm audit` in CI; Renovate/Renew updates monthly | 1 |
| S13 | Headers | helmet already on; add CSP for any served HTML, HSTS at proxy | 1 |

---

## 8. API Standards

- **Versioning:** stay on `/api/v1` path prefix; breaking changes → `/api/v2` (no in-place breaks).
- **Response envelope:** `{ success, data, meta? }` (existing interceptor) — errors `{ success: false, statusCode, message, errors?, timestamp, path }` (existing filter). Keep.
- **Pagination:** `?page&limit` (max 100) everywhere a collection grows — including `transactions`, `quotations`, `audit-log` (today unbounded).
- **Filtering/sorting:** whitelist-based per DTO (pattern in `SearchItemDto` is right); never interpolate user input into SQL.
- **Idempotency:** mutating stock endpoints accept `Idempotency-Key` header; Redis-stored key → response replay (302 dup returns original result) to make client retries safe.
- **Numbers:** money and quantities arrive as JSON numbers, validated `@IsNumber`, stored `numeric`; API never exchanges floats for money beyond 2 decimals.
- **Errors:** map FK violations (`23503`) → 404/422 with field name (today → 500); unique (`23505`) → 409 already handled.
- **Swagger:** every endpoint annotated (`@ApiOperation`, `@ApiOkResponse`, `@ApiBearerAuth`); Swagger enabled in staging with basic auth, off in prod.
- **Naming:** collections plural kebab (`sales-orders`); actions as sub-resources (`POST /sales-orders/:id/deliveries`).

---

## 9. Testing Strategy

| Level | Target | Tooling | Minimum |
|--------|--------|---------|---------|
| Unit | Pure logic: totals/cents math, state machines, reservation strategies, sequence allocation | Jest | every rule function |
| Integration (DB) | Services against real PostgreSQL (testcontainers or docker-compose db) | Jest + pg | stock invariants, ledger, orders, POs, invoices |
| E2E (API) | Full HTTP: auth → quote → order → deliver → invoice | supertest (exists) | 1 golden path + RBAC matrix sweep |
| Concurrency | Two parallel sales on last unit; two parallel quote creations | Jest Promise.all | no oversell, no duplicate numbers |
| Security | Serializer leak check, route × role matrix, rate limits | supertest | in CI |

- **Coverage gates (from Phase 1):** 80% lines/branches on `inventory`, `quotations`, `sales-orders`, `invoices`; 60% global.
- Fixtures: seed script variant with deterministic dataset (10 brands, 200 items, 4 locations, 20 clients) for local dev + tests.
- Bugs found in the wild get a regression test before the fix (P8).

---

## 10. Performance & Scalability

1. **Indexes (Phase 1 migration):** FK columns everywhere they're filtered — `transactions(item_id)`, `transactions(transaction_date)`, `quotation_details(quotation_id)`, `item_stocks(item_id/location_id)` (unique composite already), `invoices(client_id, status)`, `audit_logs(created_at)` (+ existing entity index).
2. **All list endpoints paginated + SQL-filtered** (kills today's in-memory scans in dashboard/low-stock/alerts).
3. **Redis cache:** dashboard summary (60s), item search facets (5s invalidation on write), rate-limit store shared across instances.
4. **Queues (BullMQ):** PDF generation, email sending, report exports — all off the request path with retries and dead-letter list.
5. **Puppeteer:** single warmed browser pool in the worker (today: launch per request).
6. **Connection discipline:** TypeORM pool sized (10–20); transactions short; no user request ever inside a Puppeteer render.
7. **Growth expectations:** design target 100k items, 1M transactions, 50k quotes — all comfortably OLTP Postgres with the above; no sharding/read-replica needed until far beyond.

---

## 11. Observability & Operations

- **Logging:** structured JSON logs (pino) with request-id (AsyncLocalStorage) — replace object logging in `LoggingInterceptor`; never log secrets/hashes (guard test).
- **Metrics:** `/metrics` (prometheus): HTTP latency histograms, queue depth, PDF render time, DB pool utilization.
- **Health:** extend `/health` with DB + Redis + queue checks (`@nestjs/terminus`).
- **Environments:** `local → staging → production`; migrations run in deploy pipeline before rollout; seeds only local/staging.
- **CI/CD (GitHub Actions):** lint → typecheck → unit → integration (services: postgres, redis) → build → deploy staging → smoke → promote. PRs must pass RBAC matrix + leak tests.
- **Backups:** nightly `pg_dump` + WAL archiving, monthly restore drill; Cloudinary assets owned by account-level backup.
- **Runbooks:** stock drift reconciliation (ledger replay vs `item_stocks`), stuck queue, expired-token storm.

---

## 12. Data Migration Strategy

**Rule: migrate before the data grows.** Each migration ships with a verified backfill and a reconciliation check.

- **M1 (Phase 1) — stock model:**
  1. Create `item_stocks`; backfill from `items` (showroom→location 1, storage1→2, storage2→3).
  2. Reconciliation query: per-item checksum of old columns vs new rows must be identical → CI gate.
  3. Dual-write period not needed (single deploy, downtime window acceptable).
  4. Drop qty columns only after one clean week in staging.
- **M2 (Phase 1) — transaction snapshots:** copy the 8 `qty_*_before/after` columns into `stock_before`/`stock_after` jsonb; keep old columns one release, then drop.
- **M3 (Phase 1) — numbering:** insert `number_sequences` rows initialized from current MAX per scope (keeps existing `Q.AR#` sequence continuous).
- **M4 (Phase 2) — orders:** existing `Sale` transactions with `reference_no` get optional backfill into `sales_orders` (manual mapping tool, not automatic guessing).
- **Every migration:** tested against a copy of production-shape data; has `down()`; runs inside CI before deploy.

---

## 13. Phased Roadmap

> Sequencing logic: **security first** (it's cheap and everything else lands on it), **schema second** (before data volume), **business cycle third** (highest value), then purchasing, finance, industrialization.

### Phase 0 — Hardening (≈ 1 week) 🔒

**Goal:** current feature set, but secure, correct, and leak-free.

- [ ] Global `ClassSerializerInterceptor`; leak regression test (S1)
- [ ] `RolesGuard` + `@Roles()` on all mutating routes per Appendix B (S2)
- [ ] Fix `changePassword` authorization; self-only or admin-reset (S3)
- [ ] Password policy + strong seed admin + login rate limit + lockout (S4, S6)
- [ ] CORS default-deny; trust proxy (S5, S7)
- [ ] Fix numeric DTOs (`vatPercent`, `discountGlobal`, `discountPercent` → numbers) (C4)
- [ ] Fix double-email loop; decouple send from status transition (H1)
- [ ] `GET /items/low-stock` as SQL query (H2)
- [ ] Fix `inStock=false` parsing (remove `@Type(() => Boolean)`, use `@IsIn(['true','false'])` + transform)
- [ ] Quotation line delete enforces Draft (H6)
- [ ] `POST /auth/refresh` endpoint; refresh no longer bumps `lastLoginAt` (H4)
- [ ] `brandId` existence validation; make optional (bug)
- [ ] Wire `AuditLogService` into all mutations (interceptor-based first cut) (P6)
- [ ] Paginate `GET /transactions`, `GET /quotations`
- [ ] Unit tests: totals math, state machine, stock invariants (P8)
- [ ] `pnpm audit` + CI skeleton (lint, typecheck, unit)

**Exit criteria:** all Appendix A Critical/High closed; RBAC matrix test green; no secret in any response; unit suite ≥ 60% on quotations/transactions services.

### Phase 1 — Foundation Refactor (≈ 2–3 weeks) 🏗️

**Goal:** data model that survives 10 years; every dead module alive or deleted.

- [ ] `item_stocks` redesign + migration M1 + reconciliation gate (C3)
- [ ] `InventoryService` rewrite on `item_stocks`; deadlock-safe lock ordering
- [ ] Transaction snapshot columns → jsonb (M2)
- [ ] `number_sequences` for all document numbers (M3); quote number race dead
- [ ] Adjustment reason → enum; delete "New Arrival" string compare
- [ ] Photo upload/delete/reorder endpoints wired to `UploadsService` (Cloudinary)
- [ ] Clients module: CRUD + history
- [ ] `settings` module (default VAT, currency, thresholds, reservation strategy)
- [ ] FK indexes migration; pagination + SQL filtering everywhere (P7)
- [ ] Websocket gateway authenticated + wired to `stock.updated` / `transaction.created`
- [ ] Stock alerts live: threshold evaluation after transactions, WS + in-app + digest email
- [ ] Audit log: transactional writes, full field diffs, filtered query API
- [ ] Redis introduced for what it's actually needed for: cache + rate-limit store; BullMQ queues for email/PDF
- [ ] Remove or use: `ioredis` (now used), `MAIL_*` env (delete), unused `LocationsService.findByName`
- [ ] Swagger annotations complete; staging docs behind basic auth
- [ ] Integration test suite with real Postgres (docker-compose) — coverage gates on

**Exit criteria:** unlimited locations work (new location holds stock through API); alert fires end-to-end; audit row for every mutation; migration reconciliation clean on prod-copy data.

### Phase 2 — Sales Cycle (≈ 3–4 weeks) 💰

**Goal:** quote → money, with stock never lying.

- [ ] Quotation line edit endpoint; revisions snapshot after first send; revision history API + PDF per revision
- [ ] Expiry scheduler (`Sent` + past `valid_until` → `Expired`)
- [ ] `sales_orders` + lines + conversion from approved quotation
- [ ] Reservations engine + strategy setting; partial-reservation handling
- [ ] Sale ↔ order linkage (decrement on-hand + reserved atomically)
- [ ] Deliveries module + delivery notes PDF; optional auto-transfer to Client location
- [ ] Returns referencing orders
- [ ] In-app `notifications` inbox + email digests via queue
- [ ] PDF: photos in quotation line items (uses `photoUrlSnapshot` — finally set on add)
- [ ] Idempotency keys on all stock endpoints
- [ ] Golden-path E2E (quote → approve → order → reserve → deliver → sale → return) + concurrency tests

**Exit criteria:** golden path green; concurrent last-unit sale never oversells; approved quote with insufficient stock degrades to `Partially Reserved` with shortage report, not an error.

### Phase 3 — Purchasing (≈ 2–3 weeks) 📦

**Goal:** know what to buy, from whom, and receive it correctly.

- [ ] Suppliers module: CRUD + supplier↔brands many-to-many
- [ ] Supplier price lists (effective-dated costs)
- [ ] `purchase_orders` lifecycle + lines; PDF; email to supplier
- [ ] `goods_receipts`: partial receipts, tolerances, Increase transaction w/ PO ref
- [ ] Returns to supplier (Decrease w/ ref + reason enum)
- [ ] Suggested-PO report (low stock × price list)
- [ ] Weighted-average item cost updates on receipt

**Exit criteria:** multi-receipt PO e2e passes; stock and PO status correct; cost updated and visible on item.

### Phase 4 — Finance-lite & Reporting (≈ 3 weeks) 📊

**Goal:** know what you're owed and what you earned.

- [ ] `invoices` + lines (from orders or manual), credit notes
- [ ] `payments` + FIFO allocation; AR aging
- [ ] Multi-currency amounts with rate-at-invoice
- [ ] Margin: revenue vs avg cost reporting
- [ ] Reports suite (stock valuation, sales, aging, dead stock, win-rate) + CSV/PDF export via queue
- [ ] Dashboard: role-aware, Redis-cached, all SQL

**Exit criteria:** AR aging matches fixture math; every report paginated/SQL and under 500 ms on 10× fixture data.

### Phase 5 — Industrialize (ongoing) 🚀

- [ ] CI/CD full pipeline with staging promotion + smoke tests
- [ ] Structured logs + metrics + terminus health; dashboards
- [ ] Backup/restore runbook + monthly drill
- [ ] Load test (k6): 50 RPS mixed read/write, p95 < 300 ms
- [ ] API v1 freeze; versioning policy documented
- [ ] Frontend work begins against stable v1 (separate repo/plan)
- [ ] Optional: multi-branch (per-location P&L), external accounting export, SSO

---

## 14. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stock migration corrupts quantities | Med | Critical | Reconciliation checksum gate (M1); staging rehearsal on prod copy; downtime window; rollback `down()` |
| Scope creep into full accounting | High | High | Non-goals §3.3 enforced; CSV export to accountant instead |
| Solo-dev bus factor / burnout | Med | High | Small phases with exit criteria; tests as spec; this doc as memory |
| Puppeteer/Chrome memory issues on server | Med | Med | Worker process isolation, pool + timeout, queue kill-switch to plain-HTML email fallback |
| Cloudinary/Resend outage | Low | Med | Queue retries + dead-letter; PDF stored and re-sendable; provider abstraction thin |
| Quote/order numbering gaps after rollback | Low | Low | Sequences are gap-tolerant by design (documented); never reuse |
| Rate limiter bypass via proxy IP | Med | Med | Trust proxy config (S7); per-user limits not just per-IP |
| Historic data semantics (existing sales) | Med | Med | M4 manual mapping tool; keep ledger untouched — corrections are new transactions |

---

## 15. Acceptance Criteria & Definition of Done

**Per feature (every phase):**
1. Endpoint(s) annotated in Swagger, covered by integration test(s).
2. Business rules unit-tested; concurrency-sensitive paths have a parallel-execution test.
3. Audit log written for every mutation (verified by test).
4. RBAC route protected per Appendix B (verified by matrix test).
5. No secret fields in any response shape (serializer test).
6. Migration (if any) has `down()`, backfill, reconciliation check.
7. Pagination + SQL filtering on any new collection endpoint.
8. README / ADR note for any decision that deviates from this plan.

**Per phase:** all checkboxes ticked + exit criteria demonstrated on staging + one clean restore-from-backup drill per release.

---

## 16. Appendix A — Known Bugs & Dead Code

### Critical
| ID | Issue | Location | Fixed in |
|----|-------|----------|----------|
| C1 | Password/refresh hashes leak in responses (no serializer) | `main.ts:34`, `user.entity.ts` | Phase 0 |
| C2 | No RBAC enforcement | all controllers | Phase 0 |
| C3 | Stock hard-coded to location IDs 1/2/3 | `inventory.service.ts:44-45`, `items.service.ts:53-55` | Phase 1 |
| C4 | `@Min/@Max` on string DTOs — VAT/discount never saveable (verified) | `create-quotation.dto.ts`, `add-item.dto.ts` | Phase 0 |

### High
| ID | Issue | Location | Fixed in |
|----|-------|----------|----------|
| H1 | Double email on send (circular dep) | `notifications.service.ts:51` ↔ `quotations.service.ts:23` | Phase 0 |
| H2 | low-stock caps at first 100 items | `items.controller.ts:11` | Phase 0 |
| H3 | changePassword no-op ternary | `users.controller.ts:17` | Phase 0 |
| H4 | No refresh endpoint (token unusable) | `auth.controller.ts` | Phase 0 |
| H5 | Weak seeded admin `123456` | `run-seeds.ts:22` | Phase 0 |
| H6 | Line delete ignores quotation status | `quotation-details.service.ts:14` | Phase 0 |

### Medium / Low
| ID | Issue | Location |
|----|-------|----------|
| M1 | `inStock=false` parsed as `true` (`@Type(() => Boolean)`) | `search-item.dto.ts` |
| M2 | Quote number race (read-max-insert) | `quotations.service.ts:15-19` |
| M3 | `refresh()` updates `lastLoginAt` | `auth.service.ts:24` |
| M4 | `brandId` unvalidated (FK → 500), duplicate `@IsInt()`, forced-required | `create-item.dto.ts:6` |
| M5 | "New Arrival" magic string controls `initialQty` | `inventory.service.ts:32` |
| M6 | Money math in floats (`computeTotals`) | `quotations.service.ts:24` |
| M7 | `photoUrlSnapshot` never populated | `quotation-details.service.ts:13` |
| M8 | Dashboard/alerts/low-stock load full tables into JS | `dashboard.service.ts:12`, `stock-alerts.service.ts:14` |
| M9 | Unpaginated `GET /transactions`, `GET /quotations`, audit-log | services |
| M10 | FK violation (23503) → 500 not 4xx | `http-exception.filter.ts` |
| M11 | `DB_SYNCHRONIZE` env validated but ignored by factory | `database.config.ts:13` |
| M12 | CORS_ALLOW_ALL defaults true; gateway CORS `'*'`, unauthenticated | `app.config.ts:16`, `app.gateway.ts:7` |

### Dead code (wire or delete — P4)
| Item | Location | Decision |
|------|----------|----------|
| Audit log never written | `audit-log.service.ts` | Wire in Phase 0 |
| WS emits never called | `app.gateway.ts:13-17` | Wire in Phase 1 |
| `checkAndAlert` never called; alerts nobody | `stock-alerts.service.ts:15` | Wire in Phase 1 |
| Quotation revisions never written | `quotation-revision.entity.ts` | Wire in Phase 2 |
| Photo upload service unused, no endpoint | `uploads.service.ts` | Wire in Phase 1 |
| Clients/Suppliers: entities, no API | `src/clients`, `src/suppliers` | Clients P1, Suppliers P3 |
| `ioredis` + `REDIS_*` env unused | `package.json`, `.env.example` | Use in Phase 1 |
| `MAIL_*` env unused | `.env.example` | Delete in Phase 1 |
| `LocationsService.findByName` unused | `locations.service.ts:6` | Delete or use in M1 tooling |

---

## 17. Appendix B — RBAC Permission Matrix

| Capability | Admin | Manager | Staff | Viewer |
|---|---|---|---|---|
| Manage users & roles | ✅ | ❌ | ❌ | ❌ |
| Company settings | ✅ | ✅ | ❌ | ❌ |
| Create/edit items & brands | ✅ | ✅ | ✅ | ❌ |
| Delete/deactivate items, brands | ✅ | ✅ | ❌ | ❌ |
| Stock transactions (transfer/sale/return) | ✅ | ✅ | ✅ | ❌ |
| Stock adjustments (increase/decrease) | ✅ | ✅ | ❌ | ❌ |
| Manage clients & suppliers | ✅ | ✅ | ✅ | ❌ |
| Quotations: create/edit/delete lines | ✅ | ✅ | ✅ | ❌ |
| Quotations: send email | ✅ | ✅ | ✅ | ❌ |
| Quotations: approve/reject/cancel status | ✅ | ✅ | ❌ | ❌ |
| Convert quote → order, fulfil, deliver | ✅ | ✅ | ✅ | ❌ |
| Cancel sales order / release reservation | ✅ | ✅ | ❌ | ❌ |
| Purchase orders & receipts | ✅ | ✅ | ❌ | ❌ |
| Invoices & payments | ✅ | ✅ | ❌ | ❌ |
| Reports & dashboard | ✅ | ✅ | ✅ (operational) | ✅ (read-only) |
| Audit log query | ✅ | ✅ | ❌ | ❌ |
| View everything (read) | ✅ | ✅ | ✅ | ✅ |

Implementation: `@Roles(...)` per route + matrix test iterating endpoint × role in Phase 0.

---

## 18. Appendix C — Endpoint Inventory

### Current (audited)

```
GET    /health                                   GET    /  (hello)
POST   /auth/login          POST /auth/logout
GET    /users  /users/:id   POST /users   PATCH /users/:id   PATCH /users/:id/password
GET    /brands  /brands/:id POST /brands  PATCH /brands/:id DELETE /brands/:id (deactivate)
GET    /locations /locations/:id POST /locations PATCH /locations/:id
GET    /items  /items/low-stock  /items/:code  /items/:code/stock
POST   /items   PATCH /items/:code   DELETE /items/:code (soft)
GET    /transactions /transactions/:id
POST   /transactions/transfer | sale | return | adjustment
GET    /quotations /quotations/:id /quotations/:id/totals
POST   /quotations   PATCH /quotations/:id/status
POST   /quotation-details   DELETE /quotation-details/:id
POST   /notifications/quotations/:id/send-email | test-email
GET    /reports/quotation/:id/pdf
GET    /stock-alerts  /stock-alerts/:itemId   PUT /stock-alerts/:itemId
GET    /audit-log  /audit-log/:entity/:id
GET    /dashboard/summary  /dashboard/recent-transactions
```

### Planned additions by phase

```
Phase 0:  POST /auth/refresh
Phase 1:  GET/POST/PATCH/DELETE /clients, GET /clients/:id/history
          POST/DELETE/PATCH /items/:code/photos[/:photoId]
          GET  /locations/:id/stock           GET /settings  PATCH /settings
          GET  /notifications (inbox, P2)     GET /stock-alerts (SQL-based)
Phase 2:  POST /sales-orders  GET /sales-orders[/:id]  PATCH /sales-orders/:id/status
          POST /sales-orders/from-quotation/:quoteId
          POST /sales-orders/:id/deliveries   GET /deliveries/:id/pdf
          PATCH /quotation-details/:id        GET /quotations/:id/revisions
Phase 3:  GET/POST/PATCH /suppliers[/:id]     GET /suppliers/:id/history
          GET/POST/PATCH /purchase-orders[/:id]  POST /purchase-orders/:id/receipts
          GET  /supplier-price-lists          POST /purchase-orders/suggested
Phase 4:  GET/POST /invoices[/:id]  POST /invoices/:id/credit-note
          POST /payments      GET /reports/aging
          GET  /reports/{stock-valuation|sales|margin|dead-stock|win-rate}(.csv|.pdf)
```

---

## 19. Appendix D — Environment & Configuration

| Variable | Status | Plan |
|----------|--------|------|
| `DB_*` | ✅ used | keep; remove unused `DB_SYNCHRONIZE` or honor it in `database.config.ts` |
| `JWT_ACCESS_SECRET/EXPIRES_IN`, `JWT_REFRESH_*` | ✅ used | keep (32+ enforced) |
| `BCRYPT_SALT_ROUNDS` | ⚠️ validated, never read | read it in `AuthService`/`UsersService` or delete |
| `CORS_ALLOW_ALL`, `ALLOWED_ORIGINS` | ⚠️ insecure default | default-deny in Phase 0 |
| `RESEND_*` | ✅ used | move to queue worker; add `RESEND_WEBHOOK_SECRET` for delivery events |
| `CLOUDINARY_*` | ⚠️ service unused | Phase 1 wiring |
| `REDIS_*` | ❌ unused | Phase 1: cache + queues |
| `MAIL_*` | ❌ unused | delete |
| `STOCK_ALERT_DEFAULT_THRESHOLD`, `STOCK_ALERT_EMAIL` | ❌ unused | move into `settings` table (Phase 1), delete from env |
| `PUPPETEER_EXECUTABLE_PATH` | ✅ used | keep; add `PDF_RENDER_TIMEOUT` |
| — new — | | `IDEMPOTENCY_TTL`, `RESERVATION_STRATEGY`, `BASE_CURRENCY`, `RATE_LIMIT_*` |

Config hygiene rules: every env var must be either read by code or deleted (CI check); Joi schema stays the single source of truth; add a `config.service` so modules stop reading `process.env` directly (`notifications.service.ts:30` pattern is replaced).

---

*End of plan. Next concrete action: Phase 0 checklist, item 1 — register `ClassSerializerInterceptor`.*
