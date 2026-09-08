# Changelog — Living In Interior ERP

All notable changes from the original codebase through the full ERP rebuild.

**Commits:** `cbbe6f7` → `54477da` (16 commits, 188 files, +13,205 / −965 lines)

---

## Phase 2A — Security, Items, Quotations, Clients, Reports

**Commits:** `cbbe6f7` `62b0801` `7e2b8c7` `eeb960b` `384b13d` `5b04dc4` `609b5b9`

### Auth & Security
- **JWT auth** — access + refresh token pair, rotating refresh, bcrypt password hashing
- **RBAC guard** — 4 roles: Admin, Manager, Staff, Viewer; every mutating route protected
- **Password policy** — min 8 chars, ≥ 1 letter, ≥ 1 digit
- **CORS** — configurable allow-list (`ALLOWED_ORIGINS`) or `CORS_ALLOW_ALL` for dev
- **Rate limiting** — 1000 req/15min global, 30 req/15min on `/auth`
- **Helmet** — security headers enabled
- **ClassSerializer** — `@Exclude()` strips passwords/tokens from all responses
- **Swagger** — enabled in non-production, disabled when `NODE_ENV=production`

### Items
- **Item entity** — code (unique, uppercase), description, dimension, finishFabric, category, subCategory, brand FK, unitPrice (decimal string), currency, lowStockThreshold, initialQty, qtySold, isActive
- **ItemPhoto entity** — fileUrl, thumbnailUrl, isPrimary, sortOrder; upload via Cloudinary
- **ItemStock entity** — per-location stock: `qtyOnHand`, `qtyReserved`, unique on `(item, location)`
- **Stock engine** — pure functions: `sale()`, `transfer()`, `returnToShop()`, `adjustment()` with full unit tests
- **Inventory service** — transactional wrappers using the stock engine; all mutations go through here
- **Photo endpoints** — `POST /items/:code/photos` (multipart, 10MB limit), `DELETE`, `PATCH /primary`
- **Search** — `GET /items?q=&brand=&category=&inStock=&sortBy=&sortOrder=&page=&limit=`
- **Low-stock endpoint** — `GET /items/low-stock` (SQL-aggregated, joins item_stocks × items)

### Quotations
- **Quotation entity** — quoteNo (auto `QUO-YY-####`), quoteDate, client FK, clientName, projectName, contactPerson, phone, email, notes, internalNotes, status, revision, validUntil, discountGlobal, vatPercent, currency
- **QuotationDetail entity** — item snapshots (code, description, brand, dimension, finishFabric, photoUrl) frozen at creation; qty, unitPrice, discountPercent, discountAmount, totalPrice, totalPriceAfterDiscount, isDeleted (soft-delete)
- **QuotationRevision entity** — full JSON snapshot per revision, changeSummary, changedBy
- **Totals module** — `computeQuotationTotals()` + `toCents()`/`fromCents()` helpers; handles line discounts → global discount → VAT
- **Race-free numbering** — `NumberingService` uses `SELECT ... FOR UPDATE` to prevent duplicate quote numbers
- **Status workflow** — Draft → Sent → Approved → Converted; also Rejected/Cancelled/Expired
- **PDF generation** — Puppeteer-based, delivery template via Handlebars

### Clients
- **Client entity** — name, type, contactPerson, phone, email, address, city, country, notes, isActive
- **Full CRUD** — GET (with search), GET :id, GET :id/history, POST, PATCH, DELETE
- **Client history** — returns all quotations, orders, invoices, payments for a client

### Suppliers
- **Supplier entity** — name, brand FK (1:1), contactPerson, phone, email, website, country, paymentTerms, notes, isActive
- **Full CRUD** — GET (search), GET :id, POST, PATCH, DELETE (soft-deactivate)
- **SupplierPriceList entity** — item FK, effectiveDate, unitCost, currency; upserted on goods receipt

### Brands
- **Brand entity** — name (unique), country, logoUrl, website, notes, isActive
- **Full CRUD** — GET (search), GET :id, POST, PATCH, DELETE

