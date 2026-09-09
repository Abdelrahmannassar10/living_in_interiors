# Living In Interior ERP — Frontend Handoff

> **Frozen API** — the backend is feature-complete and committed (`46b9122`). Treat this document as the contract. Any API change requires a new commit from the backend side before the frontend adapts.

> **Updated** — added **RFQ (Request for Quotation)** and **Release Permit** modules (see §6.13, §6.14, §8, §9). Deliveries now require a **Released** release permit.

---

## 0. Quick-start for a desktop developer

```
Backend repo : living_in_interiors-main/
Stack        : NestJS + TypeORM + PostgreSQL 16
Desktop app  : Electron (or Tauri) — your choice, this doc is framework-agnostic
```

### Minimum viable loop

```bash
# 1. Start the backend (needs Postgres running, see .env)
pnpm install && pnpm migration:run && pnpm seed
pnpm start:dev            # → http://localhost:3000

# 2. Open Swagger (all endpoints, ready to click)
open http://localhost:3000/api/docs

# 3. First API call
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"Admin1234test"}'
# → { "success": true, "data": { "accessToken":"...", "refreshToken":"...", "user":{...} } }
```

---

## 1. Environment

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | |
| `API_PREFIX` | `api/v1` | All endpoints below omit this prefix |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` | localhost / 5432 / living_in_interiors / postgres / `""` | |
| `JWT_ACCESS_SECRET` | — | **Required**, ≥ 32 chars |
| `JWT_REFRESH_SECRET` | — | **Required**, ≥ 32 chars |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | |
| `CORS_ALLOW_ALL` | `false` | |
| `ALLOWED_ORIGINS` | `""` | Comma-separated |
| `SEED_ADMIN_PASSWORD` | random | Printed once on first seed |

For local development, set these in a `.env` at the repo root. The seed command creates an `Admin` user and a `Showroom` + `Storage 1` location with demo items.

---

## 2. Conventions

### Base URL

All paths in this document are relative to `http://localhost:3000/api/v1`.

### Authentication

```
Authorization: Bearer <accessToken>
```

Every endpoint **except** `POST /auth/login`, `POST /auth/refresh`, and `GET /health` requires this header.

### Response envelope

Every response is wrapped:

```jsonc
// Single object
{ "success": true, "data": { ... } }

// Array / list
{ "success": true, "data": [ ... ] }

// Paginated list
{ "success": true, "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 } }

// Error
{ "success": false, "statusCode": 400, "message": "Bad Request", "timestamp": "...", "path": "/api/v1/items" }
```

### Pagination

Most list endpoints accept `?page=1&limit=20`. `limit` max is 100.

### Decimal fields

All money fields are **strings** in the API (e.g. `"2450.00"`). Parse to your locale's number format on the client. Never send `2450` as a bare number for money — send `"2450.00"`.

### Enums

All enum values are PascalCase strings (e.g. `"Draft"`, `"Confirmed"`, `"Increase"`).

---

## 3. Auth flow

### Login

```
POST /auth/login
Body: { "username": "Admin", "password": "Admin1234test" }
Response.data: {
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": 1, "username": "Admin", "fullName": "Admin User", "role": "Admin" }
}
```

The `accessToken` is a short-lived JWT. Store it in memory (not localStorage in Electron — use `safeStorage` or `session`).

### Refresh (rotating)

```
POST /auth/refresh
Body: { "refreshToken": "eyJ..." }
Response.data: { "accessToken": "...", "refreshToken": "...", "user": { ... } }
```

The old refresh token is consumed. On error (expired / reused), return to login.

### Logout

```
POST /auth/logout        (requires accessToken)
Response: 200
```

Nullifies the stored refresh token. Call on app close or explicit sign-out.

### JWT payload shape (for decoding, not verification)

```jsonc
{ "sub": 1, "username": "Admin", "role": "Admin", "iat": ..., "exp": ... }
```

---

## 4. Roles & permissions

| Role | Reads | Writes (create/edit) | Deletes | Admin-only | Reports |
|---|---|---|---|---|---|
| **Admin** | everything | everything | everything | user mgmt, adjustments, stock alerts | all |
| **Manager** | everything | everything | items, clients, suppliers, brands | — | all |
| **Staff** | everything | items, clients, suppliers, brands*, quotations, orders, sales, transfers, returns, deliveries, POs* | — | — | — |
| **Viewer** | everything | — | — | — | — |

*Staff cannot: create brands, delete items/clients/suppliers, adjust stock, set stock alerts, create users, update quotation status, confirm/cancel orders, send/close POs, create invoices/payments, view audit logs, approve/release release permits, create release permits.*

Staff-created POs are restricted. Staff can create and edit items, clients, and suppliers, but not delete them.

### RBAC matrix (all mutating routes)

