import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { User } from './../src/users/entities/user.entity';
import { Item } from './../src/items/entities/item.entity';
import { Location } from './../src/locations/entities/location.entity';
import { LocationType } from './../src/common/enums/location-type.enum';
import { Role } from './../src/common/enums/role.enum';

/**
 * Concurrency tests (Phase 2A) — the two race conditions the stock refactor
 * and race-free numbering were built to solve. Runs against a migrated dev DB.
 */
describe('Concurrency (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;

  const api = '/api/v1';
  const TEST_CODE = 'CHAIR-RACE';
  const PASSWORD = 'Admin1234test';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'e2e_access_secret_that_is_longer_than_32_chars';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'e2e_refresh_secret_that_is_longer_than_32_chars';
    process.env.DB_LOGGING = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    dataSource = app.get(DataSource);

    const locationRepo = dataSource.getRepository(Location);
    if (!(await locationRepo.findOneBy({ name: 'Showroom' }))) {
      await locationRepo.save(locationRepo.create({ name: 'Showroom', type: LocationType.Showroom, isPhysical: true }));
    }

    // Reuse a real bcrypt hash so the login path works.
    const realHash = await bcrypt.hash(PASSWORD, 12);
    const userRepo = dataSource.getRepository(User);
    const admin = await userRepo.findOneBy({ username: 'race_admin' });
    if (!admin) {
      await userRepo.save(userRepo.create({ username: 'race_admin', password: realHash, fullName: 'Race Admin', role: Role.Admin, isActive: true }));
    }

    // Reset the race item.
    await dataSource.getRepository(Item).delete({ code: TEST_CODE });

    await app.init();

    const login = await request(app.getHttpServer()).post(`${api}/auth/login`).send({ username: 'race_admin', password: PASSWORD }).expect(201);
    adminToken = login.body.data.accessToken;
  }, 60000);

  it('parallel sales of the last unit do not oversell', async () => {
    // Create an item with exactly 1 unit at the showroom.
    await request(app.getHttpServer())
      .post(`${api}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: TEST_CODE, description: 'Race chair', unitPrice: '100.00', initialQty: 1, initialLocationId: 1 })
      .expect(201);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post(`${api}/transactions/sale`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ itemCode: TEST_CODE, fromLocationId: 1, qty: 1, customerName: 'Race Buyer' }),
      ),
    );

    // Exactly one may succeed.
    const fulfilled = results.filter((r) => r.status === 'fulfilled' && r.value.status === 201);
    const rejected = results.filter((r) => r.status === 'fulfilled' && r.value.status === 400);
    expect(fulfilled).toHaveLength(1);
    expect(rejected.length).toBeGreaterThanOrEqual(1);

    // Remaining stock must be zero.
    const stock = await request(app.getHttpServer())
      .get(`${api}/items/${TEST_CODE}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(stock.body.data.totalOnHand).toBe(0);
  }, 30000);

  it('parallel quotation creates never share a number', async () => {
    const numberPattern = /^Q\.AR#(\d+)-/;

    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app.getHttpServer())
          .post(`${api}/quotations`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ clientName: `Race Client ${i}`, email: `race${i}@example.com`, currency: 'USD' }),
      ),
    );

    const numbers = responses
      .filter((r) => r.status === 201)
      .map((r) => {
        const quoteNo: string = r.body.data.quoteNo;
        const match = quoteNo.match(numberPattern);
        return Number(match?.[1]);
      })
      .filter((n) => Number.isFinite(n));

    expect(numbers.length).toBe(5);
    expect(new Set(numbers).size).toBe(5); // all unique
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });
});