### Locations
- **Location entity** — name (unique), type (Showroom/Storage/Client/Transit), isPhysical
- **CRUD** — GET, GET :id, POST, PATCH (Manager+)

### Audit
- **AuditLog entity** — userId, userName, action, entity, entityId, oldValues/newValues (JSONB), changedFields, ipAddress, userAgent
- **Audit interceptor** — auto-captures CREATE/UPDATE/DELETE on all entities

### Dashboard
- **GET /dashboard/summary** — totalItems, totalActiveItems, totalQuotations, totalClients, lowStockCount, totalInventoryValue (all SQL-aggregated)
- **GET /dashboard/recent-transactions** — last 10 transactions with item + locations

### WebSocket Gateway
- **Socket.IO** — JWT-authenticated connections, role/user rooms
- **Events** — stock:updated, stock:alert, transaction:created, quotation:created/updated/status, item:created/updated, notification:created

### Notifications
- **Notification entity** — user FK, type, payload (JSONB), readAt
- **Inbox** — GET /notifications (current user), PATCH /notifications/:id/read
- **Email** — send quotation via Resend, test endpoint, low-stock digest cron (07:00)
- **Quotation expiry cron** — auto-expires quotations past validUntil

### CI & Testing
- **Docker Compose** — PostgreSQL 16 for local dev
- **GitHub Actions** — lint → typecheck → unit → migration:run → seed → build → health smoke → e2e → load:check
- **Golden-path e2e** — login → item → stock-in → transfer → sale → quote → approve → order → reserve → deliver → invoice → payment
- **Concurrency e2e** — parallel last-unit sale, parallel quotation create, parallel order-confirm
- **RBAC spot-check** — `scripts/rbac-spot-check.ts` verifies Staff role against all mutating routes
- **Unit tests** — stock engine, totals/cents, numbering, state machines (27 total)

---

## Phase 2B — Sales Orders, Reservations, Deliveries

**Commits:** `3e65d8f` `2225f1b`

### Sales Orders
- **SalesOrder entity** — orderNo (auto `ORD-YY-####`), orderDate, client FK, clientName, contactPerson, phone, email, quotation FK (unique per active order via partial index), status, expectedDeliveryDate, discountGlobal, vatPercent, currency, notes, internalNotes
- **SalesOrderLine entity** — item FK, item snapshots (code, description, brand), qty, qtyDelivered, shortage flag, unitPrice, discountPercent, totalPrice, totalPriceAfterDiscount, notes
- **Status machine** — Draft → Confirmed → Delivered → Closed; Cancel from Draft/Confirmed
- **Line CRUD** — POST /sales-orders/:id/lines, PATCH /sales-orders/lines/:lineId, DELETE
- **Confirm** — reserves stock (showroom-first strategy), sets shortage=true on under-reserved lines
- **Create from quotation** — POST /sales-orders/from-quotation/:quotationId copies approved quotation lines
- **Order margin** — GET /sales-orders/:id returns `{ revenue, cost, margin }` computed from latest supplier cost

### Reservations
- **Reservation entity** — salesOrder FK, item FK, location FK, qty; unique on (order, item, location)
- Auto-created on order confirm, auto-released on cancel/delivery

### Deliveries
- **Delivery entity** — deliveryNo (auto `DEL-YY-####`), salesOrder FK, deliveredAt, notes, pdfPath
- **DeliveryLine entity** — item FK, item snapshots, salesOrderLineId, qty
- **Create** — POST /sales-orders/:id/deliveries with `{ lines: [{ salesOrderLineId, qty }], deliveredAt?, notes? }`
- **Auto-close** — when all lines fully delivered, order status → Closed
- **PDF** — delivery PDF generated via Puppeteer

---

## Phase 2C — Notifications, Low-Stock Digest, Quotation Expiry

**Commit:** `a2ace12`

- **NotificationsService.create()** — single chokepoint for all in-app notifications + WS event emission
- **Low-stock digest** — daily cron at 07:00 emails a digest of items below threshold via Resend
- **Quotation expiry** — daily cron auto-expires quotations past validUntil

---

## Phase 3 — Purchase Orders, Goods Receipts, Supplier Returns

**Commit:** `b9ffb74`