```
Route                                         Admin  Manager  Staff  Viewer
─────────────────────────────────────────────  ─────  ───────  ─────  ──────
POST   /users                                  201    —        403    403
PATCH  /users/:id                              200    —        403    403
DELETE /users/:id                              200    —        403    403
POST   /brands                                 201    201      201    403
PATCH  /brands/:id                             200    200      200    403
DELETE /brands/:id                             200    200      403    403
POST   /clients                                201    201      201    403
PATCH  /clients/:id                            200    200      200    403
DELETE /clients/:id                            200    200      403    403
POST   /items                                  201    201      201    403
PATCH  /items/:code                            200    200      200    403
DELETE /items/:code                            200    200      403    403
POST   /items/:code/photos                     201    201      201    403
DELETE /items/:code/photos/:photoId            200    200      200    403
PATCH  /items/:code/photos/:photoId/primary    200    200      200    403
POST   /suppliers                              201    201      201    403
PATCH  /suppliers/:id                          200    200      200    403
DELETE /suppliers/:id                          200    200      403    403
POST   /locations                              201    201      403    403
PATCH  /locations/:id                          200    200      403    403
POST   /quotations                             201    201      201    403
PATCH  /quotations/:id/status                  200    200      403    403
POST   /quotation-details                      201    201      201    403
PATCH  /quotation-details/:id                  200    200      200    403
DELETE /quotation-details/:id                  200    200      200    403
POST   /sales-orders                           201    201      201    403
POST   /sales-orders/from-quotation/:id        200    200      403    403
POST   /sales-orders/:id/lines                 201    201      201    403
PATCH  /sales-orders/lines/:lineId             200    200      200    403
DELETE /sales-orders/lines/:lineId             200    200      200    403
POST   /sales-orders/:id/confirm               200    200      403    403
POST   /sales-orders/:id/cancel                200    200      403    403
POST   /sales-orders/:id/deliveries            201    201      201    403
POST   /purchase-orders                        201    201      403    403
POST   /purchase-orders/from-suggestions       201    201      403    403
POST   /purchase-orders/:id/send               200    200      403    403
POST   /purchase-orders/:id/cancel             200    200      403    403
POST   /purchase-orders/:id/close              200    200      403    403
POST   /purchase-orders/:id/goods-receipts     201    201      403    403
POST   /purchase-orders/:id/return-to-supplier 201    201      403    403
POST   /transactions/transfer                  201    201      201    403
POST   /transactions/sale                      201    201      201    403
POST   /transactions/return                    201    201      201    403
POST   /transactions/adjustment                201    201      403    403
POST   /rfqs                                   201    201      201    403
PATCH  /rfqs/:id                               200    200      200    403
PATCH  /rfqs/:id/status                        200    200      403    403
POST   /rfqs/lines                             201    201      201    403
PATCH  /rfqs/lines/:lineId                     200    200      200    403
DELETE /rfqs/lines/:lineId                     200    200      200    403
POST   /release-permits                        201    201      403    403
PATCH  /release-permits/:id/status             200    200      403    403
POST   /release-permits/:id/lines              201    201      403    403
DELETE /release-permits/:id/lines/:lineId      200    200      403    403
POST   /invoices                               201    201      403    403
POST   /invoices/manual                        201    201      403    403
POST   /payments                               201    201      403    403
PATCH  /stock-alerts/:itemId                   200    200      403    403
```

Viewer gets 403 on every POST/PATCH/PUT/DELETE. Admin bypasses all role checks.

---

## 5. All enums

```typescript
// Roles
"Admin" | "Manager" | "Staff" | "Viewer"

// Quotation status
"Draft" | "Sent" | "Approved" | "Rejected" | "Cancelled" | "Expired" | "Converted"

// Sales order status
"Draft" | "Confirmed" | "Delivered" | "Closed" | "Cancelled"

// Purchase order status
"Draft" | "Sent" | "PartiallyReceived" | "Received" | "Closed" | "Cancelled"

// RFQ status
"Draft" | "Sent" | "Received" | "Awarded" | "Cancelled"

// Release permit status
"Draft" | "Approved" | "Released" | "Cancelled"

// Invoice status
"Open" | "PartiallyPaid" | "Paid" | "Cancelled"

// Transaction type
"Transfer" | "Sale" | "Return" | "Adjustment"

// Adjustment type
"Increase" | "Decrease"

// Adjustment reason
"NewArrival" | "Damage" | "CountCorrection" | "CustomerReturn" | "SupplierReturn"

// Location type
"Showroom" | "Storage" | "Client" | "Transit"
```

---

## 6. API reference — all endpoints

### 6.0 Health

```
GET  /health                              (Public — no auth)
Response.data: {
  "status": "ok" | "degraded",
  "company": "Living In interiors",
  "version": "0.0.1",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "uptime": 123,
  "db": { "up": true, "latencyMs": 4, "now": "...", "error": "..." }
}
```

### 6.1 Auth

| Method | Path | Auth | Body |
|---|---|---|---|
| `POST` | `/auth/login` | Public | `{ username, password }` → `{ accessToken, refreshToken, user }` |
| `POST` | `/auth/refresh` | Public | `{ refreshToken }` → `{ accessToken, refreshToken, user }` |
| `POST` | `/auth/logout` | Bearer | — |

