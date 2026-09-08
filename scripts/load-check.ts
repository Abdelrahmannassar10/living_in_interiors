/**
 * Load sanity check (Phase 5): seeds a 10x item+stock fixture into the current
 * database, boots the API, and asserts the list endpoints answer < 300ms.
 * Exits non-zero on any slow endpoint.
 *
 * Run: pnpm load:check   (needs a Postgres reachable per DB_* env vars)
 */
import * as bcrypt from 'bcrypt';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import dataSourceConfig from '../src/config/typeorm.config';
import { Role } from '../src/common/enums/role.enum';
import { LocationType } from '../src/common/enums/location-type.enum';
import { Item } from '../src/items/entities/item.entity';
import { ItemStock } from '../src/items/entities/item-stock.entity';
import { Location } from '../src/locations/entities/location.entity';
import { User } from '../src/users/entities/user.entity';

const THRESHOLD_MS = 300;
const MULTIPLIER = 10;

const TEMPLATES: Array<{
  description: string;
  category: string;
  unitPrice: string;
}> = [
  { description: 'Load-check sofa', category: 'Sofas', unitPrice: '2450.00' },
  { description: 'Load-check chair', category: 'Chairs', unitPrice: '890.00' },
  { description: 'Load-check table', category: 'Tables', unitPrice: '1700.00' },
];

const LIST_ENDPOINTS = [
  'items',
  'suppliers',
  'clients',
  'transactions',
  'sales-orders',
  'purchase-orders',
  'invoices',
  'payments',
  'reports/stock-valuation',
];

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??=
  'loadcheck_access_secret_that_is_longer_than_32_chars';
process.env.JWT_REFRESH_SECRET ??=
  'loadcheck_refresh_secret_that_is_longer_than_32_chars';
process.env.DB_LOGGING = 'false';

async function ensureLocations(dataSource: DataSource): Promise<void> {
  const locations = dataSource.getRepository(Location);
  await locations.upsert(
    [
      { name: 'Showroom', type: LocationType.Showroom, isPhysical: true },
      { name: 'Storage 1', type: LocationType.Storage, isPhysical: true },
    ],
    ['name'],
  );
}

async function ensureAdmin(dataSource: DataSource): Promise<void> {
  const users = dataSource.getRepository(User);
  if (!(await users.findOneBy({ username: 'e2e_admin' }))) {
    await users.save(
      users.create({
        username: 'e2e_admin',
        password: await bcrypt.hash('Admin1234test', 12),
        fullName: 'Load Check Admin',
        role: Role.Admin,
        isActive: true,
      }),
    );
  }
}

/** 10x fixture: MULTIPLIER copies of each template, in Showroom + Storage 1. */
async function seedFixture(dataSource: DataSource): Promise<void> {
  const items = dataSource.getRepository(Item);
  const stocks = dataSource.getRepository(ItemStock);
  const locations = await dataSource.getRepository(Location).find();
  const showroom = locations.find((loc) => loc.name === 'Showroom');
  const storage1 = locations.find((loc) => loc.name === 'Storage 1');
  if (!showroom || !storage1)
    throw new Error('Load check requires Showroom and Storage 1 locations');

  const runSuffix = Date.now().toString().slice(-6);
  for (const [templateIndex, template] of TEMPLATES.entries()) {
    for (let copy = 0; copy < MULTIPLIER; copy += 1) {
      const code = `LOAD${runSuffix}-${templateIndex}-${copy}`;
      let item = await items.findOneBy({ code });
      if (!item) {
        item = await items.save(
          items.create({
            code,
            description: template.description,
            category: template.category,
            unitPrice: template.unitPrice,
            currency: 'USD',
            lowStockThreshold: 1,
            isActive: true,
            initialQty: 5,
            qtySold: 0,
          }),
        );
      }
      const rows = [
        { item, location: showroom, qtyOnHand: 3, qtyReserved: 0 },
        { item, location: storage1, qtyOnHand: 2, qtyReserved: 0 },
      ];
      for (const row of rows) {
        await stocks.upsert(row, ['item', 'location']);
      }
    }
  }
}

async function main(): Promise<void> {
  const dataSource = await dataSourceConfig.initialize();
  try {
    await ensureLocations(dataSource);
    await ensureAdmin(dataSource);
    await seedFixture(dataSource);
  } finally {
    await dataSource.destroy();
  }

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app: INestApplication<App> = moduleFixture.createNestApplication();
  await app.init();

  let failures = 0;
  try {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'e2e_admin', password: 'Admin1234test' })
      .expect(201);
    const loginBody = login.body as { data: { accessToken: string } };
    const token = loginBody.data.accessToken;

    for (const endpoint of LIST_ENDPOINTS) {
      const started = Date.now();
      await request(app.getHttpServer())
        .get(`/api/v1/${endpoint}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const ms = Date.now() - started;
      const ok = ms < THRESHOLD_MS;
      if (!ok) failures += 1;
      console.log(
        `${ok ? 'OK  ' : 'SLOW'} ${String(ms).padStart(4)}ms  /${endpoint}`,
      );
    }

    const health = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    const healthBody = health.body as { data?: { db?: { up?: boolean } } };
    console.log(`health: db.up=${healthBody.data?.db?.up === true}`);
  } finally {
    await app.close();
  }

  if (failures > 0) {
    console.error(`${failures} endpoint(s) exceeded ${THRESHOLD_MS}ms`);
    process.exitCode = 1;
  } else {
    console.log('Load sanity check passed.');
  }
}

void main();
