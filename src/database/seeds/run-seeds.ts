import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import dataSource from '../../config/typeorm.config';
import { Location } from '../../locations/entities/location.entity';
import { User } from '../../users/entities/user.entity';
import { LocationType } from '../../common/enums/location-type.enum';
import { Role } from '../../common/enums/role.enum';

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
    await users.save(users.create({ username: 'Admin', password: await bcrypt.hash('123456', 12), fullName: 'System Administrator', role: Role.Admin, isActive: true }));
    console.warn('DEFAULT ADMIN CREATED. Username: Admin | Password: 123456 | CHANGE THIS IMMEDIATELY');
  }
  await connection.destroy();
}

void runSeeds();