### 6.2 Users

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/users?page=1&limit=20` | Admin, Manager | — |
| `GET` | `/users/:id` | Admin, Manager | — |
| `POST` | `/users` | Admin | `{ username, password, fullName, role?, isActive? }` |
| `PATCH` | `/users/:id` | Admin | `{ username?, password?, fullName?, role?, isActive? }` |
| `PATCH` | `/users/:id/password` | Bearer (self only) | `{ currentPassword, newPassword }` |

**Password policy:** ≥ 8 chars, ≥ 1 letter, ≥ 1 digit.

### 6.3 Brands

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/brands?search=` | Bearer | — |
| `GET` | `/brands/:id` | Bearer | — |
| `POST` | `/brands` | Staff+ | `{ name, country?, website?, notes? }` |
| `PATCH` | `/brands/:id` | Staff+ | same fields, all optional |
| `DELETE` | `/brands/:id` | Manager+ | — |

### 6.4 Clients

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/clients?search=` | Bearer | — |
| `GET` | `/clients/:id` | Bearer | — |
| `GET` | `/clients/:id/history` | Bearer | — |
| `POST` | `/clients` | Staff+ | `{ name, type?, contactPerson?, phone?, email?, address?, city?, country?, notes? }` |
| `PATCH` | `/clients/:id` | Staff+ | same + `isActive?` |
| `DELETE` | `/clients/:id` | Manager+ | — |

### 6.5 Items

| Method | Path | Auth | Body / Params |
|---|---|---|---|
| `GET` | `/items?q=&brand=&category=&inStock=&sortBy=code&sortOrder=ASC&page=1&limit=20` | Bearer | `sortBy`: `code` \| `unitPrice` \| `brand` |
| `GET` | `/items/low-stock` | Bearer | items where `qtyOnHand ≤ threshold` |
| `GET` | `/items/:code` | Bearer | — |
| `GET` | `/items/:code/stock` | Bearer | returns `[{ location, qtyOnHand, qtyReserved }]` |
| `POST` | `/items` | Staff+ | `{ code, description?, brandId?, dimension?, finishFabric?, category?, subCategory?, initialQty?, initialLocationId?, unitPrice?, currency?, lowStockThreshold?, notes? }` |
| `PATCH` | `/items/:code` | Staff+ | same minus `code`, `initialQty`, `initialLocationId` |
| `DELETE` | `/items/:code` | Manager+ | — |
| `POST` | `/items/:code/photos` | Staff+ | `multipart/form-data` field `file` (max 10MB, `image/*`) |
| `DELETE` | `/items/:code/photos/:photoId` | Staff+ | — |
| `PATCH` | `/items/:code/photos/:photoId/primary` | Staff+ | — |

**Note:** `code` is trimmed and uppercased automatically. `unitPrice` is a decimal string (`"2450.00"`).

### 6.6 Suppliers

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/suppliers?search=` | Bearer | — |
| `GET` | `/suppliers/:id` | Bearer | — |
| `POST` | `/suppliers` | Staff+ | `{ name, brandId?, contactPerson?, phone?, email?, website?, country?, paymentTerms?, notes?, isActive? }` |
| `PATCH` | `/suppliers/:id` | Staff+ | same, all optional |
| `DELETE` | `/suppliers/:id` | Manager+ | — (soft-deactivate) |

### 6.7 Locations

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/locations` | Bearer | — |
| `GET` | `/locations/:id` | Bearer | — |
| `POST` | `/locations` | Manager+ | `{ name, type?: "Showroom"|"Storage"|"Client"|"Transit", isPhysical?, notes? }` |
| `PATCH` | `/locations/:id` | Manager+ | same, all optional |

### 6.8 Quotations

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/quotations?page=1&limit=20` | Bearer | — |
| `GET` | `/quotations/:id` | Bearer | — (includes `details` relation) |
| `GET` | `/quotations/:id/totals` | Bearer | computed `{ subtotal, discountTotal, net, vat, grandTotal, currency }` |
| `POST` | `/quotations` | Staff+ | `{ clientId?, clientName?, projectName?, contactPerson?, phone?, email?, notes?, internalNotes?, validUntil?, discountGlobal?, vatPercent?, currency? }` |
| `PATCH` | `/quotations/:id/status` | Manager+ | `{ status: "Sent"|"Approved"|"Rejected"|"Cancelled"|"Expired" }` |

**Workflow:** `Draft` → `Sent` → `Approved` → `Converted` (when order created from it). Also: `Draft` → `Rejected` or `Cancelled` or `Expired`.

### 6.9 Quotation Details (line items)

| Method | Path | Auth | Body |
|---|---|---|---|
| `POST` | `/quotation-details` | Staff+ | `{ quotationId, itemCode, qty, unitPrice?, discountPercent?, notes? }` |
| `PATCH` | `/quotation-details/:id` | Staff+ | `{ qty?, unitPrice?, discountPercent?, notes? }` |
| `DELETE` | `/quotation-details/:id` | Staff+ | — (soft-delete, sets `isDeleted = true`) |

The item snapshot (`codeSnapshot`, `descriptionSnapshot`, `brandSnapshot`, `photoUrlSnapshot`, `dimensionSnapshot`, `finishFabricSnapshot`) is captured at line creation time and frozen.

### 6.10 Sales Orders

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/sales-orders` | Bearer | — |
| `GET` | `/sales-orders/:id` | Bearer | — (includes `lines`, `reservations`, `deliveries`) |
| `POST` | `/sales-orders` | Staff+ | `{ clientId?, clientName?, contactPerson?, phone?, email?, expectedDeliveryDate?, discountGlobal?, vatPercent?, currency?, notes?, internalNotes? }` |
| `POST` | `/sales-orders/from-quotation/:quotationId` | Manager+ | — (creates order from approved quotation) |
| `POST` | `/sales-orders/:id/lines` | Staff+ | `{ itemCode, qty, unitPrice?, discountPercent?, notes? }` |
| `PATCH` | `/sales-orders/lines/:lineId` | Staff+ | `{ itemCode?, qty?, unitPrice?, discountPercent?, notes? }` |
| `DELETE` | `/sales-orders/lines/:lineId` | Staff+ | — |
| `POST` | `/sales-orders/:id/confirm` | Manager+ | — (reserves stock, `Draft` → `Confirmed`) |
| `POST` | `/sales-orders/:id/cancel` | Manager+ | — (releases reservations, requires `Draft` or `Confirmed`) |
| `POST` | `/sales-orders/:id/deliveries` | Staff+ | `{ lines: [{ salesOrderLineId, qty }], deliveredAt?, notes? }` (creates delivery, auto-`Closed` when fully delivered; **requires a Released release permit** per line) |

**Status machine:**
```
Draft → Confirmed → Delivered → Closed
  ↘       ↘            ↘
    Cancelled       Cancelled
```
- `confirm`: reserves stock (showroom-first). Sets `shortage = true` on lines that couldn't be fully reserved.
- `deliver`: stock leaves showroom, `qtyDelivered` accumulates on lines. **Requires a Released release permit.** Auto-`Close` when all lines fully delivered.
- `cancel`: releases reservations. Allowed only from `Draft` or `Confirmed`.
- **Line edits blocked once invoiced** (structural — invoice requires Delivered/Closed, line edits require Draft).

### 6.11 Purchase Orders

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/purchase-orders/suggestions` | Bearer | low-stock items with latest supplier cost |
| `POST` | `/purchase-orders/from-suggestions` | Manager+ | `{ itemIds?, supplierId?, expectedDate?, notes? }` |
| `GET` | `/purchase-orders` | Bearer | — |
| `GET` | `/purchase-orders/:id` | Bearer | — (includes `lines`, `receipts`) |
| `POST` | `/purchase-orders` | Manager+ | `{ supplierId, expectedDate?, currency?, notes?, lines: [{ itemCode, qty, unitCost? }] }` |
| `POST` | `/purchase-orders/:id/send` | Manager+ | — (`Draft` → `Sent`) |
| `POST` | `/purchase-orders/:id/cancel` | Manager+ | — (`Draft` or `Sent` only) |
| `POST` | `/purchase-orders/:id/close` | Manager+ | — (manual close) |
| `POST` | `/purchase-orders/:id/goods-receipts` | Manager+ | `{ lines: [{ lineId, qty, toLocationId }], receivedAt?, notes? }` |
| `POST` | `/purchase-orders/:id/return-to-supplier` | Manager+ | `{ lines: [{ lineId, qty, fromLocationId }], notes? }` |
| `GET` | `/goods-receipts` | Bearer | — |

**Status machine:**
```
Draft → Sent → PartiallyReceived → Received → Closed
  ↘       ↘          ↘
    Cancelled
```

**Line uniqueness:** each item can appear only once per PO.

### 6.12 Transactions (stock movements)

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/transactions?type=&itemCode=&page=1&limit=20` | Bearer | `type`: `Transfer` \| `Sale` \| `Return` \| `Adjustment` |
| `GET` | `/transactions/:id` | Bearer | — |
| `POST` | `/transactions/transfer` | Staff+ | `{ itemCode, fromLocationId, toLocationId, qty, referenceNo?, notes? }` |
| `POST` | `/transactions/sale` | Staff+ | `{ itemCode, fromLocationId, qty, customerName, referenceNo?, salesOrderId?, notes? }` |
| `POST` | `/transactions/return` | Staff+ | `{ itemCode, toLocationId, qty, customerName, referenceNo?, notes? }` |
| `POST` | `/transactions/adjustment` | Manager+ | `{ itemCode, adjustmentType: "Increase"|"Decrease", adjustmentReason: "NewArrival"|"Damage"|"CountCorrection"|"CustomerReturn"|"SupplierReturn", locationId, qty, notes? }` |

### 6.13 RFQ (Request for Quotation)

Solicits price quotes from suppliers for specific items. Links to an existing supplier and client. Line items hold the requested quantity plus a free-form description.

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/rfqs?page=1&limit=20` | Bearer | — |
| `GET` | `/rfqs/:id` | Bearer | — (includes `supplier`, `client`, `lines`) |
| `POST` | `/rfqs` | Staff+ | `{ supplierId?, clientId?, clientName?, contactPerson?, phone?, email?, validUntil?, notes?, internalNotes?, currency? }` |
| `PATCH` | `/rfqs/:id` | Staff+ | same as create, all optional (Draft only) |
| `PATCH` | `/rfqs/:id/status` | Manager+ | `{ status: "Sent"\|"Received"\|"Awarded"\|"Cancelled" }` |
| `POST` | `/rfqs/lines` | Staff+ | `{ rfqId, itemCode, qty, description? }` |
| `PATCH` | `/rfqs/lines/:lineId` | Staff+ | `{ qty?, description?, unitPrice?, leadTimeDays? }` (Draft only) |
| `DELETE` | `/rfqs/lines/:lineId` | Staff+ | — (soft-delete, Draft only) |

**Workflow:** `Draft` → `Sent` → `Received` → `Awarded`. Cancellable from `Draft`, `Sent`, or `Received`. Supplier quote (`unitPrice`, `leadTimeDays`) is captured on lines once received.

**RFQ number:** auto-generated `RFQ#0001-<YY>` (4-digit sequential per year). Importable to a PO later as a purchasing reference.

### 6.14 Release Permits

Authorizes dispatch of goods from the sales order for delivery. A delivery **cannot be created** unless the order has a **Released** permit covering every line's delivered quantity.

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/release-permits?page=1&limit=20` | Bearer | — |
| `GET` | `/release-permits/:id` | Bearer | — (includes `salesOrder`, `lines`, approver/releaser) |
| `POST` | `/release-permits` | Manager+ | `{ salesOrderId, lines: [{ salesOrderLineId, qty }], notes?, internalNotes? }` |
| `PATCH` | `/release-permits/:id/status` | Manager+ | `{ status: "Approved"\|"Released"\|"Cancelled" }` |
| `POST` | `/release-permits/:id/lines` | Manager+ | `{ salesOrderLineId, qty }` (Draft only) |
| `DELETE` | `/release-permits/:id/lines/:lineId` | Manager+ | — (Draft only) |

**Workflow:** `Draft` → `Approved` → `Released`. Cancellable from `Draft` or `Approved`. Approving records `approvedBy`/`approvedAt`; releasing records `releasedBy`/`releasedAt`. `status: "Released"` must be present before `POST /sales-orders/:id/deliveries` succeeds (per order line, summed across all non-cancelled permits).

**Permit number:** auto-generated `RP-<YY>-####`.

### 6.15 Deliveries

| Method | Path | Auth |
|---|---|---|
| `GET` | `/deliveries` | Bearer |
| `GET` | `/deliveries/:id` | Bearer |

(Deliveries are created via `POST /sales-orders/:id/deliveries`.)

**Release permit requirement:** before a delivery is accepted, every order line's delivered quantity must be covered by a **Released** release permit (see §6.14). Otherwise the request returns `400`.

### 6.16 Invoices

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/invoices/aging` | Bearer | AR aging rows `[{ clientId, clientName, currency, open, current, d31_60, d61_90, d90Plus, grandTotal }]` |
| `GET` | `/invoices/aging.csv` | Bearer | Same data as CSV text |
| `GET` | `/invoices` | Bearer | — |
| `POST` | `/invoices` | Manager+ | `{ salesOrderId }` (from Delivered/Closed order) |
| `POST` | `/invoices/manual` | Manager+ | `{ clientId?, clientName?, invoiceDate?, lines: [{ itemCode?, description?, qty, unitPrice, discountPercent? }], discountGlobalPercent?, vatPercent?, currency?, notes? }` |
| `GET` | `/invoices/:id` | Bearer | — (includes `lines`, `allocations`) |

**Credit notes:** create a manual invoice with negative `unitPrice` values.

**Invoice number:** auto-generated `INV-<YY>-####` (sequential per year).

### 6.17 Payments

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/payments?clientId=` | Bearer | — |
| `POST` | `/payments` | Manager+ | `{ clientId, amount, paymentDate?, method?, referenceNo?, notes? }` |

**FIFO allocation:** payment is automatically applied to the client's oldest open invoices first. Overpayment (amount exceeds total open balance) returns **422 Unprocessable Entity**.

**Payment number:** auto-generated `PAY-<YY>-####`.

### 6.18 Dashboard

| Method | Path | Auth | Response shape |
|---|---|---|---|
| `GET` | `/dashboard/summary` | Bearer | `{ totalItems, totalActiveItems, totalQuotations, totalClients, lowStockCount, totalInventoryValue }` |
| `GET` | `/dashboard/recent-transactions` | Bearer | last 10 transactions with `item`, `fromLocation`, `toLocation` |

### 6.19 Reports

| Method | Path | Auth | Response |
|---|---|---|---|
| `GET` | `/reports/quotation/:id/pdf` | Bearer | PDF binary (`Content-Type: application/pdf`) |
| `GET` | `/reports/rfq/:id/pdf` | Bearer | PDF binary (`Content-Type: application/pdf`) — RFQ summary |
| `GET` | `/reports/stock-valuation` | Bearer | `{ lines: [{ itemCode, description, locations: [{ location, qtyOnHand, unitCost, value }], totalValue }], grandTotal }` |

### 6.20 Stock Alerts

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/stock-alerts` | Bearer | all alert configs with `item` relation |
| `GET` | `/stock-alerts/:itemId` | Bearer | — |
| `PUT` | `/stock-alerts/:itemId` | Manager+ | `{ threshold: number, isEnabled: boolean }` |

### 6.21 Notifications

| Method | Path | Auth | Body |
|---|---|---|---|
| `GET` | `/notifications` | Bearer | current user's inbox |
| `PATCH` | `/notifications/:id/read` | Bearer | — |
| `POST` | `/notifications/quotations/:id/send-email` | Bearer | `{ email }` |
| `POST` | `/notifications/quotations/:id/test-email` | Bearer | `{ email }` |

### 6.22 Audit Logs

| Method | Path | Auth |
|---|---|---|
| `GET` | `/audit-logs?page=1&limit=20` | Manager+ |
| `GET` | `/audit-logs/:entity/:id` | Manager+ |

---

## 7. WebSocket events

Connect via Socket.IO with the access token:

```typescript
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000', {
  auth: { token: accessToken }   // or: extraHeaders: { Authorization: `Bearer ${accessToken}` }
});
```

### Events received

| Event | Room | Payload |
|---|---|---|
| `connected` | self | `{ message }` |
| `stock:updated` | `item:<code>` | `{ itemCode, stock }` |
| `stock:alert` | broadcast | `{ itemCode, description, totalQty, threshold }` |
| `transaction:created` | broadcast | `{ transactionId, type, itemCode, qty }` |
| `quotation:created` | broadcast | quotation object |
| `quotation:updated` | broadcast | quotation object |
| `quotation:status` | broadcast | `{ id, status }` |
| `item:created` | broadcast | item object |
| `item:updated` | broadcast | item object |
| `notification:created` | `user:<userId>` | notification object |

Sockets auto-join `role:<role>` and `user:<userId>` rooms on connect.

---

## 8. Data model — key entities

### Client

```
id: number
name: string
type: string (default "Individual")
contactPerson: string | null
phone: string | null
email: string | null
address: string | null
city: string | null
country: string (default "Egypt")
notes: string | null
isActive: boolean (default true)
createdBy: { id, username, fullName, role } | null
createdAt: Date
updatedAt: Date
```

### Item

```
id: number
code: string (unique, uppercase)
description: string | null
dimension: string | null
finishFabric: string | null
category: string | null
subCategory: string | null
brand: { id, name, country, ... } | null
unitPrice: string | null (decimal)
currency: string (default "USD")
lowStockThreshold: number (default 1)
initialQty: number
qtySold: number
isActive: boolean
notes: string | null
photos: [{ id, fileUrl, thumbnailUrl, isPrimary, sortOrder, ... }]
createdBy: { id, username, ... } | null
createdAt: Date
updatedAt: Date
```

### ItemStock (from `GET /items/:code/stock`)

```
{ location: { id, name, type }, qtyOnHand: number, qtyReserved: number }
```

### Brand

```
id: number
name: string (unique)
country: string | null
logoUrl: string | null
website: string | null
notes: string | null
isActive: boolean
createdBy: { id, ... } | null
```

### Supplier

```
id: number
name: string
brand: { id, name, ... } | null
contactPerson: string | null
phone: string | null
email: string | null
website: string | null
country: string | null
paymentTerms: string | null
notes: string | null
isActive: boolean
createdBy: { id, ... } | null
```

### Location

```
id: number
name: string (unique)
type: "Showroom" | "Storage" | "Client" | "Transit" | null
isPhysical: boolean (default true)
notes: string | null
```

### Quotation

```
id: number
quoteNo: string (unique, e.g. "QUO-25-0001")
quoteDate: string (date)
client: { id, ... } | null
clientName: string | null
projectName: string | null
contactPerson: string | null
phone: string | null
email: string | null
notes: string | null
internalNotes: string | null
status: "Draft" | "Sent" | "Approved" | "Rejected" | "Cancelled" | "Expired" | "Converted"
revision: number
validUntil: string | null (date)
discountGlobal: string (decimal, default "0")
vatPercent: string (decimal, default "0")
currency: string (default "USD")
details: QuotationDetail[]   ← loaded on GET :id
createdBy: { id, ... } | null
```

### QuotationDetail (line item)

```
id: number
sortOrder: number
item: { id, code, ... } | null
brandSnapshot: string | null
codeSnapshot: string | null
descriptionSnapshot: string | null
dimensionSnapshot: string | null
finishFabricSnapshot: string | null
photoUrlSnapshot: string | null
qty: number
unitPrice: string (decimal)
currency: string (default "USD")
discountPercent: string (decimal, default "0")
discountAmount: string (decimal)
totalPrice: string (decimal)
totalPriceAfterDiscount: string (decimal)
notes: string | null
isDeleted: boolean (soft-delete)
```

### SalesOrder

```
id: number
orderNo: string (unique, e.g. "ORD-25-0001")
orderDate: string (date)
client: { id, ... } | null
clientName: string | null
contactPerson: string | null
phone: string | null
email: string | null
quotation: { id, quoteNo, ... } | null
status: "Draft" | "Confirmed" | "Delivered" | "Closed" | "Cancelled"
expectedDeliveryDate: string | null (date)
discountGlobal: string (decimal)
vatPercent: string (decimal)
currency: string (default "USD")
notes: string | null
internalNotes: string | null
lines: SalesOrderLine[]   ← loaded on GET :id
reservations: Reservation[]   ← loaded on GET :id
deliveries: Delivery[]   ← loaded on GET :id
margin: { revenue: number, cost: number, margin: number } | undefined  ← only on GET :id
createdBy: { id, ... } | null
```

### SalesOrderLine

```
id: number
sortOrder: number
item: { id, code, ... } | null
codeSnapshot: string | null
descriptionSnapshot: string | null
brandSnapshot: string | null
qty: number
qtyDelivered: number
shortage: boolean
unitPrice: string (decimal)
currency: string (default "USD")
discountPercent: string (decimal)
totalPrice: string (decimal)
totalPriceAfterDiscount: string (decimal)
notes: string | null
```

### Reservation

```
id: number
salesOrder: { id, orderNo, ... }
item: { id, code, ... }
location: { id, name, type, ... }
qty: number
```

### Delivery

```
id: number
deliveryNo: string (unique, e.g. "DEL-25-0001")
salesOrder: { id, orderNo, ... }
deliveredAt: string (date)
notes: string | null
pdfPath: string | null
lines: DeliveryLine[]
createdBy: { id, ... } | null
```

### DeliveryLine

```
id: number
item: { id, code, ... } | null
codeSnapshot: string | null
descriptionSnapshot: string | null
salesOrderLineId: number | null
qty: number
```

### PurchaseOrder

```
id: number
purchaseNo: string (unique, e.g. "PO-25-0001")
supplier: { id, name, ... } | null
orderDate: string (date)
expectedDate: string | null (date)
status: "Draft" | "Sent" | "PartiallyReceived" | "Received" | "Closed" | "Cancelled"
currency: string (default "USD")
notes: string | null
lines: PurchaseOrderLine[]   ← loaded on GET :id
receipts: GoodsReceipt[]   ← loaded on GET :id
createdBy: { id, ... } | null
```

### PurchaseOrderLine

```
id: number
item: { id, code, description, ... }
qty: number
receivedQty: number
unitCost: string | null (decimal)
```

### GoodsReceipt

```
id: number
receiptNo: string (unique)
purchaseOrder: { id, purchaseNo, ... }
receivedAt: string (date)
notes: string | null
lines: GoodsReceiptLine[]
createdBy: { id, ... } | null
```

### GoodsReceiptLine

```
id: number
item: { id, code, ... }
qty: number
unitCost: string (decimal)
```

### Rfq (Request for Quotation)

```
id: number
rfqNo: string (unique, e.g. "RFQ#0001-26")
rfqDate: string (date)
supplier: { id, name, ... } | null
client: { id, name, ... } | null
clientName: string | null
contactPerson: string | null
phone: string | null
email: string | null
status: "Draft" | "Sent" | "Received" | "Awarded" | "Cancelled"
validUntil: string | null (date)
notes: string | null
internalNotes: string | null
currency: string (default "USD")
lines: RfqLine[]   ← loaded on GET :id
createdBy: { id, ... } | null
```

### RfqLine

```
id: number
sortOrder: number
item: { id, code, ... } | null
codeSnapshot: string | null
descriptionSnapshot: string | null
qty: number
description: string | null   (free-form request details)
unitPrice: string | null (decimal, supplier quote)
leadTimeDays: number | null   (supplier lead time)
isDeleted: boolean (soft-delete)
```

### ReleasePermit

```
id: number
permitNo: string (unique, e.g. "RP-26-0001")
permitDate: string (date)
salesOrder: { id, orderNo, ... }
status: "Draft" | "Approved" | "Released" | "Cancelled"
notes: string | null
internalNotes: string | null
approvedBy: { id, ... } | null
approvedAt: Date | null
releasedBy: { id, ... } | null
releasedAt: Date | null
lines: ReleasePermitLine[]   ← loaded on GET :id
createdBy: { id, ... } | null
```

### ReleasePermitLine

```
id: number
salesOrderLine: { id, ... }
item: { id, code, ... } | null
codeSnapshot: string | null
descriptionSnapshot: string | null
qty: number
```

### Invoice

```
id: number
invoiceNo: string (unique, e.g. "INV-25-0001")
client: { id, ... } | null
clientName: string | null
salesOrder: { id, orderNo, ... } | null
invoiceDate: string (date)
status: "Open" | "PartiallyPaid" | "Paid" | "Cancelled"
currency: string (default "USD")
subtotal: string (decimal)
discountGlobal: string (decimal)
vatPercent: string (decimal)
total: string (decimal)
notes: string | null
lines: InvoiceLine[]   ← loaded on GET :id
allocations: PaymentAllocation[]   ← loaded on GET :id
createdBy: { id, ... } | null
```

### InvoiceLine

```
id: number
item: { id, code, ... } | null
codeSnapshot: string | null
descriptionSnapshot: string | null
qty: number
unitPrice: string (decimal)
discountPercent: string (decimal, default "0")
totalPrice: string (decimal)
```

### Payment

```
id: number
paymentNo: string (unique, e.g. "PAY-25-0001")
client: { id, ... } | null
clientName: string | null
paymentDate: string (date)
amount: string (decimal)
method: string | null
referenceNo: string | null
notes: string | null
allocations: PaymentAllocation[]   ← loaded on GET (via invoice detail)
createdBy: { id, ... } | null
```

### PaymentAllocation

```
id: number
payment: { id, paymentNo, ... }
invoice: { id, invoiceNo, ... }
amount: string (decimal)
```

### Transaction

```
id: number
transactionDate: Date
item: { id, code, description, ... }
transactionType: "Transfer" | "Sale" | "Return" | "Adjustment"
adjustmentType: "Increase" | "Decrease" | null
adjustmentReason: "NewArrival" | "Damage" | "CountCorrection" | "CustomerReturn" | "SupplierReturn" | null
fromLocation: { id, name, ... } | null
toLocation: { id, name, ... } | null
qty: number
customerName: string | null
referenceNo: string | null
notes: string | null
salesOrderId: number | null
purchaseOrderId: number | null
stockBefore: Record<string, { onHand: number, reserved: number }> | null
stockAfter: Record<string, { onHand: number, reserved: number }> | null
createdBy: { id, ... } | null
```

### Notification

```
id: number
user: { id, ... } | null
type: string
payload: Record<string, unknown> | null
readAt: Date | null
```

### AuditLog

```
id: string (bigint)
userId: number | null
userName: string | null
action: string
entity: string
entityId: string | null
oldValues: Record<string, unknown> | null
newValues: Record<string, unknown> | null
changedFields: string[] | null
ipAddress: string | null
userAgent: string | null
```

---

## 9. Common workflows (UI guidance)

### Create a quotation → convert to order → release → deliver → invoice → payment

```
1. POST /quotations                           → creates Draft quotation
2. POST /quotation-details  (repeat N times)  → adds lines (each captures item snapshot)
3. PATCH /quotations/:id/status { status: "Sent" }
4. PATCH /quotations/:id/status { status: "Approved" }
5. POST /sales-orders/from-quotation/:id      → creates Draft order (lines copied from quotation)
6. POST /sales-orders/:id/confirm             → reserves stock, Confirmed
7. POST /release-permits { salesOrderId, lines: [{ salesOrderLineId, qty }] } → Draft permit
8. PATCH /release-permits/:id/status { status: "Approved" }
9. PATCH /release-permits/:id/status { status: "Released" }
10. POST /sales-orders/:id/deliveries         → creates delivery (stock decreases, auto-Close if complete)
11. POST /invoices { salesOrderId }           → creates invoice from Delivered/Closed order
12. POST /payments { clientId, amount }       → FIFO-allocates to oldest open invoice
```

### Request a supplier quote (RFQ)

```
1. POST /rfqs                                 → creates Draft RFQ (supplier, client)
2. POST /rfqs/lines  (repeat N times)         → adds requested item + qty + description
3. PATCH /rfqs/:id/status { status: "Sent" }  → supplier invited to quote
4. PATCH /rfqs/lines/:lineId  (as needed)     → record supplier unitPrice / leadTimeDays
5. PATCH /rfqs/:id/status { status: "Received" }
6. PATCH /rfqs/:id/status { status: "Awarded" } → winning quote selected, workflow closed
```

### Receive goods from supplier

```
1. GET  /purchase-orders/suggestions          → low-stock items with latest cost
2. POST /purchase-orders/from-suggestions     → creates Draft PO
3. POST /purchase-orders/:id/send             → Sent
4. POST /purchase-orders/:id/goods-receipts   → stock increases, unit cost updates supplier price list
```

### Walk-in sale (no order)

```
POST /transactions/sale { itemCode, fromLocationId, qty, customerName }
```

### Stock adjustment (count correction)

```
POST /transactions/adjustment {
  itemCode: "SOFA-AURORA",
  adjustmentType: "Increase",
  adjustmentReason: "CountCorrection",
  locationId: 1,
  qty: 2
}
```

### Credit note

```
POST /invoices/manual {
  clientId: 1,
  lines: [{ description: "Credit note", qty: 1, unitPrice: "-500.00" }]
}
```

---

## 10. Electron-specific notes

### IPC bridge for auth tokens

Don't store JWTs in `localStorage` (XSS risk). Use Electron's `safeStorage` or `session.defaultSession.cookies`:

```typescript
// Main process
import { safeStorage } from 'electron';
safeStorage.encryptString(accessToken);

// Renderer → IPC
ipcRenderer.invoke('auth:store-token', accessToken);
```

### CORS

If the Electron app loads from `file://`, set `CORS_ALLOW_ALL=true` during development, or set `ALLOWED_ORIGINS=file://`.

### Puppeteer / PDFs

The quotation and RFQ PDF endpoints (`GET /reports/quotation/:id/pdf`, `GET /reports/rfq/:id/pdf`) render server-side with Puppeteer. The desktop app just downloads the PDF binary — no local Chrome needed.

---

## 11. Error handling cheat-sheet

| Status | Meaning | When |
|---|---|---|
| `400` | Bad Request | Validation failure (missing required field, bad enum value) |
| `401` | Unauthorized | No token, expired token, or inactive user |
| `403` | Forbidden | Valid token but insufficient role |
| `404` | Not Found | Entity doesn't exist |
| `409` | Conflict | Duplicate (unique constraint: item code, quotation number, etc.) |
| `422` | Unprocessable Entity | Business rule violation (e.g. overpayment, insufficient stock) |
| `429` | Too Many Requests | Rate limit hit (100 req/60s per IP) |

The error response body is always:
```json
{
  "success": false,
  "statusCode": 422,
  "message": "Overpayment: available balance is 550.00 but amount is 1000.00",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "path": "/api/v1/payments"
}
```
