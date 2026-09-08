import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { DataSource, In } from 'typeorm';
import dataSource from '../../config/typeorm.config';
import { Location } from '../../locations/entities/location.entity';
import { Item } from '../../items/entities/item.entity';
import { ItemStock } from '../../items/entities/item-stock.entity';
import { User } from '../../users/entities/user.entity';
import { NumberSequence } from '../../common/entities/number-sequence.entity';
import { LocationType } from '../../common/enums/location-type.enum';
import { Role } from '../../common/enums/role.enum';

const DEMO_ITEMS: Array<{ code: string; description: string; category: string; unitPrice: string; lowStockThreshold: number; showroomQty: number; storage1Qty: number }> = [
  { code: 'SOFA-AURORA', description: 'Aurora 3-seater sofa, bouclé', category: 'Sofas', unitPrice: '2450.00', lowStockThreshold: 1, showroomQty: 3, storage1Qty: 2 },
  { code: 'CHAIR-OSLO', description: 'Oslo lounge chair, oak frame', category: 'Chairs', unitPrice: '890.00', lowStockThreshold: 2, showroomQty: 4, storage1Qty: 1 },
  { code: 'TABLE-ORY', description: 'Ory dining table, walnut', category: 'Tables', unitPrice: '1700.00', lowStockThreshold: 1, showroomQty: 1, storage1Qty: 0 },
];

async function runSeeds(): Promise<void> {
  const connection: DataSource = await dataSource.initialize();
  const locations = connection.getRepository(Location);
  for (const location of [
    { name: 'Showroom', type: LocationType.Showroom, isPhysical: true },
    { name: 'Storage 1', type: LocationType.Storage, isPhysical: true },
    { name: 'Storage 2', type: LocationType.Storage, isPhysical: true },
    { name: 'Client', type: LocationType.Client, isPhysical: false },
  ]) {
    await locations.upsert(location, ['name']);
  }

  const users = connection.getRepository(User);
  if ((await users.count()) === 0) {
    // Explicit password via SEED_ADMIN_PASSWORD; otherwise a strong random one printed once.
    const password = process.env.SEED_ADMIN_PASSWORD && process.env.SEED_ADMIN_PASSWORD.length >= 8
      ? process.env.SEED_ADMIN_PASSWORD
      : crypto.randomBytes(12).toString('base64url');
    await users.save(users.create({ username: 'Admin', password: await bcrypt.hash(password, 12), fullName: 'System Administrator', role: Role.Admin, isActive: true }));
    console.warn(`DEFAULT ADMIN CREATED. Username: Admin | Password: ${password}`);
    console.warn('Store this password now — it is not recoverable. You can reset it later via PATCH /users/:id with { password }.');
  }

  // G2: seed item_stocks rows so a fresh database actually has stock.
  await seedItems(connection);

  // G4: pre-create numbering scopes so future SO/PO/INV/delivery docs can't race a first-use insert.
  await seedNumberSequences(connection);

  await connection.destroy();
}

async function seedItems(connection: DataSource): Promise<void> {
  const items = connection.getRepository(Item);
  const stocks = connection.getRepository(ItemStock);
  const locations = await connection.getRepository(Location).find();
  const showroom = locations.find((loc) => loc.name === 'Showroom');
  const storage1 = locations.find((loc) => loc.name === 'Storage 1');
  if (!showroom || !storage1) throw new Error('Seeds require Showroom and Storage 1 locations');

  for (const demo of DEMO_ITEMS) {
    let item = await items.findOne({ where: { code: demo.code } });
    if (!item) {
      item = await items.save(items.create({
        code: demo.code, description: demo.description, category: demo.category,
        unitPrice: demo.unitPrice, currency: 'USD', lowStockThreshold: demo.lowStockThreshold,
        isActive: true, initialQty: demo.showroomQty + demo.storage1Qty, qtySold: 0,
      }));
    } else {
      // Restore stock to the demo baseline on repeat seed runs.
      await stocks.delete({ item: { id: item.id } });
    }

    const rows = [
      { item, location: showroom, qtyOnHand: demo.showroomQty, qtyReserved: 0 },
      { item, location: storage1, qtyOnHand: demo.storage1Qty, qtyReserved: 0 },
    ].filter((row) => row.qtyOnHand > 0 || row.qtyReserved > 0);
    for (const row of rows) {
      await stocks.upsert(row, ['item', 'location']);
    }
  }
}

/** Numbering scope rows. The quotation scope keeps continuity with existing quote numbers for the year. */
async function seedNumberSequences(connection: DataSource): Promise<void> {
  const sequences = connection.getRepository(NumberSequence);
  const year = new Date().getFullYear().toString().slice(-2);
  const quotationScope = `quotation:${year}`;

  const existing = await sequences.find({ where: { scope: In([quotationScope, `sales-order:${year}`, `purchase-order:${year}`, `invoice:${year}`, `delivery:${year}`]) } });
  const existingScopes = new Set(existing.map((row) => row.scope));

  if (!existingScopes.has(quotationScope)) {
    const result = await connection.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(quote_no FROM 'Q\\.AR#([0-9]+)-') AS INTEGER)), 0) AS max_seq FROM quotations WHERE quote_no LIKE $1`,
      [`Q.AR#%-${year}`],
    );
    const nextValue = Number(result[0]?.max_seq ?? 0) + 1;
    await sequences.save(sequences.create({ scope: quotationScope, nextValue }));
  }

  for (const scope of [`sales-order:${year}`, `purchase-order:${year}`, `invoice:${year}`, `delivery:${year}`]) {
    if (!existingScopes.has(scope)) {
      await sequences.save(sequences.create({ scope, nextValue: 0 }));
    }
  }
}

void runSeeds();