### Purchase Orders
- **PurchaseOrder entity** — purchaseNo (auto `PO-YY-####`), supplier FK, orderDate, expectedDate, status, currency, notes
- **PurchaseOrderLine entity** — item FK (unique per PO), qty, receivedQty, unitCost
- **Status machine** — Draft → Sent → PartiallyReceived → Received → Closed; Cancel from Draft/Sent
- **Create** — POST /purchase-orders with nested lines
- **From suggestions** — POST /purchase-orders/from-suggestions auto-fills low-stock items with latest supplier cost
- **Send** — Draft → Sent
- **Close** — manual close

### Goods Receipts
- **GoodsReceipt entity** — receiptNo (auto `REC-YY-####`), purchaseOrder FK, receivedAt, notes
- **GoodsReceiptLine entity** — item FK, qty, unitCost
- **Receive** — POST /purchase-orders/:id/goods-receipts with `{ lines: [{ lineId, qty, toLocationId }] }`
- **Effect** — increases stock, upserts SupplierPriceList (latest cost), updates PO receivedQty, auto-advances PO status

### Supplier Returns
- **Return to supplier** — POST /purchase-orders/:id/return-to-supplier with `{ lines: [{ lineId, qty, fromLocationId }] }`
- **Effect** — decreases stock, records transaction

### Reports
- **GET /reports/stock-valuation** — CTE with DISTINCT ON for latest supplier cost per item, per-location rollups, grandTotal

---

## Phase 4 — Invoices, FIFO Payments, AR Aging, Credit Notes

**Commit:** `03ebb41`

### Invoices
- **Invoice entity** — invoiceNo (auto `INV-YY-####`), client FK, clientName snapshot, salesOrder FK, invoiceDate, status, currency, subtotal, discountGlobal, vatPercent, total, notes
- **InvoiceLine entity** — item FK, item snapshots, qty, unitPrice, discountPercent, totalPrice
- **Create from order** — POST /invoices `{ salesOrderId }` — only from Delivered/Closed orders, lines with qtyDelivered>0, frozen at creation
- **Manual invoice** — POST /invoices/manual with custom lines (Admin/Manager only)
- **Credit notes** — create manual invoice with negative unitPrice values
- **Status** — Open | PartiallyPaid | Paid | Cancelled

### Payments
- **Payment entity** — paymentNo (auto `PAY-YY-####`), client FK, clientName snapshot, paymentDate, amount, method, referenceNo, notes
- **PaymentAllocation entity** — payment FK, invoice FK, amount
- **FIFO allocation** — POST /payments `{ clientId, amount }` auto-applies to oldest open invoices first (pessimistic row-level lock)
- **Overpayment** — returns 422 Unprocessable Entity (no partial overpayment)
- **Status recompute** — after each payment, affected invoices updated to Open/PartiallyPaid/Paid

### AR Aging
- **GET /invoices/aging** — single SQL query, buckets: current, 31-60, 61-90, 90+ days; grouped by client
- **GET /invoices/aging.csv** — same data as CSV download

### Order Margin
- **GET /sales-orders/:id** — returns `{ revenue, cost, margin }` where cost uses latest supplier price list (DISTINCT ON CTE)

---

## Phase 5 — Industrialize

**Commit:** `46b9122`

### Health Check
- **GET /health** — now runs `SELECT NOW()` with latency measurement
- Returns `{ status: "ok"|"degraded", db: { up, latencyMs, now?, error? }, ... }`
- 200 always (even when DB is down — status shows "degraded")

### Runbook
- **RUNBOOK.md** — stock drift reconciliation SQL, stuck Puppeteer fix, expired-token handling, backup/restore procedure, deploy notes, env checklist

### Load Sanity Check
- **scripts/load-check.ts** (`pnpm load:check`) — seeds 10× fixture, boots app, measures 9 list endpoints, asserts <300ms each

### CI Enhancements
- **Smoke test** — boots server, waits for readiness, curls `/health`, asserts `db.up: true`
- **Load check** — runs after e2e, verifies list endpoint performance

