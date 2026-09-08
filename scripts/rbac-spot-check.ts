/**
 * RBAC spot-check (Phase 2A): verifies the "Staff" column of the RBAC matrix.
 *
 * Logs in as an admin and a staff user against a running API, then hits every
 * mutating route with the Staff token and asserts the expected status code.
 * Exits non-zero on any mismatch so it can gate CI.
 *
 * Usage:
 *   API_URL=http://localhost:3000/api/v1 \
 *   ADMIN_USERNAME=Admin ADMIN_PASSWORD=<pw> \
 *   STAFF_USERNAME=staff STAFF_PASSWORD=<pw> \
 *   ts-node scripts/rbac-spot-check.ts
 */
import * as crypto from 'node:crypto';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'Admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const STAFF_USERNAME = process.env.STAFF_USERNAME ?? 'staff';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD ?? '';

/** Every mutating route with the response Staff should receive. */
const CHECKS: Array<{
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  expected: number;
}> = [
  // Items: create/edit allowed for Staff, delete is Admin/Manager.
  {
    method: 'POST',
    path: '/items',
    body: {
      code: `RBAC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      description: 'rbac probe',
      unitPrice: '10.00',
    },
    expected: 201,
  },
  { method: 'DELETE', path: '/items/__existing__', expected: 403 },
  // Transactions: transfer/sale/return allowed, adjustment is Admin/Manager.
  {
    method: 'POST',
    path: '/transactions/adjustment',
    body: {
      itemCode: '__none__',
      adjustmentType: 'Increase',
      adjustmentReason: 'NewArrival',
      locationId: 1,
      qty: 1,
    },
    expected: 403,
  },
  // Quotations: create allowed; status update is Admin/Manager.
  {
    method: 'POST',
    path: '/quotations',
    body: {
      clientName: 'Spot Check',
      email: 'spot@example.com',
      currency: 'USD',
    },
    expected: 201,
  },
  {
    method: 'PATCH',
    path: '/quotations/__existing__/status',
    body: { status: 'Sent' },
    expected: 403,
  },
  // Users: create is Admin only.
  {
    method: 'POST',
    path: '/users',
    body: {
      username: 'spotcheck',
      password: 'Spot1234check',
      fullName: 'Spot Check',
    },
    expected: 403,
  },
  // Brands: create allowed, deactivate is Admin/Manager.
  {
    method: 'POST',
    path: '/brands',
    body: { name: `Spot ${crypto.randomBytes(3).toString('hex')}` },
    expected: 403,
  },
  // Locations: create is Admin/Manager only.
  {
    method: 'POST',
    path: '/locations',
    body: { name: 'Spot Location', isPhysical: true },
    expected: 403,
  },
  // Stock-alert config: set is Admin/Manager.
  {
    method: 'PUT',
    path: '/stock-alerts/__existing__',
    body: { threshold: 1 },
    expected: 403,
  },
  // Audit log: read-only for Staff (GET, not mutation) - skip here.
];

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok)
    throw new Error(
      `Login failed for ${username}: ${res.status} ${await res.text()}`,
    );
  const json = (await res.json()) as { data?: { accessToken?: string } };
  const token = json.data?.accessToken;
  if (!token) throw new Error(`No access token for ${username}`);
  return token;
}

async function main(): Promise<void> {
  if (!ADMIN_PASSWORD || !STAFF_PASSWORD)
    throw new Error('ADMIN_PASSWORD and STAFF_PASSWORD env vars are required');

  const adminToken = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
  const staffToken = await login(STAFF_USERNAME, STAFF_PASSWORD);

  // Prepare referents for __existing__ placeholders.
  const itemRes = await fetch(`${API_URL}/items?page=1&limit=1`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const items =
    ((await itemRes.json()) as { data?: Array<{ code: string }> }).data ?? [];
  const existingItemCode = items[0]?.code;

  const quoteRes = await fetch(`${API_URL}/quotations?page=1&limit=1`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const quotes =
    ((await quoteRes.json()) as { data?: Array<{ id: number }> }).data ?? [];
  const existingQuoteId = quotes[0]?.id;

  const alertRes = await fetch(`${API_URL}/stock-alerts`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const alerts =
    (
      (await alertRes.json()) as {
        data?: Array<{ itemId?: number; item?: { id?: number } }>;
      }
    ).data ?? [];
  const existingItemId = alerts[0]?.itemId ?? alerts[0]?.item?.id;

  let failures = 0;
  for (const check of CHECKS) {
    const path = check.path.replace(
      '__existing__',
      check.method === 'DELETE' && existingItemCode
        ? `${existingItemCode}`
        : existingQuoteId
          ? `${existingQuoteId}`
          : existingItemId
            ? `${existingItemId}`
            : '1',
    );
    const res = await fetch(`${API_URL}${path}`, {
      method: check.method,
      headers: {
        authorization: `Bearer ${staffToken}`,
        'content-type': 'application/json',
      },
      body: check.body ? JSON.stringify(check.body) : undefined,
    });
    const ok = res.status === check.expected;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${check.method.padEnd(6)} ${path.padEnd(45)} expected=${check.expected} got=${res.status}`,
    );
    if (!ok) failures += 1;
  }

  if (failures > 0) {
    console.error(`\nRBAC spot-check: ${failures} failure(s).`);
    process.exit(1);
  }
  console.log('\nRBAC spot-check: all checks passed.');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
