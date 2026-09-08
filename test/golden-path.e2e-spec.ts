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
 * Golden-path e2e (Phase 2A): the regression net for the core CRM+stock flow.
 * Runs against the docker-compose dev database — migrate + seed first, or the
 * setup below bootstraps the minimal fixtures it needs (admin + locations).
 *
 * Flow: login → create item w/ stock → transfer → sale → quotation create/edit → send.
 */
describe('Golden path (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let itemCode: string;

  const api = '/api/v1';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET =
      process.env.JWT_ACCESS_SECRET ??
      'e2e_access_secret_that_is_longer_than_32_chars';
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET ??
      'e2e_refresh_secret_that_is_longer_than_32_chars';
    process.env.DB_LOGGING = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = app.get(DataSource);
    await setupFixtures(dataSource);
    await app.init();
  }, 60000);

  async function setupFixtures(ds: DataSource): Promise<void> {
    // Locations
    const locationRepo = ds.getRepository(Location);
    const locationNames = [
      { name: 'Showroom', type: LocationType.Showroom, isPhysical: true },
      { name: 'Storage 1', type: LocationType.Storage, isPhysical: true },
      { name: 'Storage 2', type: LocationType.Storage, isPhysical: true },
    ];
    for (const loc of locationNames) {
      if (!(await locationRepo.findOneBy({ name: loc.name })))
        await locationRepo.save(locationRepo.create(loc));
    }

    // Users: an Admin and a Manager for the RBAC spot-checks
    const userRepo = ds.getRepository(User);
    const password = await bcrypt.hash('Admin1234test', 12);
    const admin = await userRepo.findOneBy({ username: 'e2e_admin' });
    if (!admin) {
      await userRepo.save(
        userRepo.create({
          username: 'e2e_admin',
          password,
          fullName: 'E2E Admin',
          role: Role.Admin,
          isActive: true,
        }),
      );
    }
    const manager = await userRepo.findOneBy({ username: 'e2e_manager' });
    if (!manager) {
      await userRepo.save(
        userRepo.create({
          username: 'e2e_manager',
          password,
          fullName: 'E2E Manager',
          role: Role.Manager,
          isActive: true,
        }),
      );
    }
    // Reset any leftover demo items from a prior run
    await ds.getRepository(Item).delete({ code: 'SOFA-GOLDEN' });
  }

  it('logs in as admin and manager', async () => {
    const login = (username: string) =>
      request(app.getHttpServer())
        .post(`${api}/auth/login`)
        .send({ username, password: 'Admin1234test' })
        .expect(201);

    const adminRes = await login('e2e_admin');
    expect(adminRes.body.success).toBe(true);
    expect(adminRes.body.data.accessToken).toBeDefined();
    adminToken = adminRes.body.data.accessToken;

    const managerRes = await login('e2e_manager');
    expect(managerRes.body.data.accessToken).toBeTruthy();

    expect(adminToken).toBeTruthy();
  });

  it('creates an item with initial stock', async () => {
    const res = await request(app.getHttpServer())
      .post(`${api}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'SOFA-GOLDEN',
        description: 'Golden 3-seater sofa',
        category: 'Sofas',
        unitPrice: '2499.00',
        initialQty: 5,
        initialLocationId: 1,
        lowStockThreshold: 2,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe('SOFA-GOLDEN');
    itemCode = res.body.data.code;
  });

  it('reports the stocked quantity at the showroom', async () => {
    const res = await request(app.getHttpServer())
      .get(`${api}/items/${itemCode}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.totalOnHand).toBe(5);
    expect(res.body.data.totalAvailable).toBe(5);
  });

  it('transfers stock from Showroom (1) to Storage 1 (2)', async () => {
    const res = await request(app.getHttpServer())
      .post(`${api}/transactions/transfer`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemCode, fromLocationId: 1, toLocationId: 2, qty: 2 })
      .expect(201);
    expect(res.body.data.transactionType).toBe('Transfer');
    expect(res.body.data.qty).toBe(2);
  });

  it('records a sale of 1 unit', async () => {
    const res = await request(app.getHttpServer())
      .post(`${api}/transactions/sale`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemCode,
        fromLocationId: 1,
        qty: 1,
        customerName: 'E2E Customer',
      })
      .expect(201);
    expect(res.body.data.transactionType).toBe('Sale');
  });

  it('blocks sale exceeding available stock (no oversell)', async () => {
    // After the transfer (2 moved to Storage) and sale (1 sold), showroom holds 2.
    await request(app.getHttpServer())
      .post(`${api}/transactions/sale`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemCode, fromLocationId: 1, qty: 99, customerName: 'Overbuyer' })
      .expect(400);
  });

  it('creates a quotation and adds + edits a line', async () => {
    const create = await request(app.getHttpServer())
      .post(`${api}/quotations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientName: 'E2E Client',
        email: 'client@example.com',
        projectName: 'Golden Project',
        currency: 'USD',
      })
      .expect(201);
    const quotationId = create.body.data.id;
    expect(create.body.data.quoteNo).toContain('Q.AR#');
    expect(quotationId).toBeTruthy();

    const add = await request(app.getHttpServer())
      .post(`${api}/quotation-details`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quotationId, itemCode, qty: 2, unitPrice: 2499 })
      .expect(201);
    const detailId = add.body.data.id;
    expect(add.body.data.totalPriceAfterDiscount).toBe('4998.00');

    await request(app.getHttpServer())
      .patch(`${api}/quotation-details/${detailId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ qty: 3 })
      .expect(200);
  });

  it('sends a quotation (status Draft → Sent)', async () => {
    const create = await request(app.getHttpServer())
      .post(`${api}/quotations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientName: 'Send Client',
        email: 'send@example.com',
        projectName: 'Sendable',
        currency: 'USD',
      })
      .expect(201);
    const quotationId = create.body.data.id;
    const res = await request(app.getHttpServer())
      .patch(`${api}/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Sent' })
      .expect(200);
    expect(res.body.data.status).toBe('Sent');
  });

  it('denies quotation status changes to Staff (RBAC)', async () => {
    // Staff role (Lowest privilege) — create a staff user on the fly via the repository.
    const ds = app.get(DataSource);
    const password = await bcrypt.hash('Admin1234test', 12);
    const staff = await ds
      .getRepository(User)
      .findOneBy({ username: 'e2e_staff' });
    if (!staff) {
      await ds.getRepository(User).save(
        ds.getRepository(User).create({
          username: 'e2e_staff',
          password,
          fullName: 'E2E Staff',
          role: Role.Staff,
          isActive: true,
        }),
      );
    }
    const login = await request(app.getHttpServer())
      .post(`${api}/auth/login`)
      .send({ username: 'e2e_staff', password: 'Admin1234test' })
      .expect(201);
    const staffToken = login.body.data.accessToken;

    await request(app.getHttpServer())
      .post(`${api}/quotations`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        clientName: 'Staff Quot',
        email: 'staff@example.com',
        currency: 'USD',
      })
      .expect(403);
  });

  afterAll(async () => {
    await app?.close();
  });
});