### Plan Updates
- **ERP-PLAN-V2.md** — Phase 5 checkboxes ticked for runbook, health, load check

---

## Documentation

| File | Description |
|---|---|
| `FRONTEND-HANDOFF.md` | Complete API reference for frontend developers — all endpoints, DTOs, enums, entities, WebSocket events, RBAC matrix, auth flow, Electron notes |
| `DEPLOY-RENDER.md` | Step-by-step Render deployment guide — database setup, web service config, env vars, troubleshooting |
| `RUNBOOK.md` | Operational playbook — health checks, stock drift, Puppeteer, tokens, backups |
| `ERP-PLAN-V2.md` | Master plan — phases, decisions, domain model, testing strategy |
| `ERP-MASTER-PLAN.md` | Original full plan (pre-v2) |

---

## Files changed (summary)

| Category | New files | Modified files |
|---|---|---|
| **Auth & Security** | `guards/roles.guard.ts`, `decorators/roles.decorator.ts` | `auth.service.ts`, `jwt.strategy.ts`, `local.strategy.ts`, `jwt-auth.guard.ts`, `main.ts` |
| **Items** | `item-stock.entity.ts` | `item.entity.ts`, `items.service.ts`, `items.controller.ts`, `create-item.dto.ts`, `search-item.dto.ts` |
| **Stock Engine** | `stock-engine.ts`, `stock-engine.spec.ts` | `inventory.service.ts`, `transaction.entity.ts`, `transactions.service.ts` |
| **Quotations** | `totals.ts`, `totals.spec.ts`, `quotation-revision.entity.ts` | `quotation.entity.ts`, `quotation-detail.entity.ts`, `quotations.service.ts`, `quotation-details.service.ts` |
| **Clients** | `clients/` (controller, service, entity, DTOs, module) | — |
| **Suppliers** | `suppliers/` (controller, service, entity, DTOs, module), `supplier-price-list.entity.ts` | — |
| **Brands** | — | `brand.entity.ts`, `brands.service.ts`, `brands.controller.ts` |
| **Locations** | — | `location.entity.ts`, `locations.service.ts`, `locations.controller.ts` |
| **Sales Orders** | `sales-orders/` (controller, service, entities, DTOs, module) | — |
| **Reservations** | `reservations/` (entity, module) | — |
| **Deliveries** | `deliveries/` (controller, service, entities, DTOs, module) | — |
| **Purchase Orders** | `purchase-orders/` (controller, service, entities, DTOs, module) | — |
| **Finance** | `finance/` (controller, service, entities, DTOs, module) | — |
| **Notifications** | `notification.entity.ts`, `tasks/` (low-stock-digest, quotation-expiry, tasks.module) | `notifications.service.ts`, `notifications.controller.ts` |
| **Audit** | `audit.interceptor.ts` | `audit-log.entity.ts`, `audit-log.service.ts` |
| **Reports** | — | `reports.service.ts`, `reports.controller.ts`, `reports.module.ts` |
| **Dashboard** | — | `dashboard.service.ts`, `dashboard.controller.ts` |
| **WebSocket** | — | `app.gateway.ts`, `events.enum.ts`, `gateway.module.ts` |
| **Users** | — | `user.entity.ts`, `users.service.ts`, `users.controller.ts`, DTOs |
| **Uploads** | — | `uploads.service.ts` (Cloudinary) |
| **Config** | — | `app.config.ts`, `typeorm.config.ts`, `.env.example` |
| **Migrations** | 5 new migrations | `CreateAllTables.ts` (amended) |
| **Seeds** | — | `run-seeds.ts` (locations, demo items, admin) |
| **CI/Testing** | `ci.yml`, `docker-compose.yml`, `load-check.ts`, `rbac-spot-check.ts`, `golden-path.e2e-spec.ts`, `concurrency.e2e-spec.ts`, `app.controller.spec.ts` | `package.json` |
| **Docs** | `FRONTEND-HANDOFF.md`, `DEPLOY-RENDER.md`, `RUNBOOK.md`, `ERP-PLAN-V2.md`, `ERP-MASTER-PLAN.md` | — |

---

## Total: 188 files changed, +13,205 / −965 lines
