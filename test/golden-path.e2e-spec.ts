import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { QuotationsService } from './../src/quotations/quotations.service';
import { User } from './../src/users/entities/user.entity';
import { Item } from './../src/items/entities/item.entity';
import { Location } from './../src/locations/entities/location.entity';
import { LocationType } from './../src/common/enums/location-type.enum';
import { Role } from './../src/common/enums/role.enum';
import { SupplierPriceList } from './../src/purchase-orders/entities/supplier-price-list.entity';

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

  it('records an order-linked sale (consumes reserved) and a return against it', async () => {
    // Fresh item + order for self-contained stock math.
    await request(app.getHttpServer())
      .post(`${api}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'ORD-SALE',
        description: 'Order-linked sofa',
        category: 'Sofas',
        unitPrice: '900.00',
        initialQty: 4,
        initialLocationId: 1,
        lowStockThreshold: 1,
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post(`${api}/quotations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientName: 'Order-linked Client',
        email: 'ol@example.com',
        currency: 'USD',
      })
      .expect(201);
    const quotationId = created.body.data.id;
    await request(app.getHttpServer())
      .post(`${api}/quotation-details`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quotationId, itemCode: 'ORD-SALE', qty: 2, unitPrice: 900 })
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

    const reserved = await request(app.getHttpServer())
      .get(`${api}/items/ORD-SALE/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(reserved.body.data.totalOnHand).toBe(4);
    expect(reserved.body.data.totalAvailable).toBe(2);

    // Sale WITHOUT fromLocationId → consumes the order's reservations.
    const sale = await request(app.getHttpServer())
      .post(`${api}/transactions/sale`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemCode: 'ORD-SALE',
        qty: 2,
        customerName: 'Order Buyer',
        salesOrderId: orderId,
      })
      .expect(201);
    expect(sale.body.data.transactionType).toBe('Sale');
    expect(sale.body.data.salesOrderId).toBe(orderId);

    const after = await request(app.getHttpServer())
      .get(`${api}/items/ORD-SALE/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.data.totalOnHand).toBe(2);
    expect(after.body.data.totalAvailable).toBe(2); // reserved consumed with the sale

    const closed = await request(app.getHttpServer())
      .get(`${api}/sales-orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(closed.body.data.status).toBe('Closed');
    expect(closed.body.data.lines[0].qtyDelivered).toBe(2);

    // Return-against-order: previously sold unit comes back into stock.
    const ret = await request(app.getHttpServer())
      .post(`${api}/transactions/return`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemCode: 'ORD-SALE',
        toLocationId: 1,
        qty: 1,
        customerName: 'Order Buyer',
      })
      .expect(201);
    expect(ret.body.data.transactionType).toBe('Return');

    const returned = await request(app.getHttpServer())
      .get(`${api}/items/ORD-SALE/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(returned.body.data.totalOnHand).toBe(3);
  });

  it('raises exactly one low-stock inbox alert and marks it read', async () => {
    const itemCode = `LOW${Date.now()}`;
    await request(app.getHttpServer())
      .post(`${api}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: itemCode,
        description: 'Low stock window seat',
        category: 'Sofas',
        unitPrice: '500.00',
        initialQty: 5,
        initialLocationId: 1,
        lowStockThreshold: 3,
      })
      .expect(201);

    // Drop available stock from 5 to 2 (threshold 3) -> must alert.
    await request(app.getHttpServer())
      .post(`${api}/transactions/sale`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemCode,
        fromLocationId: 1,
        qty: 3,
        customerName: 'Alert Tester',
      })
      .expect(201);

    const inbox = (
      await request(app.getHttpServer())
        .get(`${api}/notifications`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
    ).body.data as Array<{
      id: number;
      type: string;
      payload: { itemCode?: string } | null;
      readAt: string | null;
    }>;
    const alerts = inbox.filter(
      (n) => n.type === 'stock-low' && n.payload?.itemCode === itemCode,
    );
    expect(alerts).toHaveLength(1);

    // Quiet period: another drop below threshold must NOT create a duplicate.
    await request(app.getHttpServer())
      .post(`${api}/transactions/sale`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        itemCode,
        fromLocationId: 1,
        qty: 1,
        customerName: 'Alert Tester',
      })
      .expect(201);

    const after = (
      await request(app.getHttpServer())
        .get(`${api}/notifications`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
    ).body.data as Array<{
      id: number;
      type: string;
      payload: { itemCode?: string } | null;
      readAt: string | null;
    }>;
    const alertsAfter = after.filter(
      (n) => n.type === 'stock-low' && n.payload?.itemCode === itemCode,
    );
    expect(alertsAfter).toHaveLength(1);

    const read = await request(app.getHttpServer())
      .patch(`${api}/notifications/${alerts[0].id}/read`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(read.body.data.readAt).toBeTruthy();
  });

  it('auto-expires Sent quotations past valid_until (daily job logic)', async () => {
    const itemCode = `EXP${Date.now()}`;
    await request(app.getHttpServer())
      .post(`${api}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: itemCode,
        description: 'Expiry test item',
        category: 'Sofas',
        unitPrice: '100.00',
        initialQty: 1,
        initialLocationId: 1,
        lowStockThreshold: 0,
      })
      .expect(201);

    const today = new Date();
    const past = new Date(today.getTime() - 86400000)
      .toISOString()
      .slice(0, 10);
    const future = new Date(today.getTime() + 86400000)
      .toISOString()
      .slice(0, 10);

    const createSent = async (validUntil: string): Promise<number> => {
      const created = await request(app.getHttpServer())
        .post(`${api}/quotations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clientName: 'Expiry Client',
          email: 'exp@example.com',
          currency: 'USD',
          validUntil,
        })
        .expect(201);
      const id: number = created.body.data.id;
      await request(app.getHttpServer())
        .post(`${api}/quotation-details`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quotationId: id, itemCode, qty: 1, unitPrice: 100 })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`${api}/quotations/${id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Sent' })
        .expect(200);
      return id;
    };

    const pastId = await createSent(past);
    const futureId = await createSent(future);

    const quotationsService = app.get(QuotationsService);
    const affected = await quotationsService.expireOutdated();
    expect(affected).toBeGreaterThanOrEqual(1);

    const pastQuote = await request(app.getHttpServer())
      .get(`${api}/quotations/${pastId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(pastQuote.body.data.status).toBe('Expired');

    const futureQuote = await request(app.getHttpServer())
      .get(`${api}/quotations/${futureId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(futureQuote.body.data.status).toBe('Sent');
  });

  afterAll(async () => {
    await app?.close();
  });
});

/**
 * Phase 3: purchasing — purchase orders, partial goods receipts (including
 * receiving into a brand-new 4th location), supplier returns with PO
 * reference, and the suggested-PO report with one-click draft creation.
 */
describe('Purchasing flow (Phase 3)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;

  const api = '/api/v1';

  let purCode: string;
  let purItemId: number;
  let supplierId: number;
  let poId: number;
  let poLineId: number;
  let storage3Id: number;
  let sugSupplierId: number;
  let sugItemId: number;

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
    for (const name of ['Showroom', 'Storage 1', 'Storage 2']) {
      if (!(await locationRepo.findOneBy({ name })))
        await locationRepo.save(
          locationRepo.create({
            name,
            type: LocationType.Storage,
            isPhysical: true,
          }),
        );
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

    await app.init();
    const login = await request(app.getHttpServer())
      .post(`${api}/auth/login`)
      .send({ username: 'e2e_admin', password: 'Admin1234test' })
      .expect(201);
    adminToken = login.body.data.accessToken;
  }, 60000);

  it('creates a supplier, a zero-stock item and a new (4th) location', async () => {
    purCode = `PUR${Date.now()}`;
    const sup = await request(app.getHttpServer())
      .post(`${api}/suppliers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Supplier ${Date.now()}`, country: 'Egypt' })
      .expect(201);
    supplierId = sup.body.data.id;

    const item = await request(app.getHttpServer())
      .post(`${api}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: purCode,
        description: 'Phase 3 purchase test item',
        category: 'Accessories',
        unitPrice: '80.00',
        lowStockThreshold: 1,
      })
      .expect(201);
    purItemId = item.body.data.id;

    const stock = await request(app.getHttpServer())
      .get(`${api}/items/${purCode}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(stock.body.data.totalOnHand).toBe(0);

    const storage = await request(app.getHttpServer())
      .post(`${api}/locations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Storage 3', type: 'Storage', isPhysical: true })
      .expect(201);
    storage3Id = storage.body.data.id;
  });

  it('creates a Draft PO, sends it, then partially receives into Storage 3', async () => {
    const create = await request(app.getHttpServer())
      .post(`${api}/purchase-orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        expectedDate: '2026-01-15',
        notes: 'Phase 3 golden path',
        lines: [{ itemCode: purCode, qty: 3, unitCost: 100 }],
      })
      .expect(201);
    expect(create.body.data.status).toBe('Draft');
    expect(create.body.data.purchaseNo).toMatch(/^PO-\d{2}-\d{4}$/);
    expect(create.body.data.lines).toHaveLength(1);
    expect(create.body.data.lines[0].unitCost).toBe('100.00');
    poId = create.body.data.id;
    poLineId = create.body.data.lines[0].id;

    const sent = await request(app.getHttpServer())
      .post(`${api}/purchase-orders/${poId}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(sent.body.data.status).toBe('Sent');

    const receipt = await request(app.getHttpServer())
      .post(`${api}/purchase-orders/${poId}/goods-receipts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'first partial',
        lines: [{ lineId: poLineId, qty: 1, toLocationId: storage3Id }],
      })
      .expect(201);
    expect(receipt.body.data.receiptNo).toMatch(/^GR-\d{2}-\d{4}$/);

    const po = await request(app.getHttpServer())
      .get(`${api}/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(po.body.data.status).toBe('PartiallyReceived');
    expect(po.body.data.lines[0].receivedQty).toBe(1);

    const stock = await request(app.getHttpServer())
      .get(`${api}/items/${purCode}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(stock.body.data.totalOnHand).toBe(1);
    expect(stock.body.data.totalAvailable).toBe(1);
  });

  it('blocks over-receipt beyond the ordered quantity', async () => {
    await request(app.getHttpServer())
      .post(`${api}/purchase-orders/${poId}/goods-receipts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lines: [{ lineId: poLineId, qty: 10, toLocationId: storage3Id }],
      })
      .expect(400);
  });

  it('second partial receipt completes the PO into Received with correct stock', async () => {
    const receipt = await request(app.getHttpServer())
      .post(`${api}/purchase-orders/${poId}/goods-receipts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lines: [{ lineId: poLineId, qty: 2, toLocationId: storage3Id }],
      })
      .expect(201);
    expect(receipt.body.data.lines).toHaveLength(1);

    const po = await request(app.getHttpServer())
      .get(`${api}/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(po.body.data.status).toBe('Received');
    expect(po.body.data.lines[0].receivedQty).toBe(3);
    expect(po.body.data.receipts).toHaveLength(2);

    const stock = await request(app.getHttpServer())
      .get(`${api}/items/${purCode}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(stock.body.data.totalOnHand).toBe(3);
    expect(stock.body.data.totalAvailable).toBe(3);
  });

  it('records NewArrival transactions with the PO reference and populates the price list', async () => {
    const tx = await request(app.getHttpServer())
      .get(`${api}/transactions?itemCode=${purCode}&type=Adjustment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const txData = tx.body.data as Array<{
      adjustmentReason: string | null;
      purchaseOrderId: number | null;
      qty: number;
      adjustmentType: string | null;
    }>;
    const arrivals = txData.filter(
      (t) => t.adjustmentReason === 'NewArrival' && t.purchaseOrderId === poId,
    );
    expect(arrivals).toHaveLength(2);
    expect(arrivals.map((t) => t.qty)).toEqual([1, 2]);

    const price = await dataSource.getRepository(SupplierPriceList).findOne({
      where: { supplier: { id: supplierId }, item: { id: purItemId } },
    });
    expect(price).toBeDefined();
    expect(price?.cost).toBe('100.00');
  });

  it('returns goods to the supplier: stock decreases, Adjustment/Decrease with PO reference', async () => {
    await request(app.getHttpServer())
      .post(`${api}/purchase-orders/${poId}/return-to-supplier`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lines: [{ lineId: poLineId, qty: 1, fromLocationId: storage3Id }],
      })
      .expect(201);

    const stock = await request(app.getHttpServer())
      .get(`${api}/items/${purCode}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(stock.body.data.totalOnHand).toBe(2);

    const tx = await request(app.getHttpServer())
      .get(`${api}/transactions?itemCode=${purCode}&type=Adjustment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const txData = tx.body.data as Array<{
      adjustmentReason: string | null;
      purchaseOrderId: number | null;
      qty: number;
      adjustmentType: string | null;
    }>;
    const returns = txData.filter(
      (t) =>
        t.adjustmentReason === 'SupplierReturn' && t.purchaseOrderId === poId,
    );
    expect(returns).toHaveLength(1);
    expect(returns[0].qty).toBe(1);
    expect(returns[0].adjustmentType).toBe('Decrease');
  });

  it('a brand-linked supplier low-stock item appears in the suggestions report', async () => {
    const brand = await request(app.getHttpServer())
      .post(`${api}/brands`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Brand ${Date.now()}`, country: 'Egypt' })
      .expect(201);
    const sup = await request(app.getHttpServer())
      .post(`${api}/suppliers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E Sourcing ${Date.now()}`,
        brandId: brand.body.data.id,
      })
      .expect(201);
    sugSupplierId = sup.body.data.id;

    const item = await request(app.getHttpServer())
      .post(`${api}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `SUG${Date.now()}`,
        description: 'Suggested reorder item',
        brandId: brand.body.data.id,
        category: 'Accessories',
        unitPrice: '60.00',
        lowStockThreshold: 2,
      })
      .expect(201);
    sugItemId = item.body.data.id;

    const suggestions = (
      await request(app.getHttpServer())
        .get(`${api}/purchase-orders/suggestions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
    ).body.data as Array<{
      itemId: number;
      available: number;
      lowStockThreshold: number;
      supplierId: number | null;
    }>;
    const row = suggestions.find((r) => r.itemId === sugItemId);
    expect(row).toBeDefined();
    expect(row?.available).toBe(0);
    expect(row?.lowStockThreshold).toBe(2);
    expect(row?.supplierId).toBe(sugSupplierId);
  });

  it('one-click creation drafts a PO from the suggestions', async () => {
    const created = await request(app.getHttpServer())
      .post(`${api}/purchase-orders/from-suggestions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemIds: [sugItemId] })
      .expect(201);
    expect(Array.isArray(created.body.data)).toBe(true);
    expect(created.body.data).toHaveLength(1);
    const order = created.body.data[0];
    expect(order.status).toBe('Draft');
    expect(order.supplier.id).toBe(sugSupplierId);
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].item.id).toBe(sugItemId);
    expect(order.lines[0].qty).toBe(2);
  });

  afterAll(async () => {
    await app?.close();
  });
});

describe('Finance-lite & reports (Phase 4)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;

  const api = '/api/v1';

  let finCode: string;
  let finItemId: number;
  let supplierId: number;
  let clientId: number;
  let clientName: string;
  let orderId: number;
  let orderLineId: number;
  let invoiceANo: string;
  let invoiceAId: number;
  let invoiceBNo: string;
  let invoiceBId: number;
  let invoiceCId: number;

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
    for (const name of ['Showroom', 'Storage 1', 'Storage 2']) {
      if (!(await locationRepo.findOneBy({ name })))
        await locationRepo.save(
          locationRepo.create({
            name,
            type: LocationType.Storage,
            isPhysical: true,
          }),
        );
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

    await app.init();
    const login = await request(app.getHttpServer())
      .post(`${api}/auth/login`)
      .send({ username: 'e2e_admin', password: 'Admin1234test' })
      .expect(201);
    adminToken = login.body.data.accessToken;
  }, 60000);

  it('stocks an item with a known cost through a PO + receipt', async () => {
    finCode = `FIN${Date.now()}`;
    const sup = await request(app.getHttpServer())
      .post(`${api}/suppliers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Fin Supplier ${Date.now()}`, country: 'Egypt' })
      .expect(201);
    supplierId = sup.body.data.id;

    const item = await request(app.getHttpServer())
      .post(`${api}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: finCode,
        description: 'Phase 4 finance item',
        category: 'Accessories',
        unitPrice: '80.00',
      })
      .expect(201);
    finItemId = item.body.data.id;

    const storage = await dataSource.getRepository(Location).findOneBy({
      name: 'Storage 1',
    });
    expect(storage).toBeDefined();
    const locationId = storage!.id;

    const po = await request(app.getHttpServer())
      .post(`${api}/purchase-orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        expectedDate: '2026-01-15',
        lines: [{ itemCode: finCode, qty: 5, unitCost: 80 }],
      })
      .expect(201);
    const poId = po.body.data.id;
    const poLineId = po.body.data.lines[0].id;
    await request(app.getHttpServer())
      .post(`${api}/purchase-orders/${poId}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const receipt = await request(app.getHttpServer())
      .post(`${api}/purchase-orders/${poId}/goods-receipts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ lines: [{ lineId: poLineId, qty: 5, toLocationId: locationId }] })
      .expect(201);
    expect(receipt.body.data.receiptNo).toMatch(/^GR-\d{2}-\d{4}$/);

    const price = await dataSource.getRepository(SupplierPriceList).findOne({
      where: { supplier: { id: supplierId }, item: { id: finItemId } },
    });
    expect(price?.cost).toBe('80.00');
  });

  it('creates a client and a Draft sales order for 3 units at 250', async () => {
    const client = await request(app.getHttpServer())
      .post(`${api}/clients`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Finance Client ${Date.now()}` })
      .expect(201);
    clientId = client.body.data.id;
    clientName = client.body.data.name;

    const order = await request(app.getHttpServer())
      .post(`${api}/sales-orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId, notes: 'Phase 4 golden path' })
      .expect(201);
    orderId = order.body.data.id;

    const line = await request(app.getHttpServer())
      .post(`${api}/sales-orders/${orderId}/lines`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ itemCode: finCode, qty: 3, unitPrice: 250 })
      .expect(201);
    orderLineId = line.body.data.id;
    expect(line.body.data.unitPrice).toBe('250.00');
  });

  it('confirms the order and delivers in full (auto-Closes)', async () => {
    await request(app.getHttpServer())
      .post(`${api}/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const delivery = await request(app.getHttpServer())
      .post(`${api}/sales-orders/${orderId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ lines: [{ salesOrderLineId: orderLineId, qty: 3 }] })
      .expect(201);
    expect(delivery.body.data.deliveryNo).toMatch(/^DEL-\d{2}-\d{4}$/);

    const order = await request(app.getHttpServer())
      .get(`${api}/sales-orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(order.body.data.status).toBe('Closed');
    expect(order.body.data.lines[0].qtyDelivered).toBe(3);

    const stock = await request(app.getHttpServer())
      .get(`${api}/items/${finCode}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(stock.body.data.totalOnHand).toBe(2);
  });

  it('creates an invoice from the delivered order with frozen totals', async () => {
    const invoice = await request(app.getHttpServer())
      .post(`${api}/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ salesOrderId: orderId })
      .expect(201);
    const data = invoice.body.data;
    expect(data.invoiceNo).toMatch(/^INV-\d{2}-\d{4}$/);
    expect(data.status).toBe('Open');
    expect(data.client.id).toBe(clientId);
    expect(data.clientName).toBe(clientName);
    expect(data.salesOrder.id).toBe(orderId);
    expect(data.subtotal).toBe('750.00');
    expect(data.total).toBe('750.00');
    expect(data.lines).toHaveLength(1);
    expect(data.lines[0].qty).toBe(3);
    expect(data.lines[0].unitPrice).toBe('250.00');
    expect(data.lines[0].totalPrice).toBe('750.00');
    invoiceANo = data.invoiceNo;
    invoiceAId = data.id;
  });

  it('order detail shows the margin vs the latest known cost', async () => {
    const order = await request(app.getHttpServer())
      .get(`${api}/sales-orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(order.body.data.margin).toEqual({
      revenue: 750,
      cost: 240,
      margin: 510,
    });
  });

  it('stock valuation values on-hand qty at the latest cost', async () => {
    const report = await request(app.getHttpServer())
      .get(`${api}/reports/stock-valuation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const rows = report.body.data.rows as Array<{
      itemCode: string;
      qtyOnHand: number;
      unitCost: number;
      value: number;
    }>;
    const row = rows.find((r) => r.itemCode === finCode);
    expect(row).toBeDefined();
    expect(row?.qtyOnHand).toBe(2);
    expect(row?.unitCost).toBe(80);
    expect(row?.value).toBe(160);
    expect(report.body.data.grandTotal).toBeGreaterThanOrEqual(160);
  });

  it('creates a manual invoice and a credit note for the same client', async () => {
    const manual = await request(app.getHttpServer())
      .post(`${api}/invoices/manual`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientId,
        lines: [
          { description: 'Design consultation', qty: 1, unitPrice: '100.00' },
        ],
      })
      .expect(201);
    expect(manual.body.data.total).toBe('100.00');
    expect(manual.body.data.clientName).toBe(clientName);
    invoiceBNo = manual.body.data.invoiceNo;
    invoiceBId = manual.body.data.id;

    const credit = await request(app.getHttpServer())
      .post(`${api}/invoices/manual`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        clientId,
        lines: [{ description: 'Refund', qty: 1, unitPrice: '-50.00' }],
      })
      .expect(201);
    expect(credit.body.data.total).toBe('-50.00');
    invoiceCId = credit.body.data.id;
  });

  it('allocates a partial payment FIFO against the oldest invoice first', async () => {
    const payment = await request(app.getHttpServer())
      .post(`${api}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId, amount: 300, method: 'bank' })
      .expect(201);
    expect(payment.body.data.paymentNo).toMatch(/^PAY-\d{2}-\d{4}$/);
    expect(payment.body.data.amount).toBe('300.00');
    expect(payment.body.data.allocations).toHaveLength(1);
    expect(payment.body.data.allocations[0].invoice.id).toBe(invoiceAId);
    expect(payment.body.data.allocations[0].amount).toBe('300.00');

    const invA = await request(app.getHttpServer())
      .get(`${api}/invoices/${invoiceAId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(invA.body.data.status).toBe('PartiallyPaid');
    expect(invA.body.data.allocated).toBe(300);
    expect(invA.body.data.balance).toBe(450);

    const invB = await request(app.getHttpServer())
      .get(`${api}/invoices/${invoiceBId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(invB.body.data.status).toBe('Open');
    expect(invB.body.data.balance).toBe(100);
  });

  it('AR aging buckets the open balances and exports a CSV', async () => {
    const aging = await request(app.getHttpServer())
      .get(`${api}/invoices/aging`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const rows = aging.body.data.rows as Array<{
      invoiceId: number;
      invoiceNo: string;
      balance: number;
      total: number;
      allocated: number;
      bucket: string;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].invoiceNo).toBe(invoiceANo);
    expect(rows[0].balance).toBe(450);
    expect(rows[1].invoiceNo).toBe(invoiceBNo);
    expect(rows[1].balance).toBe(100);
    expect(rows.find((r) => r.invoiceId === invoiceCId)).toBeUndefined();
    const buckets = aging.body.data.buckets as Array<{
      bucket: string;
      total: number;
    }>;
    expect(buckets.find((b) => b.bucket === '0-30')?.total).toBe(550);
    expect(aging.body.data.grandTotal).toBe(550);

    const csv = await request(app.getHttpServer())
      .get(`${api}/invoices/aging.csv`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('invoiceNo');
    expect(csv.text).toContain(invoiceANo);
  });

  it('rejects overpayment beyond the open balance (422, rollback)', async () => {
    await request(app.getHttpServer())
      .post(`${api}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId, amount: 1000 })
      .expect(422);

    const invA = await request(app.getHttpServer())
      .get(`${api}/invoices/${invoiceAId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(invA.body.data.balance).toBe(450);
  });

  it('a settling payment clears both invoices and empties the aging report', async () => {
    const settle = await request(app.getHttpServer())
      .post(`${api}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId, amount: 550 })
      .expect(201);
    expect(settle.body.data.allocations).toHaveLength(2);

    const aging = await request(app.getHttpServer())
      .get(`${api}/invoices/aging`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(aging.body.data.rows).toHaveLength(0);
    expect(aging.body.data.grandTotal).toBe(0);

    const invA = await request(app.getHttpServer())
      .get(`${api}/invoices/${invoiceAId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(invA.body.data.status).toBe('Paid');
    const invB = await request(app.getHttpServer())
      .get(`${api}/invoices/${invoiceBId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(invB.body.data.status).toBe('Paid');
  });

  it('refuses to invoice an order that is not Delivered or Closed', async () => {
    const draft = await request(app.getHttpServer())
      .post(`${api}/sales-orders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${api}/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ salesOrderId: draft.body.data.id })
      .expect(400);
  });

  afterAll(async () => {
    await app?.close();
  });
});