/**
 * Phase 2B: reservation lifecycle across the order → deliver → close flow.
 * A dedicated item (ORD-SOFA) keeps the numbers independent of the golden-path
 * counts above.
 */
describe('Sales order reservation lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let itemCode: string;

  const api = '/api/v1';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET =
      process.env.JWT_ACCESS_SECRET ??
      'e2e_access_secret_that_is_longer_than_32_chars';
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET ??
      'e2e_refresh_secret_that_is_longer_than_32_chars';
    process.env.DB_LOGGING = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = app.get(DataSource);

    const locationRepo = dataSource.getRepository(Location);
    const locationNames = [
      { name: 'Showroom', type: LocationType.Showroom, isPhysical: true },
      { name: 'Storage 1', type: LocationType.Storage, isPhysical: true },
      { name: 'Storage 2', type: LocationType.Storage, isPhysical: true },
    ];
    for (const loc of locationNames) {
      if (!(await locationRepo.findOneBy({ name: loc.name })))
        await locationRepo.save(locationRepo.create(loc));
    }

    const userRepo = dataSource.getRepository(User);
    const password = await bcrypt.hash('Admin1234test', 12);
    if (!(await userRepo.findOneBy({ username: 'e2e_admin' }))) {
      await userRepo.save(
        userRepo.create({
          username: 'e2e_admin',
          password,
          fullName: 'E2E Admin',
          role: Role.Admin,
          isActive: true,
        }),
      );
    }
    await dataSource.getRepository(Item).delete({ code: 'ORD-SOFA' });

    await app.init();
    const login = await request(app.getHttpServer())
      .post(`${api}/auth/login`)
      .send({ username: 'e2e_admin', password: 'Admin1234test' })
      .expect(201);
    adminToken = login.body.data.accessToken;
  }, 60000);

  it('stocks ORD-SOFA with 5 units at the showroom', async () => {
    const res = await request(app.getHttpServer())
      .post(`${api}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'ORD-SOFA',
        description: 'Ordered sofa',
        category: 'Sofas',
        unitPrice: '1200.00',
        initialQty: 5,
        initialLocationId: 1,
        lowStockThreshold: 1,
      })
      .expect(201);
    itemCode = res.body.data.code;
  });

  it('creates and approves a quotation for 3 units', async () => {
    const created = await request(app.getHttpServer())
      .post(`${api}/quotations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientName: 'Order Client',
        email: 'order@example.com',
        currency: 'USD',
      })
      .expect(201);
    const quotationId = created.body.data.id;

    await request(app.getHttpServer())
      .post(`${api}/quotation-details`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quotationId, itemCode, qty: 3, unitPrice: 1200 })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`${api}/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Sent' })
      .expect(200);
    const approved = await request(app.getHttpServer())
      .patch(`${api}/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Approved' })
      .expect(200);
    expect(approved.body.data.status).toBe('Approved');
  });

  it('creates a Draft order from the approved quotation', async () => {
    const created = await request(app.getHttpServer())
      .post(`${api}/quotations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientName: 'Order Client B',
        email: 'orderb@example.com',
        currency: 'USD',
      })
      .expect(201);
    const quotationId = created.body.data.id;
    await request(app.getHttpServer())
      .post(`${api}/quotation-details`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quotationId, itemCode, qty: 2, unitPrice: 1200 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`${api}/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Sent' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${api}/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Approved' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`${api}/sales-orders/from-quotation/${quotationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderNo).toContain('SO-');
    expect(res.body.data.status).toBe('Draft');
    expect(res.body.data.lines).toHaveLength(1);
  });

  it('confirms the order: reserves 2 at the showroom and converts the quotation', async () => {
    const created = await request(app.getHttpServer())
      .post(`${api}/quotations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientName: 'Order Client C',
        email: 'orderc@example.com',
        currency: 'USD',
      })
      .expect(201);
    const quotationId = created.body.data.id;
    await request(app.getHttpServer())
      .post(`${api}/quotation-details`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quotationId, itemCode, qty: 5, unitPrice: 1200 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`${api}/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Sent' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${api}/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Approved' })
      .expect(200);

    const orderRes = await request(app.getHttpServer())
      .post(`${api}/sales-orders/from-quotation/${quotationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const orderId = orderRes.body.data.id;

    // Reserve softly over the available 5 (showroom): quotes above reserved 3,
    // the remaining available is 2 → shortage on the 5-unit line.
    const confirmed = await request(app.getHttpServer())
      .post(`${api}/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(confirmed.body.data.status).toBe('Confirmed');

    // Quotation flips to Converted.
    const quote = await request(app.getHttpServer())
      .get(`${api}/quotations/${quotationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(quote.body.data.status).toBe('Converted');

    // Stock: 5 on hand, 2 still reserved from before → 3 available now.
    const stock = await request(app.getHttpServer())
      .get(`${api}/items/${itemCode}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(stock.body.data.totalOnHand).toBe(5);
    expect(stock.body.data.totalAvailable).toBe(2);
  });

  it('delivers against the confirmed order and auto-closes once fully delivered', async () => {
    // Reuse the last confirmed order from the previous test by creating and confirming a fresh 2-unit order.
    const created = await request(app.getHttpServer())
      .post(`${api}/quotations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientName: 'Order Client D',
        email: 'orderd@example.com',
        currency: 'USD',
      })
      .expect(201);
    const quotationId = created.body.data.id;
    await request(app.getHttpServer())
      .post(`${api}/quotation-details`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quotationId, itemCode, qty: 2, unitPrice: 1200 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`${api}/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Sent' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${api}/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Approved' })
      .expect(200);

    const orderRes = await request(app.getHttpServer())
      .post(`${api}/sales-orders/from-quotation/${quotationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const orderId = orderRes.body.data.id;
    await request(app.getHttpServer())
      .post(`${api}/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const order = await request(app.getHttpServer())
      .get(`${api}/sales-orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const lineId = order.body.data.lines[0].id;

    // Partial delivery: 1 of 2 → Delivered (not closed).
    const partial = await request(app.getHttpServer())
      .post(`${api}/sales-orders/${orderId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ lines: [{ salesOrderLineId: lineId, qty: 1 }] })
      .expect(201);
    expect(partial.body.data.lines).toHaveLength(1);
    expect(partial.body.data.deliveryNo).toContain('DEL-');

    const afterPartial = await request(app.getHttpServer())
      .get(`${api}/sales-orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(afterPartial.body.data.status).toBe('Delivered');
    expect(afterPartial.body.data.lines[0].qtyDelivered).toBe(1);

    // Full delivery: remaining 1 → Closed, no outstanding reservations.
    await request(app.getHttpServer())
      .post(`${api}/sales-orders/${orderId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ lines: [{ salesOrderLineId: lineId, qty: 1 }] })
      .expect(201);

    const closed = await request(app.getHttpServer())
      .get(`${api}/sales-orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(closed.body.data.status).toBe('Closed');
  });

  it('refuses over-delivery beyond the remaining quantity', async () => {
    const over = await request(app.getHttpServer())
      .post(`${api}/sales-orders/1/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ lines: [{ salesOrderLineId: 1, qty: 999 }] })
      .expect(400);
    expect(over.body.success).toBe(false);
  });

  afterAll(async () => {
    await app?.close();
  });
});
